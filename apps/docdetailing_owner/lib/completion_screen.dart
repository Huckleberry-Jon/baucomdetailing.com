import 'document_totals.dart';
export 'document_totals.dart';
import 'package:flutter/material.dart';
import 'owner_api.dart';
import 'booking_details.dart' show objectMap;
import 'document_screen.dart';
import 'money.dart';

class CompletionScreen extends StatefulWidget {
  const CompletionScreen({
    super.key,
    required this.api,
    required this.bookingId,
  });
  final OwnerApi api;
  final String bookingId;
  @override
  State<CompletionScreen> createState() => _CompletionScreenState();
}

class _CompletionScreenState extends State<CompletionScreen> {
  final price = TextEditingController(),
      amount = TextEditingController(),
      tip = TextEditingController(text: '0'),
      tax = TextEditingController(text: '0'),
      discount = TextEditingController(text: '0');
  Map? details, result, pending;
  String? error, method, key;
  bool busy = true, unpaid = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    for (final c in [price, amount, tip, tax, discount]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final d =
          await widget.api.workspace(
                '/api/owner/job-completion?booking=${Uri.encodeQueryComponent(widget.bookingId)}',
              )
              as Map;
      if (!mounted) return;
      final invoice = d['invoice'] as Map?, quote = d['quote'] as Map?;
      amount.text = moneyInput(
        invoice == null
            ? (quote?['totalCents'] as int? ?? 0)
            : (invoice['data']['totalCents'] as int) -
                  (invoice['paid_cents'] as int),
      );
      setState(() {
        details = d;
        pending = null;
        key = null;
      });
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  int get total {
    final invoice = details?['invoice'] as Map?;
    if (invoice != null) return invoice['data']['totalCents'] as int;
    return completionTotal(
      details?['quote'] as Map?,
      price.text.trim().isEmpty ? 0 : parseMoneyCents(price.text),
      parseMoneyCents(discount.text),
      parseMoneyCents(tax.text),
    );
  }

  Future<void> submit() async {
    if (busy || details == null) return;
    try {
      if (pending == null) {
        final job = details!['job'] as Map,
            invoice = details!['invoice'] as Map?;
        final received = unpaid ? 0 : parseMoneyCents(amount.text),
            tips = unpaid || tip.text.trim().isEmpty
                ? 0
                : parseMoneyCents(tip.text);
        if (!unpaid && (received <= 0 || method == null)) {
          throw const FormatException(
            'Enter the payment amount and choose how it was received.',
          );
        }
        if (received > total - (invoice?['paid_cents'] as int? ?? 0)) {
          throw const FormatException(
            'Payment exceeds the invoice balance. Enter tips separately.',
          );
        }
        if (total < 0 ||
            (total == 0 && details!['quote'] == null && invoice == null)) {
          throw const FormatException(
            'Enter the final approved service price or save the job charges.',
          );
        }
        if (!mounted) return;
        final yes = await showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
            title: Text(
              unpaid ? 'Complete without payment?' : 'Confirm payment received',
            ),
            content: Text(
              unpaid
                  ? 'Issue the invoice and mark the work completed with no new payment recorded.'
                  : 'Invoice payment: \$${moneyInput(received)}\nTip: \$${moneyInput(tips)}\nTotal received: \$${moneyInput(received + tips)}\nOnly confirm money actually received. No card will be charged.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(c, false),
                child: const Text('Go back'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(c, true),
                child: const Text('Confirm'),
              ),
            ],
          ),
        );
        if (yes != true || !mounted) return;
        key =
            'checkout-${widget.bookingId}-${job['booking_version']}-${job['version']}-${invoice?['version'] ?? 0}';
        pending = {
          'bookingId': widget.bookingId,
          'bookingVersion': job['booking_version'],
          'jobVersion': job['version'],
          'invoiceVersion': invoice?['version'],
          'unpaid': unpaid,
          'amountCents': received,
          'tipCents': tips,
          'method': unpaid ? null : method,
          'occurredAt': DateTime.now().toUtc().toIso8601String(),
          if (invoice == null) ...{
            'taxBps': parseMoneyCents(tax.text),
            'discountCents': parseMoneyCents(discount.text),
            if (details!['quote'] == null)
              'servicePriceCents': parseMoneyCents(price.text),
          },
        };
      }
      setState(() {
        busy = true;
        error = null;
      });
      final saved =
          await widget.api.workspace(
                '/api/owner/job-completion',
                method: 'POST',
                body: Map<String, dynamic>.from(pending!),
                key: key,
              )
              as Map;
      if (mounted) setState(() => result = saved);
    } catch (e) {
      if (mounted) {
        setState(
          () => error =
              '$e\nRefresh to check the invoice before changing payment details. Retry uses the same request to prevent duplicates.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final invoice = details?['invoice'] as Map?, job = details?['job'] as Map?;
    final locked = busy || pending != null;
    Widget field(String label, TextEditingController controller) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: controller,
        enabled: !locked,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(labelText: label),
        onChanged: (_) => setState(() {}),
      ),
    );
    return Scaffold(
      appBar: AppBar(
        title: const Text('Complete job & payment'),
        actions: [
          IconButton(
            tooltip: 'Refresh payment status',
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
            Text(
              error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          if (result != null) ...[
            Text(
              result!['paymentId'] == null
                  ? 'Job completed; no new payment recorded'
                  : 'Payment and job completion recorded',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            Text(
              'Payment: \$${moneyInput(result!['amountCents'] as int)}\nTip: \$${moneyInput(result!['tipCents'] as int)}\nRemaining balance: \$${moneyInput(result!['balanceCents'] as int)}',
            ),
            FilledButton(
              onPressed: () => Navigator.push<void>(
                context,
                MaterialPageRoute(
                  builder: (_) => DocumentScreen(
                    api: widget.api,
                    id: result!['documentId'] as String,
                  ),
                ),
              ),
              child: const Text('Open invoice & receipt'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Done'),
            ),
          ] else if (details != null &&
              details!['checkoutRecorded'] == true) ...[
            const Text(
              'Completion was already recorded. Open the invoice to check payments or record an outstanding balance.',
            ),
            if (invoice != null)
              FilledButton(
                onPressed: () => Navigator.push<void>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => DocumentScreen(
                      api: widget.api,
                      id: invoice['id'] as String,
                    ),
                  ),
                ),
                child: const Text('Open invoice'),
              ),
          ] else if (details != null) ...[
            Text(
              '${objectMap(job!['customer'])['firstName']} ${objectMap(job['customer'])['lastName']}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const Text(
              'Confirm the agreed charges and money actually received. This records an external payment; no card is charged.',
            ),
            const SizedBox(height: 16),
            if (invoice == null) ...[
              if (details!['quote'] == null)
                field('Approved service price (before tax)', price)
              else
                Text(
                  'Saved service and material charges: \$${moneyInput(details!['quote']['subtotalCents'] as int)}',
                ),
              field('Discount', discount),
              field('Tax rate percent', tax),
            ] else
              Text(
                'Invoice ${invoice['number'] ?? 'draft'} total: \$${moneyInput(invoice['data']['totalCents'] as int)}\nAlready paid: \$${moneyInput(invoice['paid_cents'] as int)}',
              ),
            Builder(
              builder: (_) {
                try {
                  return Text('Invoice total: \$${moneyInput(total)}');
                } catch (_) {
                  return const Text(
                    'Check the price, discount and tax values.',
                  );
                }
              },
            ),
            SwitchListTile(
              title: const Text('Not paid yet'),
              value: unpaid,
              onChanged: locked ? null : (v) => setState(() => unpaid = v),
            ),
            if (!unpaid) ...[
              field('Payment received (excluding tip)', amount),
              field('Tip received', tip),
              DropdownButtonFormField<String>(
                initialValue: method,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Payment method'),
                items: const [
                  DropdownMenuItem(value: 'cash', child: Text('Cash')),
                  DropdownMenuItem(value: 'check', child: Text('Check')),
                  DropdownMenuItem(value: 'bank', child: Text('Bank transfer')),
                  DropdownMenuItem(
                    value: 'external_card_reference',
                    child: Text('Card paid elsewhere'),
                  ),
                ],
                onChanged: locked ? null : (v) => setState(() => method = v),
              ),
            ],
            const SizedBox(height: 20),
            FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xff146c43),
                foregroundColor: Colors.white,
              ),
              onPressed: busy ? null : submit,
              icon: const Icon(Icons.check_circle_outline),
              label: Text(
                pending != null
                    ? 'Retry same payment request'
                    : job['status'] == 'completed'
                    ? 'Record completion payment'
                    : 'Confirm & complete job',
              ),
            ),
          ],
        ],
      ),
    );
  }
}
