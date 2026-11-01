import 'package:flutter/material.dart';
import 'owner_api.dart';
import 'service_supplies_screen.dart';

class ServiceShortcuts extends StatefulWidget {
  const ServiceShortcuts({super.key, required this.api});
  final OwnerApi api;
  @override
  State<ServiceShortcuts> createState() => _ServiceShortcutsState();
}

class _ServiceShortcutsState extends State<ServiceShortcuts> {
  late Future<Object?> services;
  @override
  void initState() {
    super.initState();
    services = widget.api.workspace('/api/owner/dashboard');
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Object?>(
    future: services,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return TextButton(
          onPressed: () => setState(
            () => services = widget.api.workspace('/api/owner/dashboard'),
          ),
          child: const Text('Reload service buttons'),
        );
      }
      final data = snapshot.data,
          rows = data is Map ? (data['services'] as List? ?? []) : [];
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Services & supplies'),
            const SizedBox(height: 8),
            if (snapshot.connectionState == ConnectionState.waiting)
              const LinearProgressIndicator(),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final row in rows.where((s) => s['enabled'] != false))
                  OutlinedButton(
                    onPressed: () {
                      Navigator.pop(context);
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => ServiceSuppliesScreen(
                            api: widget.api,
                            serviceId: row['id'] as String,
                          ),
                        ),
                      );
                    },
                    child: Text(row['name'] as String),
                  ),
              ],
            ),
          ],
        ),
      );
    },
  );
}
