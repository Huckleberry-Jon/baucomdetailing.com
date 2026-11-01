import 'dart:convert';
import 'package:flutter/material.dart';
import 'owner_api.dart';
import 'business_forms.dart';

class ServiceSuppliesScreen extends StatefulWidget {
  const ServiceSuppliesScreen({super.key, required this.api});
  final OwnerApi api;
  @override
  State<ServiceSuppliesScreen> createState() => _ServiceSuppliesState();
}

class _ServiceSuppliesState extends State<ServiceSuppliesScreen> {
  List<Map<String, dynamic>> services = [];
  List<Map> materials = [];
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final d = await widget.api.workspace('/api/owner/dashboard') as Map,
          m = await widget.api.workspace('/api/owner/materials') as Map;
      if (mounted) {
        setState(() {
          services = (d['services'] as List)
              .map((s) => Map<String, dynamic>.from(s as Map))
              .toList();
          materials = (m['records'] as List).cast<Map>();
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Map details(Map m) => m['data'] is String
      ? jsonDecode(m['data'] as String) as Map
      : m['data'] as Map;
  Future<void> edit(Map service, {int? index}) async {
    final entries = (service['consumables'] as List? ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
    Map? product;
    if (index == null) {
      product = await chooseRow(context, 'Assign consumable', materials, (r) {
        final d = details(r);
        return '${d['product']} (${d['unit']})';
      });
    } else {
      final match = materials.where(
        (r) => r['id'] == entries[index]['materialId'],
      );
      if (match.isNotEmpty) product = match.first;
    }
    if (product == null || !mounted) return;
    final selected = product,
        d = details(selected),
        f = await editFields(context, 'Consumable used per service', {
          'Quantity in ${d['unit']}': quantityInput(
            index == null ? 1000 : entries[index]['quantityMillis'] as int,
          ),
        });
    if (f == null) return;
    try {
      final qty = quantityMillis(f['Quantity in ${d['unit']}']!);
      if (qty <= 0 || qty > 1000000) {
        throw const FormatException(
          'Enter a positive quantity up to 1000 units.',
        );
      }
      final value = {
        'materialId': selected['id'],
        'quantityMillis': qty,
        'billSeparately': false,
      };
      if (index == null) {
        if (entries.any((e) => e['materialId'] == selected['id'])) {
          throw const FormatException(
            'This consumable is already assigned. Edit its quantity.',
          );
        }
        entries.add(value);
      } else {
        entries[index] = value;
      }
      setState(() => service['consumables'] = entries);
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  Future<void> save(Map service) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = await widget.api.workspace(
        '/api/owner/service-consumables',
        method: 'PUT',
        body: {
          'serviceId': service['id'],
          'version': service['version'],
          'consumables': service['consumables'] ?? [],
        },
      );
      if (mounted) {
        setState(
          () => service['version'] =
              (result as Map?)?['version'] ?? (service['version'] as int) + 1,
        );
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Consumables saved for ${service['name']}')),
        );
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Service consumables'),
      actions: [
        IconButton(
          onPressed: busy ? null : load,
          icon: const Icon(Icons.refresh),
          tooltip: 'Reload service supplies',
        ),
      ],
    ),
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Assign rags to each service that uses them, and soap only to a wash. Consumable costs are included in the service price by default. Jobs ask for actual use before stock is deducted. Changes apply to new booking requests; existing jobs keep their saved plan.',
          ),
          if (busy) const LinearProgressIndicator(),
          if (error != null)
            Text(
              error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          for (final service in services)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      service['name'] as String,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    for (
                      var i = 0;
                      i < (service['consumables'] as List? ?? []).length;
                      i++
                    )
                      Builder(
                        builder: (c) {
                          final item =
                                  (service['consumables'] as List)[i] as Map,
                              matches = materials.where(
                                (m) => m['id'] == item['materialId'],
                              ),
                              d = matches.isEmpty
                                  ? <String, dynamic>{}
                                  : details(matches.first);
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(
                              '${d['product'] ?? 'Unavailable product'} · ${quantityInput(item['quantityMillis'] as int)} ${d['unit'] ?? ''}',
                            ),
                            subtitle: const Text('Included in service price'),
                            onTap: busy ? null : () => edit(service, index: i),
                            trailing: IconButton(
                              onPressed: busy
                                  ? null
                                  : () => setState(() {
                                      final items = List.of(
                                        service['consumables'] as List,
                                      );
                                      items.removeAt(i);
                                      service['consumables'] = items;
                                    }),
                              icon: const Icon(Icons.delete_outline),
                              tooltip: 'Remove assignment',
                            ),
                          );
                        },
                      ),
                    Wrap(
                      children: [
                        TextButton.icon(
                          onPressed: busy ? null : () => edit(service),
                          icon: const Icon(Icons.add),
                          label: const Text('Assign consumable'),
                        ),
                        FilledButton(
                          onPressed: busy ? null : () => save(service),
                          child: const Text('Save assignments'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    ),
  );
}
