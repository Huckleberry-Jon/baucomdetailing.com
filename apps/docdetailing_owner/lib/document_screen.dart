import 'material_costing.dart';
import 'dart:convert';
import 'invoice_composer.dart';
import 'document_totals.dart';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:printing/printing.dart';
import 'owner_api.dart';
import 'booking_details.dart';
import 'business_forms.dart';
import 'business_pdf.dart';
import 'money.dart';

class DocumentScreen extends StatefulWidget {
  const DocumentScreen({super.key, required this.api, required this.id});
  final OwnerApi api;
  final String id;
  @override
  State<DocumentScreen> createState() => _DocumentScreenState();
}

class _DocumentScreenState extends State<DocumentScreen> {
  Map? row;
  String? error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> run(Future<void> Function() work) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await work();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> fetch() async {
    final result =
        await widget.api.workspace(
              '/api/owner/document?id=${Uri.encodeQueryComponent(widget.id)}',
            )
            as Map;
    if (mounted) setState(() => row = result);
  }

  Future<void> load() => run(fetch);
  Future<void> share({bool receipt = false, bool? email}) async {
    await fetch();
    if (!mounted) return;
    final d = objectMap(row!['data']), images = <Uint8List>[];
    if (!receipt) {
      for (final id in d['photoIds'] as List? ?? []) {
        images.add(
          Uint8List.fromList(await widget.api.privatePhoto(id as String)),
        );
        if (!mounted) return;
      }
    }
    Uint8List? logo;
    if (d['invoiceLogoId'] != null) {
      final asset =
          await widget.api.workspace(
                '/api/owner/business-asset?id=${Uri.encodeQueryComponent(d['invoiceLogoId'] as String)}',
              )
              as Map;
      logo = base64Decode(asset['base64'] as String);
    }
    final bytes = await businessPdf(
      row!,
      d,
      photos: images,
      receipt: receipt,
      logo: logo,
    );
    if (!mounted) return;
    if (email != null) {
      final outcome = await InvoiceComposer().compose(
        row!,
        d,
        bytes,
        email: email,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            outcome == 'sent'
                ? 'Sent from your phone. Delivery is not confirmed.'
                : outcome == 'cancelled'
                ? 'Message draft closed without sending.'
                : 'Composer unavailable or unsuccessful. Use Share PDF and choose your messaging or email app.',
          ),
        ),
      );
      return;
    }
    await Printing.sharePdf(
      bytes: bytes,
      filename:
          'docdetailing-${receipt ? 'receipt' : 'document'}-${row!['number'] ?? 'draft'}.pdf',
    );
  }

  Future<void> payment() async {
    final f = await editFields(context, 'Record payment already received', {
      'Amount': '0',
      'Tip': '0',
      'Method (cash/check/bank/external_card_reference)': 'cash',
      'Note': '',
    });
    if (f == null) return;
    await widget.api.workspace(
      '/api/owner/finance/events',
      method: 'POST',
      key: 'payment-${DateTime.now().microsecondsSinceEpoch}',
      body: {
        'kind': 'payment',
        'documentId': widget.id,
        'amountCents': parseMoneyCents(f['Amount']!),
        'tipCents': parseMoneyCents(f['Tip']!),
        'method': f['Method (cash/check/bank/external_card_reference)'],
        'note': f['Note'],
        'occurredAt': DateTime.now().toUtc().toIso8601String(),
      },
    );
    await fetch();
  }

  @override
  Widget build(BuildContext c) => Scaffold(
    appBar: AppBar(
      title: Text(
        row == null
            ? 'Invoice or estimate'
            : row!['kind'] == 'estimate'
            ? 'Estimate'
            : 'Invoice',
      ),
      actions: [
        IconButton(
          tooltip: 'Refresh',
          onPressed: busy ? null : load,
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (busy) const LinearProgressIndicator(),
        if (error != null)
          Text(error!, style: TextStyle(color: Theme.of(c).colorScheme.error)),
        if (row != null) ...[
          Builder(
            builder: (_) {
              final d = objectMap(row!['data']),
                  paid = row!['paid_cents'] as int,
                  total = d['totalCents'] as int;
              final status = row!['status'] == 'draft'
                  ? 'Draft'
                  : row!['status'] == 'void'
                  ? 'Void'
                  : row!['kind'] == 'estimate'
                  ? 'Estimate issued'
                  : paid >= total
                  ? 'Paid'
                  : paid > 0
                  ? 'Partially paid'
                  : 'Unpaid';
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${row!['number'] ?? 'Draft'} · $status',
                    style: Theme.of(c).textTheme.titleLarge,
                  ),
                  Text(
                    '${d['customer']?['firstName'] ?? ''} ${d['customer']?['lastName'] ?? ''}',
                  ),
                  for (final line in d['lines'] as List)
                    ListTile(
                      title: Text(line['description'] as String),
                      subtitle: Text(
                        '${quantityInput(line['quantityMillis'] as int)} × \$${invoiceUnitPrice(line)}',
                      ),
                      trailing: Text(
                        '\$${moneyInput(line['totalCents'] as int)}',
                      ),
                    ),
                  Text(
                    'Discount: \$${moneyInput(d['discountCents'] as int? ?? 0)} · Tax: \$${moneyInput(d['taxCents'] as int)}',
                  ),
                  Text(
                    row!['kind'] == 'estimate'
                        ? 'Estimate total: \$${moneyInput(total)}'
                        : 'Total: \$${moneyInput(total)} · Paid: \$${moneyInput(paid)} · Balance: \$${moneyInput(total - paid)}',
                  ),
                  if (row!['status'] == 'draft')
                    Wrap(
                      spacing: 8,
                      children: [
                        TextButton(
                          onPressed: busy
                              ? null
                              : () async {
                                  await Navigator.push<void>(
                                    c,
                                    MaterialPageRoute(
                                      builder: (_) => DocumentEditor(
                                        api: widget.api,
                                        existing: row,
                                      ),
                                    ),
                                  );
                                  await load();
                                },
                          child: const Text('Edit draft'),
                        ),
                        FilledButton(
                          onPressed: busy
                              ? null
                              : () => run(() async {
                                  final yes = await showDialog<bool>(
                                    context: c,
                                    builder: (dialog) => AlertDialog(
                                      title: const Text('Issue document?'),
                                      content: const Text(
                                        'Issued documents cannot be edited. Confirm the customer, charges, discounts and tax before continuing.',
                                      ),
                                      actions: [
                                        TextButton(
                                          onPressed: () =>
                                              Navigator.pop(dialog, false),
                                          child: const Text('Cancel'),
                                        ),
                                        FilledButton(
                                          onPressed: () =>
                                              Navigator.pop(dialog, true),
                                          child: const Text('Issue'),
                                        ),
                                      ],
                                    ),
                                  );
                                  if (yes != true) return;
                                  await widget.api.workspace(
                                    '/api/owner/documents/issue',
                                    method: 'POST',
                                    body: {
                                      'id': widget.id,
                                      'version': row!['version'],
                                    },
                                  );
                                  await fetch();
                                }),
                          child: const Text('Issue document'),
                        ),
                      ],
                    ),
                  if (row!['kind'] == 'invoice' &&
                      row!['status'] == 'issued' &&
                      paid < total)
                    FilledButton(
                      onPressed: busy ? null : () => run(payment),
                      child: const Text('Record payment or deposit'),
                    ),
                  Text(
                    row!['kind'] == 'estimate'
                        ? 'This estimate is a quote, not a bill. Create and issue an invoice for the job before recording payment.'
                        : 'Record payments received externally. No card is charged. After an uncertain response, refresh this ledger before trying again.',
                  ),
                  if (row!['status'] == 'issued') ...[
                    const SizedBox(height: 16),
                    Text(
                      'Send to customer',
                      style: Theme.of(c).textTheme.titleMedium,
                    ),
                    const Text(
                      'Review the recipient and message on your phone before sending. Standard carrier charges may apply.',
                    ),
                    Wrap(
                      spacing: 12,
                      runSpacing: 8,
                      children: [
                        OutlinedButton.icon(
                          onPressed: busy
                              ? null
                              : () => run(() => share(email: false)),
                          icon: const Icon(Icons.sms_outlined),
                          label: Text(
                            row!['kind'] == 'estimate'
                                ? 'Text estimate'
                                : 'Text invoice',
                          ),
                        ),
                        OutlinedButton.icon(
                          onPressed: busy
                              ? null
                              : () => run(() => share(email: true)),
                          icon: const Icon(Icons.email_outlined),
                          label: Text(
                            row!['kind'] == 'estimate'
                                ? 'Email estimate'
                                : 'Email invoice',
                          ),
                        ),
                      ],
                    ),
                  ],
                  Wrap(
                    spacing: 8,
                    children: [
                      TextButton(
                        onPressed: busy ? null : () => run(() => share()),
                        child: const Text('Share PDF'),
                      ),
                      if (paid > 0)
                        TextButton(
                          onPressed: busy
                              ? null
                              : () => run(() => share(receipt: true)),
                          child: const Text('Share customer receipt'),
                        ),
                    ],
                  ),
                  for (final p in row!['payments'] as List)
                    ListTile(
                      title: Text(
                        'Payment \$${moneyInput(p['amount_cents'] as int)} · Tip \$${moneyInput(p['tip_cents'] as int)}',
                      ),
                      subtitle: Text(
                        '${objectMap(p['data'])['method']} · ${p['id']}',
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ],
    ),
  );
}

class DocumentEditor extends StatefulWidget {
  const DocumentEditor({
    super.key,
    required this.api,
    this.existing,
    this.customer,
  });
  final OwnerApi api;
  final Map? existing, customer;
  @override
  State<DocumentEditor> createState() => _DocumentEditorState();
}

class _DocumentEditorState extends State<DocumentEditor> {
  final tax = TextEditingController(text: '0'),
      discount = TextEditingController(text: '0'),
      notes = TextEditingController();
  List<Map<String, dynamic>> lines = [];
  String kind = 'invoice';
  bool busy = false;
  String? error;
  Map? customer;
  @override
  void initState() {
    super.initState();
    customer = widget.customer;
    if (widget.existing case final row?) {
      final d = objectMap(row['data']);
      kind = row['kind'] as String;
      lines = (d['lines'] as List)
          .map((x) => Map<String, dynamic>.from(x as Map))
          .toList();
      tax.text = moneyInput(d['taxBps'] as int);
      discount.text = moneyInput(d['discountCents'] as int? ?? 0);
      notes.text = d['notes'] as String? ?? '';
      customer = {'id': row['customer_id'], 'data': d['customer']};
    }
  }

  @override
  void dispose() {
    tax.dispose();
    discount.dispose();
    notes.dispose();
    super.dispose();
  }

  Future<void> run(Future<void> Function() work) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await work();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> pickCustomer() async {
    final result = await widget.api.workspace('/api/owner/customers') as Map;
    if (!mounted) return;
    final row = await chooseRow(
      context,
      'Select customer',
      result['records'] as List,
      (r) {
        final d = objectMap(r['data']);
        return '${d['firstName']} ${d['lastName']}';
      },
    );
    if (row != null && mounted) setState(() => customer = row);
  }

  Future<void> save() async {
    if (customer == null) throw const FormatException('Choose a customer.');
    final saved = await widget.api.workspace(
      '/api/owner/documents',
      method: 'POST',
      body: {
        if (widget.existing != null) 'id': widget.existing!['id'],
        if (widget.existing != null) 'version': widget.existing!['version'],
        if (widget.existing?['booking_id'] != null)
          'bookingId': widget.existing!['booking_id'],
        'customerId': customer!['id'],
        'kind': kind,
        'lines': lines,
        'taxBps': parseMoneyCents(tax.text),
        'discountCents': parseMoneyCents(discount.text),
        'notes': notes.text,
        'photoIds': widget.existing == null
            ? []
            : objectMap(widget.existing!['data'])['photoIds'] ?? [],
      },
    );
    if (!mounted) return;
    if (widget.existing == null) {
      await Navigator.pushReplacement<void, void>(
        context,
        MaterialPageRoute(
          builder: (_) => DocumentScreen(
            api: widget.api,
            id: (saved as Map)['id'] as String,
          ),
        ),
      );
    } else {
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
    appBar: AppBar(
      title: Text(
        widget.existing == null ? 'Create invoice or estimate' : 'Edit draft',
      ),
    ),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (busy) const LinearProgressIndicator(),
        if (error != null)
          Text(error!, style: TextStyle(color: Theme.of(c).colorScheme.error)),
        const Text('1. Choose document type and customer'),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: kind,
          decoration: const InputDecoration(labelText: 'Document type'),
          items: [
            for (final k in ['invoice', 'estimate'])
              DropdownMenuItem(
                value: k,
                child: Text(k == 'invoice' ? 'Invoice' : 'Estimate'),
              ),
          ],
          onChanged: busy ? null : (v) => setState(() => kind = v!),
        ),
        Text(
          customer == null
              ? 'Choose a customer'
              : '${objectMap(customer!['data'])['firstName']} ${objectMap(customer!['data'])['lastName']}',
        ),
        if (widget.existing == null)
          TextButton(
            onPressed: busy ? null : () => run(pickCustomer),
            child: const Text('Choose customer'),
          ),
        const SizedBox(height: 16),
        Text(
          '2. Services and charges',
          style: Theme.of(c).textTheme.titleMedium,
        ),
        const Text('Tap a line to edit the description, quantity or price.'),
        for (var i = 0; i < lines.length; i++)
          ListTile(
            title: Text(lines[i]['description'] as String),
            subtitle: Text(
              '${quantityInput(lines[i]['quantityMillis'] as int)} × \$${invoiceUnitPrice(lines[i])}',
            ),
            onTap: busy
                ? null
                : () => run(() async {
                    final value = await editCharge(c, line: lines[i]);
                    if (value != null) setState(() => lines[i] = value);
                  }),
            trailing: IconButton(
              tooltip: 'Remove line',
              onPressed: busy ? null : () => setState(() => lines.removeAt(i)),
              icon: const Icon(Icons.delete_outline),
            ),
          ),
        TextButton(
          onPressed: busy
              ? null
              : () => run(() async {
                  final value = await editCharge(c);
                  if (value != null) setState(() => lines.add(value));
                }),
          child: const Text('Add line'),
        ),
        TextField(
          controller: discount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(labelText: 'Discount (USD)'),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: tax,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(labelText: 'Tax rate percent'),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: notes,
          minLines: 2,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'Notes shown to customer',
          ),
        ),
        Builder(
          builder: (_) {
            try {
              final rows = lines
                  .map((l) => {...l, 'totalCents': invoiceLineTotal(l)})
                  .toList();
              final subtotal = rows.fold<int>(
                0,
                (n, l) => n + (l['totalCents'] as int),
              );
              final reduction = parseMoneyCents(discount.text),
                  rate = parseMoneyCents(tax.text);
              final total = completionTotal(
                {'subtotalCents': subtotal, 'lines': rows},
                0,
                reduction,
                rate,
              );
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        kind == 'invoice'
                            ? 'Invoice summary'
                            : 'Estimate summary',
                        style: Theme.of(c).textTheme.titleMedium,
                      ),
                      Text('Subtotal: \$${moneyInput(subtotal)}'),
                      Text('Discount: \$${moneyInput(reduction)}'),
                      Text(
                        'Tax: \$${moneyInput(total - subtotal + reduction)}',
                      ),
                      Text(
                        'Total: \$${moneyInput(total)}',
                        style: Theme.of(c).textTheme.titleLarge,
                      ),
                    ],
                  ),
                ),
              );
            } catch (_) {
              return const Text(
                'Check the discount and tax values to preview the total.',
              );
            }
          },
        ),
        const SizedBox(height: 16),
        const Text(
          'Save draft, then review and issue it before sending to the customer.',
        ),
        FilledButton(
          onPressed: busy ? null : () => run(save),
          child: const Text('Save draft'),
        ),
      ],
    ),
  );
}
