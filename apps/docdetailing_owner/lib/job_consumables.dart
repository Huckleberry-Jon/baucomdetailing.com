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
      'Separate customer charge (yes/no)': 'no',
    });
    if (f == null || !mounted) return;
    try {
      final amount = quantityMillis(f.values.first),
          choice = f['Separate customer charge (yes/no)']!.trim().toLowerCase();
      if (!['yes', 'no'].contains(choice)) {
        throw const FormatException('Choose yes or no for separate billing.');
      }
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
          'billSeparately': choice == 'yes',
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
        'Review actual usage. Costs are included in the service price unless a separate charge is explicitly selected. Recording use deducts stock once.',
      ),
      if (error != null)
        Text(
          error!,
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      for (final p in widget.plans)
        Card(
          child: ListTile(
            title: Text(
              '${p['product']} · ${quantityInput(p['quantityMillis'] as int)} ${p['unit']} planned',
            ),
            subtitle: Text(
              '${(p['services'] as List).join(', ')}\nEstimated cost: \$${moneyInput(p['estimatedCostCents'] as int)}\n${p['recorded'] == true ? 'Actual use recorded' : 'Available: ${quantityInput(p['availableQuantityMillis'] as int)} ${p['unit']}'}',
            ),
            trailing: p['recorded'] == true
                ? const Icon(Icons.check_circle)
                : null,
            onTap: busy || !widget.open || p['recorded'] == true
                ? null
                : () => record(p),
          ),
        ),
    ],
  );
}
