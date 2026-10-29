import 'package:flutter/material.dart';
import 'owner_api.dart';
import 'business_time.dart';
import 'booking_details.dart';
import 'business_forms.dart';
import 'money.dart';
import 'job_photos.dart';

class JobsScreen extends StatefulWidget {
  const JobsScreen({super.key, required this.api});
  final OwnerApi api;
  @override
  State<JobsScreen> createState() => _JobsScreenState();
}

class _JobsScreenState extends State<JobsScreen> {
  List rows = [];
  BusinessTime? clock;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final d = await widget.api.workspace('/api/owner/dashboard') as Map;
      final r = await widget.api.workspace('/api/owner/jobs') as Map;
      if (mounted) {
        setState(() {
          clock = BusinessTime(
            (d['settings'] as Map?)?['timezone'] as String? ?? 'UTC',
          );
          rows = r['records'] as List;
          error = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => error = 'Could not load jobs. Refresh when connected.');
      }
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
    appBar: AppBar(
      title: const Text('Jobs'),
      actions: [
        IconButton(
          tooltip: 'Refresh',
          onPressed: load,
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'A confirmed appointment creates its job. Manage appointment status in Calendar.',
        ),
        if (error != null) Text(error!),
        for (final row in rows)
          ListTile(
            title: Text(
              '${objectMap(row['customer'])['firstName']} · ${statusLabel(row['status'] as String)}',
            ),
            subtitle: Text(clock?.label(row['start_ms']) ?? ''),
            onTap: () async {
              await Navigator.push<void>(
                c,
                MaterialPageRoute(
                  builder: (_) =>
                      JobScreen(api: widget.api, id: row['id'] as String),
                ),
              );
              await load();
            },
          ),
        if (rows.isEmpty) const Text('No jobs yet.'),
      ],
    ),
  );
}

class JobScreen extends StatefulWidget {
  const JobScreen({super.key, required this.api, required this.id});
  final OwnerApi api;
  final String id;
  @override
  State<JobScreen> createState() => _JobScreenState();
}

