import 'package:flutter/material.dart';
import 'owner_api.dart';
import 'business_forms.dart';
import 'money.dart';

class JobConsumables extends StatefulWidget {
  const JobConsumables({
    super.key,
    required this.api,
    required this.jobId,
    required this.plans,
    required this.open,
    required this.onChanged,
  });
  final OwnerApi api;
  final String jobId;
  final List plans;
  final bool open;
  final Future<void> Function() onChanged;
  @override
  State<JobConsumables> createState() => _JobConsumablesState();
}

class _JobConsumablesState extends State<JobConsumables> {
  bool busy = false;
  String? error;
  Future<void> record(Map plan) async {
    final f = await editFields(context, 'Confirm actual consumable use', {
      'Actual quantity in ${plan['unit']} (0 if not used)': quantityInput(
        plan['quantityMillis'] as int,
      ),
    });
    if (f == null || !mounted) return;
    try {
      final amount = quantityMillis(f.values.first);
      setState(() {
        busy = true;
        error = null;
      });
      await widget.api.workspace(
        '/api/owner/inventory',
        method: 'POST',
        key: 'planned-${widget.jobId}-${plan['materialId']}',
        body: {
          'kind': 'usage',
          'planned': true,
          'jobId': widget.jobId,
          'materialId': plan['materialId'],
          'version': plan['stockVersion'],
          'quantityMillis': amount,
          'billSeparately': false,
          'reason': amount == 0
              ? 'Assigned consumable not used'
              : 'Confirmed service consumable use',
        },
      );
      await widget.onChanged();
    } catch (e) {
      if (mounted) {
        setState(
          () => error =
              '$e\nRefresh the job before retrying if the response was uncertain.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> visibility(Map plan, bool value) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.workspace(
        '/api/owner/consumable-visibility',
        method: 'PUT',
        body: {
          'id': plan['movementId'],
          'expectedVisibility': plan['includeOnInvoice'] == true,
          'includeOnInvoice': value,
        },
      );
      await widget.onChanged();
    } catch (e) {
      if (mounted) {
        setState(
          () =>
              error = 'Could not save invoice choice. Refresh before retrying.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Divider(),
      Text(
        'Assigned consumables',
        style: Theme.of(context).textTheme.titleMedium,
      ),
      const Text(
        'Record actual usage at cost, included in the service price. Usage stays private unless you turn on Include on invoice. Recording use deducts stock once.',
      ),
      if (error != null)
        Text(
          error!,
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      for (final p in widget.plans)
        Card(
          child: Column(
            children: [
              ListTile(
                title: Text(
                  '${p['product']} · ${quantityInput(p['quantityMillis'] as int)} ${p['unit']} planned',
                ),
                subtitle: Text(
                  '${(p['services'] as List).join(', ')}\nEstimated cost: \$${moneyInput(p['estimatedCostCents'] as int)}\n${p['recorded'] == true ? 'Actual: ${quantityInput(p['actualQuantityMillis'] as int)} ${p['unit']}' : 'Available: ${quantityInput(p['availableQuantityMillis'] as int)} ${p['unit']}'}',
                ),
                trailing: p['recorded'] == true
                    ? const Icon(Icons.check_circle)
                    : null,
                onTap: busy || !widget.open || p['recorded'] == true
                    ? null
                    : () => record(p),
              ),
              if (p['recorded'] == true &&
                  (p['actualQuantityMillis'] as int) > 0)
                SwitchListTile(
                  title: const Text('Include on invoice'),
                  subtitle: const Text(
                    'Product and quantity only. No extra charge.',
                  ),
                  value: p['includeOnInvoice'] == true,
                  onChanged: busy || !widget.open
                      ? null
                      : (value) => visibility(p, value),
                ),
            ],
          ),
        ),
    ],
  );
}
