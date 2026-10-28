import 'dart:convert';
import 'package:flutter/material.dart';
import 'owner_api.dart';
import 'job_photos.dart';

String dollars(dynamic cents) =>
    '\$${((cents as num? ?? 0) / 100).toStringAsFixed(2)}';
Map<String, dynamic> payload(Map row) => row['data'] is String
    ? Map<String, dynamic>.from(jsonDecode(row['data'] as String) as Map)
    : Map<String, dynamic>.from(row['data'] as Map? ?? {});

class WorkspaceScreen extends StatefulWidget {
  const WorkspaceScreen({super.key, required this.api, required this.section});
  final OwnerApi api;
  final String section;
  @override
  State<WorkspaceScreen> createState() => _WorkspaceState();
}

class _WorkspaceState extends State<WorkspaceScreen> {
  Object? data;
  String? error;
  bool busy = false;
  int year = DateTime.now().year, quarter = (DateTime.now().month - 1) ~/ 3 + 1;
  final search = TextEditingController();
  String get path {
    switch (widget.section) {
      case 'Customers':
        return '/api/owner/customers?q=${Uri.encodeQueryComponent(search.text)}';
      case 'Vehicles':
        return '/api/owner/vehicles?q=${Uri.encodeQueryComponent(search.text)}';
      case 'Materials':
        return '/api/owner/materials';
      case 'Estimates & invoices':
      case 'Payment Center':
        return '/api/owner/documents';
      case 'Financial Center':
        final start = DateTime.utc(year, (quarter - 1) * 3 + 1),
            end = DateTime.utc(year, quarter * 3 + 1);
        return '/api/owner/finance/report?${Uri(queryParameters: {'from': start.toIso8601String(), 'to': end.toIso8601String()}).query}';
      case 'Reviews':
        return '/api/owner/reviews';
      default:
        return '/api/owner/dashboard';
    }
  }

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  Future<void> run(Future<void> Function() action) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> load() => run(() async {
    final value = await widget.api.workspace(path);
    if (mounted) setState(() => data = value);
  });
  Future<void> save(
    String endpoint,
    Map<String, dynamic> body, {
    String method = 'POST',
    String? key,
  }) async {
    await widget.api.workspace(endpoint, method: method, body: body, key: key);
    await load();
  }

