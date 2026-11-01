import 'material_costing.dart';
import 'material_purchase_screen.dart';
import 'receipt_import_screen.dart';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'owner_api.dart';
import 'job_photos.dart';
import 'business_forms.dart';
import 'money.dart';
import 'document_screen.dart';
import 'customer_details.dart';
import 'business_time.dart';

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
  BusinessTime clock = BusinessTime("UTC");
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
        final start = clock.startOfDay(
              DateTime.utc(year, (quarter - 1) * 3 + 1),
            ),
            end = clock.startOfDay(DateTime.utc(year, quarter * 3 + 1));
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
    if (widget.section == "Financial Center") {
      final dashboard =
          await widget.api.workspace('/api/owner/dashboard') as Map;
      clock = BusinessTime(
        (dashboard['settings'] as Map?)?['timezone'] as String? ?? 'UTC',
      );
    }
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
    return editFields(context, title, fields);
  }

  Future<String?> chooseAppointmentTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 1)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (date == null || !mounted) return null;
    final time = await showTimePicker(
      context: context,
      initialTime: const TimeOfDay(hour: 9, minute: 0),
    );
    if (time == null) return null;
    return DateTime(
      date.year,
      date.month,
      date.day,
      time.hour,
      time.minute,
    ).toUtc().toIso8601String();
  }

  int cents(String? s) => parseMoneyCents(s ?? '0');
  Future<void> addMaterial([Map? row]) async {
    final product = row == null ? <String, dynamic>{} : payload(row);
    final f = await form(row == null ? 'Add material' : 'Edit material', {
      'Product': product['product'] as String? ?? '',
      'Quantity': quantityInput(product['quantityMillis'] as int? ?? 1000),
      'Unit (oz/gallon/bottle/piece)': product['unit'] as String? ?? 'oz',
      'Unit cost': moneyInput(product['costCents'] as int? ?? 0),
      'Markup percent': moneyInput(product['markupBps'] as int? ?? 0),
      'Taxable (yes/no)': product['taxable'] == true ? 'yes' : 'no',
      'Low stock alert quantity (blank disables)':
          product['lowStockMillis'] == null
          ? ''
          : quantityInput(product['lowStockMillis'] as int),
    });
    if (f == null) return;
    await save('/api/owner/materials', {
      if (row != null) 'id': row['id'],
      if (row != null) 'version': row['version'],
      'product': f['Product'],
      'quantityMillis': quantityMillis(f['Quantity']!),
      'unit': f['Unit (oz/gallon/bottle/piece)'],
      'costCents': cents(f['Unit cost']),
      'markupBps': parseMoneyCents(f['Markup percent']!),
      'taxable': f['Taxable (yes/no)'] == 'yes',
      'lowStockMillis':
          f['Low stock alert quantity (blank disables)']!.trim().isEmpty
          ? null
          : quantityMillis(f['Low stock alert quantity (blank disables)']!),
    });
  }

  Future<void> addDocument() async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(builder: (_) => DocumentEditor(api: widget.api)),
    );
    await load();
  }

  Future<void> addRecord() async {
    if (widget.section == "Customers") {
      final f = await form('Add customer', {
        'company': '',
        'make': '',
        'model': '',
        'firstName': '',
        'lastName': '',
        'email': '',
        'phone': '',
        'address': '',
        'notes': '',
      });
      if (f != null) {
        final make = f.remove('make')!.trim(),
            model = f.remove('model')!.trim();
        if ((make.isEmpty) != (model.isEmpty)) {
          throw const FormatException(
            'Enter both vehicle make and model, or leave both blank.',
          );
        }
        await save('/api/owner/customers', {
          'data': f,
          if (make.isNotEmpty) 'vehicle': {'make': make, 'model': model},
        });
      }
    } else {
      final d = await widget.api.workspace('/api/owner/customers') as Map;
      if (!mounted) return;
      final customer = await chooseRow(
        context,
        'Choose customer',
        d['records'] as List,
        (r) {
          final v = payload(r);
          return "${v['firstName']} ${v['lastName']}";
        },
      );
      if (customer == null || !mounted) return;
      final f = await form('Add vehicle', {
        'year': '${DateTime.now().year}',
        'make': '',
        'model': '',
        'color': '',
        'bodyType': 'sedan',
      });
      if (f != null) {
        await save('/api/owner/vehicles', {
          'customerId': customer['id'],
          'data': {...f, 'year': int.parse(f['year']!)},
        });
      }
    }
  }

  Future<void> correctStock(Map row) async {
    final d = payload(row),
        f = await form('Count stock', {
          'Available quantity in ${d['unit']}': quantityInput(
            row['available_quantity_millis'] as int? ?? 0,
          ),
          'Reason': '',
        });
    if (f == null) return;
    await save(
      '/api/owner/inventory',
      {
        'kind': 'correction',
        'materialId': row['id'],
        'version': row['stock_version'] ?? 0,
        'availableQuantityMillis': quantityMillis(f.values.first),
        'reason': f['Reason'],
      },
      key: 'stock-${DateTime.now().microsecondsSinceEpoch}',
    );
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
          {
            ...d,
            if (widget.section == 'Customers' && !d.containsKey('company'))
              'company': '',
            if (widget.section == 'Customers' && !d.containsKey('notes'))
              'notes': '',
          }.map((k, v) => MapEntry(k, v?.toString() ?? '')),
        );
    if (f == null) return;
    final values = <String, dynamic>{...f};
    if (widget.section == 'Vehicles') {
      values['year'] = f['year'] == null || f['year']!.trim().isEmpty
          ? null
          : int.parse(f['year']!);
    }
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
            if (['Customers', 'Vehicles'].contains(section))
              TextButton(
                onPressed: busy ? null : () => run(addRecord),
                child: Text(
                  section == 'Customers' ? 'Add customer' : 'Add vehicle',
                ),
              ),
            if (section == 'Materials') ...[
              FilledButton(
                onPressed: busy
                    ? null
                    : () async {
                        await Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) =>
                                MaterialPurchaseScreen(api: widget.api),
                          ),
                        );
                        await load();
                      },
                child: const Text('Add stock purchase (gallon / oz)'),
              ),
              OutlinedButton.icon(
                onPressed: busy
                    ? null
                    : () async {
                        await Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) =>
                                ReceiptImportScreen(api: widget.api),
                          ),
                        );
                        await load();
                      },
                icon: const Icon(Icons.document_scanner),
                label: const Text('Scan receipt to inventory'),
              ),
              const Text(
                'Low-stock alerts appear here and on Home. Set a threshold per product. Outbound notifications remain disabled.',
              ),
              if (rows.any((r) => r['low_stock'] == true))
                Text(
                  'Low stock: ${rows.where((r) => r['low_stock'] == true).length} product(s)',
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
            ],
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
                      isExpanded: true,
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
                      isExpanded: true,
                      value: quarter,
                      items: [
                        for (int q = 1; q <= 4; q++)
                          DropdownMenuItem(
                            value: q,
                            child: Text('Q$q · ${clock.zone}'),
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
                  'outstandingCents',
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
                        'outstandingCents': 'All outstanding invoices',
                      }[key]!,
                    ),
                    trailing: Text(dollars((data as Map)[key])),
                  ),
                Text(
                  'Quarter boundaries use ${clock.zone}. Cash figures reflect entered records. Job profitability below uses issued job invoices created in this period and saved job costs.',
                ),
                const Divider(),
                const Text('Job costing · not an additional cash expense'),
                ListTile(
                  title: const Text('Consumables used this period'),
                  trailing: Text(
                    dollars((data as Map)['consumablesUsedCents']),
                  ),
                ),
                ListTile(
                  title: const Text('Included in service prices'),
                  trailing: Text(
                    dollars((data as Map)['includedConsumablesUsedCents']),
                  ),
                ),
                ListTile(
                  title: const Text('Separately billed consumables · cost'),
                  trailing: Text(
                    dollars(
                      (data as Map)['separatelyBilledConsumablesUsedCents'],
                    ),
                  ),
                ),
                ListTile(
                  title: const Text('Issued job profit before overhead'),
                  trailing: Text(dollars((data as Map)['jobProfitCents'])),
                ),
                for (final j
                    in (data as Map)['jobProfitability'] as List? ?? [])
                  ListTile(
                    title: Text(j['number'] as String),
                    subtitle: Text(
                      'Revenue ${dollars(j['revenueExcludingTaxCents'])} · total job cost ${dollars(j['costCents'])}\nConsumables included in job cost: ${dollars(j['consumablesCostCents'])}',
                    ),
                    trailing: Text(dollars(j['profitCents'])),
                  ),
                for (final e in ((data as Map)['events'] as List? ?? []))
                  ListTile(
                    title: Text(e['kind'] as String),
                    subtitle: Text(clock.label(e['occurred_at'])),
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
                          '${d['company'] ?? ''}\n${d['phone']} · ${d['email']}\n${d['address']}'
                              .trim();
                      break;
                    case 'Vehicles':
                      title = '${d['year'] ?? ''} ${d['make']} ${d['model']}'
                          .trim();
                      description = '${d['color']} · ${d['bodyType']}';
                      break;
                    case 'Materials':
                      title = d['product'] as String;
                      description =
                          '${row['low_stock'] == true ? 'LOW STOCK · ' : ''}Available ${quantityInput(row['available_quantity_millis'] as int? ?? 0)} ${d['unit']}\nDefault use ${(d['quantityMillis'] as num) / 1000} ${d['unit']} · ${dollars(d['sellingCents'])}\nCost ${dollars(d['costCents'])}/unit · markup ${(d['markupBps'] as num) / 100}% · taxable ${d['taxable']}';
                      if (d['purchaseCostCents'] != null) {
                        description +=
                            '\nPurchase ${dollars(d['purchaseCostCents'])}/${d['purchaseUnit']} = ${quantityInput(d['purchaseSizeMillis'] as int)} ${d['unit']}\nExact cost USD ${((d['costBasisCents'] as num) * 1000 / (d['costBasisQuantityMillis'] as num) / 100).toStringAsFixed(6)}/${d['unit']} · Bill USD ${invoiceUnitPrice(d)}/${d['unit']}';
                      }
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
                          if (section == 'Customers')
                            TextButton(
                              onPressed: () => Navigator.push<void>(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => CustomerDetails(
                                    api: widget.api,
                                    id: row['id'] as String,
                                  ),
                                ),
                              ),
                              child: const Text('Vehicles & service history'),
                            ),
                          if (section == 'Materials') ...[
                            TextButton(
                              onPressed: busy
                                  ? null
                                  : () async {
                                      await Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                          builder: (_) =>
                                              MaterialPurchaseScreen(
                                                api: widget.api,
                                                row: row,
                                                configure: true,
                                              ),
                                        ),
                                      );
                                      await load();
                                    },
                              child: const Text('Purchase units & markup'),
                            ),
                            TextButton(
                              onPressed: busy
                                  ? null
                                  : () async {
                                      await Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                          builder: (_) =>
                                              MaterialPurchaseScreen(
                                                api: widget.api,
                                                row: row,
                                              ),
                                        ),
                                      );
                                      await load();
                                    },
                              child: const Text('Add stock purchase'),
                            ),
                            TextButton(
                              onPressed: busy
                                  ? null
                                  : () => run(() => addMaterial(row)),
                              child: const Text('Edit product'),
                            ),
                            const Text(
                              'Product quantity is the default charge quantity. Available stock is recorded separately.',
                            ),

                            Text(
                              'Available: ${quantityInput(row['available_quantity_millis'] as int? ?? 0)} ${d['unit']}',
                            ),
                            TextButton(
                              onPressed: busy
                                  ? null
                                  : () => run(() => correctStock(row)),
                              child: const Text('Correct stock'),
                            ),
                          ],
                          if ([
                            'Estimates & invoices',
                            'Payment Center',
                          ].contains(section))
                            TextButton(
                              onPressed: () => Navigator.push<void>(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => DocumentScreen(
                                    api: widget.api,
                                    id: row['id'] as String,
                                  ),
                                ),
                              ),
                              child: const Text('Details, payments & PDF'),
                            ),

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
                                            'Revised total': '0',
                                        });
                                        if (f == null) return;
                                        final proposed = action == 'propose'
                                            ? await chooseAppointmentTime()
                                            : null;
                                        if (action == 'propose' &&
                                            proposed == null) {
                                          return;
                                        }
                                        await save('/api/owner/transition', {
                                          'id': row['id'],
                                          'version': row['version'],
                                          'action': action,
                                          'durationMinutes': int.parse(
                                            f['Duration minutes']!,
                                          ),
                                          if (action == 'propose')
                                            'startAt': proposed,
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