class _JobScreenState extends State<JobScreen> {
  Map? job;
  List<Map<String, dynamic>> lines = [];
  String? error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
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
    final d =
        await widget.api.workspace(
              '/api/owner/job?id=${Uri.encodeQueryComponent(widget.id)}',
            )
            as Map;
    if (!mounted) return;
    setState(() {
      job = d;
      final saved = objectMap(d['data']);
      lines = (saved['lines'] as List? ?? [])
          .map((x) => Map<String, dynamic>.from(x as Map))
          .toList();
    });
  });
  Future<void> save() async {
    final d = objectMap(job!['data']);
    await widget.api.workspace(
      '/api/owner/job',
      method: 'PUT',
      body: {
        'id': widget.id,
        'version': job!['version'],
        'data': {...d, 'lines': lines},
      },
    );
    await load();
  }

  Future<void> costs() async {
    final d = objectMap(job!['data']);
    final f = await editFields(context, 'Job time and costs', {
      'Labor minutes': '${d['laborMinutes'] ?? 0}',
      'Labor cost': moneyInput(d['laborCostCents'] as int? ?? 0),
      'Travel cost': moneyInput(d['travelCostCents'] as int? ?? 0),
      'Notes': d['notes'] as String? ?? '',
    });
    if (f == null) return;
    await widget.api.workspace(
      '/api/owner/job',
      method: 'PUT',
      body: {
        'id': widget.id,
        'version': job!['version'],
        'data': {
          'lines': lines,
          'laborMinutes': int.parse(f['Labor minutes']!),
          'laborCostCents': parseMoneyCents(f['Labor cost']!),
          'travelCostCents': parseMoneyCents(f['Travel cost']!),
          'notes': f['Notes'],
        },
      },
    );
    await load();
  }

  Future<void> selectService() async {
    final dashboard = await widget.api.workspace('/api/owner/dashboard') as Map;
    if (!mounted) return;
    final service = await chooseRow(
      context,
      'Select service or add-on',
      (dashboard['services'] as List)
          .where((s) => (s as Map)['enabled'] == true)
          .toList(),
      (r) => r['name'] as String,
    );
    if (service == null || !mounted) return;
    final charge = await editCharge(
      context,
      line: {
        'description': service['name'],
        'unit': 'service',
        'quantityMillis': 1000,
        'unitPriceCents': service['min'] ?? 0,
        'unitCostCents': 0,
        'taxable': false,
      },
    );
    if (charge != null && mounted) setState(() => lines.add(charge));
  }

  Future<void> useMaterial() async {
    final data = await widget.api.workspace('/api/owner/materials') as Map;
    if (!mounted) return;
    final row = await chooseRow(
      context,
      'Select material',
      data['records'] as List,
      (r) {
        final d = objectMap(r['data']);
        return '${d['product']} · ${quantityInput(r['available_quantity_millis'] as int)} ${d['unit']} available';
      },
    );
    if (row == null || !mounted) return;
    final d = objectMap(row['data']);
    final f = await editFields(context, 'Confirm material used', {
      'Quantity in ${d['unit']}': '1',
      'Note': 'Used on job',
    });
    if (f == null) return;
    await widget.api.workspace(
      '/api/owner/inventory',
      method: 'POST',
      key: 'usage-${DateTime.now().microsecondsSinceEpoch}',
      body: {
        'kind': 'usage',
        'jobId': widget.id,
        'materialId': row['id'],
        'version': row['stock_version'],
        'quantityMillis': quantityMillis(f.values.first),
        'reason': f['Note'],
      },
    );
    await load();
  }

  Future<void> invoice() async {
    final f = await editFields(context, 'Invoice completed job', {
      'Discount': '0',
      'Tax rate percent': '0',
      'Invoice notes': '',
    });
    if (f == null) return;
    final selected =
        await widget.api.workspace(
              '/api/owner/invoice-photos?booking=${job!['booking_id']}',
            )
            as List;
    final result =
        await widget.api.workspace(
              '/api/owner/documents',
              method: 'POST',
              body: {
                'kind': 'invoice',
                'jobId': widget.id,
                'jobVersion': job!['version'],
                'bookingId': job!['booking_id'],
                'customerId': job!['customer_id'],
                'discountCents': parseMoneyCents(f['Discount']!),
                'taxBps': parseMoneyCents(f['Tax rate percent']!),
                'notes': f['Invoice notes'],
                'photoIds': selected.map((p) => (p as Map)['id']).toList(),
              },
            )
            as Map;
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Draft invoice created: ${result['id']}. Review it in Estimates & invoices.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext c) => Scaffold(
    appBar: AppBar(
      title: const Text('Job details'),
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
        if (job != null) ...[
          Text(statusLabel(job!['status'] as String)),
          Text(
            '${objectMap(job!['customer'])['firstName']} ${objectMap(job!['customer'])['lastName']}',
          ),
          const Text(
            'Save service and approved additional charges before completing the job. Inventory usage is added to the invoice automatically.',
          ),
          for (var i = 0; i < lines.length; i++)
            ListTile(
              title: Text(lines[i]['description'] as String),
              subtitle: Text(
                '${quantityInput(lines[i]['quantityMillis'] as int)} × \$${moneyInput(lines[i]['unitPriceCents'] as int)}',
              ),
              onTap: busy
                  ? null
                  : () => run(() async {
                      final l = await editCharge(c, line: lines[i]);
                      if (l != null) setState(() => lines[i] = l);
                    }),
              trailing: IconButton(
                tooltip: 'Remove charge',
                onPressed: busy
                    ? null
                    : () => setState(() => lines.removeAt(i)),
                icon: const Icon(Icons.delete_outline),
              ),
            ),
          if ([
            'confirmed',
            'rescheduled',
            'in_progress',
          ].contains(job!['status'])) ...[
            Wrap(
              spacing: 8,
              children: [
                TextButton(
                  onPressed: busy ? null : () => run(selectService),
                  child: const Text('Select service or add-on'),
                ),
                TextButton(
                  onPressed: busy
                      ? null
                      : () => run(() async {
                          final l = await editCharge(c);
                          if (l != null) setState(() => lines.add(l));
                        }),
                  child: const Text('Add charge'),
                ),
                FilledButton(
                  onPressed: busy ? null : () => run(save),
                  child: const Text('Save charges'),
                ),
                TextButton(
                  onPressed: busy ? null : () => run(costs),
                  child: const Text('Labor, travel & notes'),
                ),
                TextButton(
                  onPressed: busy ? null : () => run(useMaterial),
                  child: const Text('Use material'),
                ),
              ],
            ),
          ],
          TextButton(
            onPressed: () => Navigator.push<void>(
              c,
              MaterialPageRoute(
                builder: (_) => JobPhotos(
                  api: widget.api,
                  bookingId: job!['booking_id'] as String,
                ),
              ),
            ),
            child: const Text('Before & after photos'),
          ),
          TextButton(
            onPressed: () async {
              final d =
                  await widget.api.workspace('/api/owner/dashboard') as Map;
              if (!c.mounted) return;
              await Navigator.push<void>(
                c,
                MaterialPageRoute(
                  builder: (_) => BookingDetails(
                    api: widget.api,
                    bookingId: job!['booking_id'] as String,
                    clock: BusinessTime(
                      (d['settings'] as Map)['timezone'] as String,
                    ),
                  ),
                ),
              );
              await load();
            },
            child: const Text('Appointment details & status'),
          ),
          const Divider(),
          const Text('Recorded materials'),
          for (final m in job!['materials'] as List)
            ListTile(
              title: Text(objectMap(m['data'])['product'] as String),
              subtitle: Text(
                '${quantityInput(-(m['quantity_millis'] as int))} ${objectMap(m['data'])['unit']} · cost \$${moneyInput(m['cost_cents'] as int)}',
              ),
            ),
          if (job!['status'] == 'completed')
            FilledButton(
              onPressed: busy ? null : () => run(invoice),
              child: const Text('Create job invoice'),
            ),
        ],
      ],
    ),
  );
}