  Future<Map<String, String>?> form(
    String title,
    Map<String, String> fields,
  ) async {
    final controls = fields.map(
      (k, v) => MapEntry(k, TextEditingController(text: v)),
    );
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final e in controls.entries)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: TextField(
                    controller: e.value,
                    decoration: InputDecoration(labelText: e.key),
                  ),
                ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(
              context,
              controls.map((k, v) => MapEntry(k, v.text)),
            ),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    // Dialog fields are disposed after its closing animation.
    await Future<void>.delayed(const Duration(milliseconds: 250));
    for (final c in controls.values) {
      c.dispose();
    }
    return result;
  }

  int cents(String? s) => (double.parse(s ?? '0') * 100).round();
  Future<void> addMaterial() async {
    final f = await form('Add material', {
      'Product': '',
      'Quantity': '1',
      'Unit (oz/gallon/bottle)': 'oz',
      'Unit cost': '0',
      'Markup percent': '0',
      'Taxable (yes/no)': 'no',
    });
    if (f == null) return;
    await save('/api/owner/materials', {
      'product': f['Product'],
      'quantityMillis': (double.parse(f['Quantity']!) * 1000).round(),
      'unit': f['Unit (oz/gallon/bottle)'],
      'costCents': cents(f['Unit cost']),
      'markupBps': (double.parse(f['Markup percent']!) * 100).round(),
      'taxable': f['Taxable (yes/no)'] == 'yes',
    });
  }

  Future<void> addDocument() async {
    final customers = await widget.api.workspace('/api/owner/customers') as Map;
    if (!mounted) return;
    final options = (customers['records'] as List).cast<Map>();
    if (options.isEmpty) {
      throw const ApiFailure(409, 'Create a customer through a booking first.');
    }
    final customer = await showDialog<Map>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Choose customer'),
        children: [
          for (final row in options)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(context, row),
              child: Text(
                '${payload(row)['firstName']} ${payload(row)['lastName']}',
              ),
            ),
        ],
      ),
    );
    if (customer == null || !mounted) return;
    final f = await form('Create draft', {
      'Kind (estimate/invoice)': 'estimate',
      'Description': 'Interior detailing',
      'Quantity': '1',
      'Unit price': '0',
      'Estimated unit material cost': '0',
      'Tax rate percent': '0',
      'Taxable (yes/no)': 'no',
      'Notes': '',
    });
    if (f == null) return;
    await save('/api/owner/documents', {
      'kind': f['Kind (estimate/invoice)'],
      'customerId': customer['id'],
      'taxBps': (double.parse(f['Tax rate percent']!) * 100).round(),
      'notes': f['Notes'],
      'lines': [
        {
          'description': f['Description'],
          'unit': 'service',
          'quantityMillis': (double.parse(f['Quantity']!) * 1000).round(),
          'unitPriceCents': cents(f['Unit price']),
          'unitCostCents': cents(f['Estimated unit material cost']),
          'taxable': f['Taxable (yes/no)'] == 'yes',
        },
      ],
    });
  }

  Future<void> recordMoney(Map? invoice) async {
    final expense = invoice == null;
    final f = await form(
      expense ? 'Record expense' : 'Record payment already received',
      {
        'Amount': '0',
        if (!expense) 'Tip': '0',
        'Method (cash/check/bank/external_card_reference)': 'cash',
        if (expense)
          'Category (materials/operating/tax_remittance/other)': 'operating',
        'Note': '',
      },
    );
    if (f == null) return;
    // Stable for the complete request. No automatic retry with a different key.
    final key =
        'native-${DateTime.now().microsecondsSinceEpoch}-${invoice?['id'] ?? 'expense'}';
    await save('/api/owner/finance/events', {
      'kind': expense ? 'expense' : 'payment',
      'documentId': invoice?['id'],
      'amountCents': cents(f['Amount']),
      'tipCents': expense ? 0 : cents(f['Tip']),
      'method': f['Method (cash/check/bank/external_card_reference)'],
      'category': f['Category (materials/operating/tax_remittance/other)'],
      'note': f['Note'],
      'occurredAt': DateTime.now().toUtc().toIso8601String(),
    }, key: key);
  }

  Future<void> editRecord(Map row) async {
    final d = payload(row),
        f = await form(
          'Edit ${widget.section.toLowerCase()}',
          d.map((k, v) => MapEntry(k, v.toString())),
        );
    if (f == null) return;
    final values = <String, dynamic>{...f};
    if (widget.section == 'Vehicles') values['year'] = int.parse(f['year']!);
    await save('/api/owner/${widget.section.toLowerCase()}', {
      'id': row['id'],
      'version': row['version'],
      'data': values,
    }, method: 'PUT');
  }

  Future<void> reviewSettings() async {
    final dashboard = await widget.api.workspace('/api/owner/dashboard') as Map,
        settings = Map<String, dynamic>.from(dashboard['settings'] as Map);
    if (!mounted) return;
    final f = await form('Google review link', {
      'Official HTTPS Google URL': settings['googleReviewUrl'] as String? ?? '',
    });
    if (f == null) return;
    settings['googleReviewUrl'] = f.values.first.isEmpty
        ? null
        : f.values.first;
    await save('/api/owner/settings', settings, method: 'PUT');
  }

  @override
  Widget build(BuildContext context) {
    final section = widget.section;
    List rows = [];
    if (data is List) rows = data as List;
    if (data is Map) {
      final m = data as Map;
      rows =
          (m['records'] ??
                  (section == 'Notifications'
                      ? m['notifications']
                      : ['Calendar', 'Jobs'].contains(section)
                      ? m['bookings']
                      : []) ??
                  [])
              as List;
    }
    if (['Calendar', 'Jobs'].contains(section)) {
      rows = List.of(
        rows,
      )..sort((a, b) => (a['start_ms'] as int).compareTo(b['start_ms'] as int));
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(section),
        actions: [
          IconButton(
            onPressed: busy ? null : load,
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (widget.api.isDemo)
              const Text(
                'DEVELOPMENT DEMO · Empty management records. Saving requires the approved backend.',
              ),
            if (busy) const LinearProgressIndicator(),
            if (error != null)
              Text(
                error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            if (['Customers', 'Vehicles'].contains(section))
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: search,
                      decoration: const InputDecoration(labelText: 'Search'),
                    ),
                  ),
                  IconButton(
                    onPressed: busy ? null : load,
                    icon: const Icon(Icons.search),
                  ),
                ],
              ),
            if (section == 'Materials')
              FilledButton(
                onPressed: busy ? null : () => run(addMaterial),
                child: const Text('Add material'),
              ),
            if (section == 'Estimates & invoices')
              FilledButton(
                onPressed: busy ? null : () => run(addDocument),
                child: const Text('Create draft'),
              ),
            if (section == 'Payment Center')
              const Text(
                'Record payments received externally. This app never charges a card. If a save response is uncertain, refresh and inspect the ledger before recording again. Refunds and corrections require a reviewed adjustment workflow.',
              ),
            if (section == 'Financial Center') ...[
              Row(
                children: [
                  Expanded(
                    child: DropdownButton<int>(
                      value: year,
                      items: [
                        for (
                          int y = DateTime.now().year - 3;
                          y <= DateTime.now().year;
                          y++
                        )
                          DropdownMenuItem(value: y, child: Text('$y')),
                      ],
                      onChanged: (v) {
                        setState(() => year = v!);
                        load();
                      },
                    ),
                  ),
                  Expanded(
                    child: DropdownButton<int>(
                      value: quarter,
                      items: [
                        for (int q = 1; q <= 4; q++)
                          DropdownMenuItem(
                            value: q,
                            child: Text('Quarter $q (UTC)'),
                          ),
                      ],
                      onChanged: (v) {
                        setState(() => quarter = v!);
                        load();
                      },
                    ),
                  ),
                ],
              ),
              FilledButton(
                onPressed: busy ? null : () => run(() => recordMoney(null)),
                child: const Text('Record expense'),
              ),
              if (data is Map) ...[
                Text((data as Map)['basis'] as String? ?? ''),
                for (final key in [
                  'receiptsCents',
                  'tipsCents',
                  'expenseCents',
                  'materialsPurchasedCents',
                  'estimatedProfitCents',
                  'cashFlowCents',
                  'salesTaxCollectedCents',
                  'taxRemittedCents',
                ])
                  ListTile(
                    title: Text(
                      {
                        'receiptsCents': 'Invoice payments received',
                        'tipsCents': 'Tips',
                        'expenseCents': 'Expenses',
                        'materialsPurchasedCents': 'Materials purchased',
                        'estimatedProfitCents': 'Estimated cash profit',
                        'cashFlowCents': 'Cash flow',
                        'salesTaxCollectedCents': 'Sales tax collected',
                        'taxRemittedCents': 'Tax remitted',
                      }[key]!,
                    ),
                    trailing: Text(dollars((data as Map)[key])),
                  ),
                const Text(
                  'Quarter boundaries use UTC. Reports reflect entered records and are not a tax filing. Confirm business-local reporting periods before release.',
                ),
                for (final e in ((data as Map)['events'] as List? ?? []))
                  ListTile(
                    title: Text(e['kind'] as String),
                    subtitle: Text(
                      DateTime.fromMillisecondsSinceEpoch(
                        e['occurred_at'] as int,
                      ).toLocal().toString(),
                    ),
                    trailing: Text(dollars(e['amount_cents'])),
                  ),
              ],
            ],
            if (section == 'Reviews')
              FilledButton(
                onPressed: busy ? null : () => run(reviewSettings),
                child: const Text('Google review settings'),
              ),
            for (final raw in rows)
              Builder(
                builder: (context) {
                  final row = Map<String, dynamic>.from(raw as Map),
                      d = payload(row);
                  String title, description = '';
                  switch (section) {
                    case 'Customers':
                      title = '${d['firstName']} ${d['lastName']}';
                      description =
                          '${d['phone']} · ${d['email']}\n${d['address']}';
                      break;
                    case 'Vehicles':
                      title = '${d['year']} ${d['make']} ${d['model']}';
                      description = '${d['color']} · ${d['bodyType']}';
                      break;
                    case 'Materials':
                      title = d['product'] as String;
                      description =
                          '${(d['quantityMillis'] as num) / 1000} ${d['unit']} · ${dollars(d['sellingCents'])}\nCost ${dollars(d['costCents'])}/unit · markup ${(d['markupBps'] as num) / 100}% · taxable ${d['taxable']}';
                      break;
                    case 'Estimates & invoices':
                    case 'Payment Center':
                      title = '${row['number'] ?? 'Draft'} · ${row['kind']}';
                      description =
                          '${row['status']} · ${dollars(d['totalCents'])}\n${d['customer']?['firstName'] ?? ''} ${d['customer']?['lastName'] ?? ''}';
                      break;
                    case 'Reviews':
                      title = '${row['display_name']} · ${row['rating']}/5';
                      description = '${row['status']}\n${row['feedback']}';
                      break;
                    case 'Notifications':
                      title = row['event'] as String;
                      description =
                          'Booking ${row['booking_id']} · ${row['read_at'] == null ? 'Unread' : 'Read'}';
                      break;
                    case 'Jobs':
                    case 'Calendar':
                      title = (row['customer'] is String)
                          ? '${(jsonDecode(row['customer'] as String) as Map)['firstName']}'
                          : 'Appointment';
                      description =
                          '${DateTime.fromMillisecondsSinceEpoch(row['start_ms'] as int).toLocal()} · device time\n${row['status']}';
                      break;
                    default:
                      title = row['id'] as String? ?? '';
                  }
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          Text(description),
                          if (section == 'Jobs') ...[
                            TextButton(
                              onPressed: busy
                                  ? null
                                  : () => Navigator.push(
                                      context,
                                      MaterialPageRoute<void>(
                                        builder: (context) => JobPhotos(
                                          api: widget.api,
                                          bookingId: row['id'] as String,
                                        ),
                                      ),
                                    ),
                              child: const Text('Before & after photos'),
                            ),
                            for (final action
                                in (row['status'] == 'pending'
                                    ? ['confirm', 'propose', 'cancel']
                                    : [
                                        'confirmed',
                                        'rescheduled',
                                      ].contains(row['status'])
                                    ? ['start', 'propose', 'cancel', 'no_show']
                                    : row['status'] == 'in_progress'
                                    ? ['complete']
                                    : []))
                              TextButton(
                                onPressed: busy
                                    ? null
                                    : () => run(() async {
                                        final f = await form('Review $action', {
                                          'Duration minutes': '90',
                                          if (action == 'propose')
                                            'Proposed time (ISO with time zone)':
                                                '',
                                          if (action == 'propose')
                                            'Revised total': '0',
                                        });
                                        if (f == null) return;
                                        await save('/api/owner/transition', {
                                          'id': row['id'],
                                          'version': row['version'],
                                          'action': action,
                                          'durationMinutes': int.parse(
                                            f['Duration minutes']!,
                                          ),
                                          if (action == 'propose')
                                            'startAt': DateTime.parse(
                                              f['Proposed time (ISO with time zone)']!,
                                            ).toUtc().toIso8601String(),
                                          if (action == 'propose')
                                            'priceCents': cents(
                                              f['Revised total'],
                                            ),
                                        });
                                      }),
                                child: Text(action.replaceAll('_', ' ')),
                              ),
                          ],
                          if (['Customers', 'Vehicles'].contains(section))
                            TextButton(
                              onPressed: busy
                                  ? null
                                  : () => run(() => editRecord(row)),
                              child: const Text('Edit'),
                            ),
                          if (section == 'Estimates & invoices' &&
                              row['status'] == 'draft')
                            TextButton(
                              onPressed: busy
                                  ? null
                                  : () => run(
                                      () => save('/api/owner/documents/issue', {
                                        'id': row['id'],
                                        'version': row['version'],
                                      }),
                                    ),
                              child: const Text('Issue immutable document'),
                            ),
                          if (section == 'Payment Center' &&
                              row['kind'] == 'invoice' &&
                              row['status'] == 'issued')
                            TextButton(
                              onPressed: busy
                                  ? null
                                  : () => run(() => recordMoney(row)),
                              child: const Text('Record received payment'),
                            ),
                          if (section == 'Notifications' &&
                              row['read_at'] == null)
                            TextButton(
                              onPressed: busy
                                  ? null
                                  : () => run(
                                      () => save('/api/owner/read', {
                                        'id': row['id'],
                                      }),
                                    ),
                              child: const Text('Mark read'),
                            ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            if (rows.isEmpty && data != null && section != 'Financial Center')
              const Padding(
                padding: EdgeInsets.all(20),
                child: Text('No records to display.'),
              ),
          ],
        ),
      ),
    );
  }
}
