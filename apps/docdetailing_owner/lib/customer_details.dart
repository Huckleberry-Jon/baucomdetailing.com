import 'package:flutter/material.dart';
import 'owner_api.dart';
import 'booking_details.dart';
import 'business_time.dart';
import 'business_forms.dart';

class CustomerDetails extends StatefulWidget {
  const CustomerDetails({super.key, required this.api, required this.id});
  final OwnerApi api;
  final String id;
  @override
  State<CustomerDetails> createState() => _CustomerDetailsState();
}

class _CustomerDetailsState extends State<CustomerDetails> {
  Map? record;
  BusinessTime? clock;
  String? error;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    load();
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

  Future<void> fetch() async {
    final d = await widget.api.workspace('/api/owner/dashboard') as Map;
    final r =
        await widget.api.workspace(
              '/api/owner/customer?id=${Uri.encodeQueryComponent(widget.id)}',
            )
            as Map;
    if (mounted) {
      setState(() {
        record = r;
        clock = BusinessTime((d['settings'] as Map)['timezone'] as String);
      });
    }
  }

  Future<void> load() => run(fetch);
  Future<void> addVehicle() async {
    final f = await editFields(context, 'Add vehicle', {
      'Year': '${DateTime.now().year}',
      'Make': '',
      'Model': '',
      'Color': '',
      'Body type': 'sedan',
    });
    if (f == null) return;
    await widget.api.workspace(
      '/api/owner/vehicles',
      method: 'POST',
      body: {
        'customerId': widget.id,
        'data': {
          'year': int.parse(f['Year']!),
          'make': f['Make'],
          'model': f['Model'],
          'color': f['Color'],
          'bodyType': f['Body type'],
        },
      },
    );
    await fetch();
  }

  @override
  Widget build(BuildContext c) => Scaffold(
    appBar: AppBar(
      title: const Text('Customer history'),
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
        if (error != null) Text(error!),
        if (record case final r?) ...[
          Text(
            '${r['data']['firstName']} ${r['data']['lastName']}',
            style: Theme.of(c).textTheme.titleLarge,
          ),
          Text(
            '${r['data']['phone']}\n${r['data']['email']}\n${r['data']['address']}',
          ),
          Text(r['data']['notes'] as String? ?? ''),
          TextButton(
            onPressed: busy
                ? null
                : () => run(() async {
                    final d = Map<String, dynamic>.from(r['data'] as Map);
                    d.putIfAbsent('notes', () => '');
                    final f = await editFields(
                      c,
                      'Customer details',
                      d.map((k, v) => MapEntry(k, v.toString())),
                    );
                    if (f == null) return;
                    await widget.api.workspace(
                      '/api/owner/customers',
                      method: 'PUT',
                      body: {
                        'id': widget.id,
                        'version': r['version'],
                        'data': f,
                      },
                    );
                    await fetch();
                  }),
            child: const Text('Edit customer & notes'),
          ),
          const Divider(),
          const Text('Vehicles'),
          for (final v in r['vehicles'] as List)
            ListTile(
              title: Text(
                '${objectMap(v['data'])['year']} ${objectMap(v['data'])['make']} ${objectMap(v['data'])['model']}',
              ),
              subtitle: Text(objectMap(v['data'])['color'] as String),
            ),
          TextButton(
            onPressed: busy ? null : () => run(addVehicle),
            child: const Text('Add vehicle'),
          ),
          const Divider(),
          const Text('Service history'),
          for (final b in r['bookings'] as List)
            ListTile(
              title: Text(
                '${clock?.label(b['start_ms'])} · ${statusLabel(b['status'] as String)}',
              ),
              subtitle: Text(
                objectMap(b['snapshot'])['package']?['name'] as String? ??
                    'Appointment',
              ),
              onTap: () async {
                await Navigator.push<void>(
                  c,
                  MaterialPageRoute(
                    builder: (_) => BookingDetails(
                      api: widget.api,
                      bookingId: b['id'] as String,
                      clock: clock!,
                    ),
                  ),
                );
                await load();
              },
            ),
        ],
      ],
    ),
  );
}
