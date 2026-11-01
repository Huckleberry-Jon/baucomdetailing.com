import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'owner_api.dart';
import 'business_time.dart';

class ScheduleAppointmentScreen extends StatefulWidget {
  const ScheduleAppointmentScreen({super.key, required this.api});
  final OwnerApi api;
  @override
  State<ScheduleAppointmentScreen> createState() => _ScheduleAppointmentState();
}

class _ScheduleAppointmentState extends State<ScheduleAppointmentScreen> {
  final form = GlobalKey<FormState>();
  final scroll = ScrollController();
  final fields = {
    for (final name in [
      'First name',
      'Last name',
      'Phone',
      'Email (optional)',
      'Service address',
      'Year',
      'Make',
      'Model',
      'Color',
      'Body type',
      'Duration minutes',
      'Notes',
    ])
      name: TextEditingController(),
  };
  List<Map<String, dynamic>> services = [];
  BusinessTime? clock;
  String? packageId, error, lastPayload, key;
  final addons = <String>{};
  DateTime? date;
  TimeOfDay time = const TimeOfDay(hour: 8, minute: 0);
  bool busy = true;
  @override
  void initState() {
    super.initState();
    fields['Duration minutes']!.text = '90';
    load();
  }

  @override
  void dispose() {
    scroll.dispose();
    for (final c in fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> load() async {
    setState(() => busy = true);
    try {
      final data = await widget.api.workspace('/api/owner/dashboard') as Map;
      if (!mounted) return;
      services = (data['services'] as List)
          .map((x) => Map<String, dynamic>.from(x as Map))
          .where((s) => s['enabled'] == true || s['enabled'] == 1)
          .toList();
      clock = BusinessTime((data['settings'] as Map)['timezone'] as String);
    } catch (e) {
      error = e.toString();
    }
    if (mounted) setState(() => busy = false);
  }

  Future<void> save() async {
    if (!form.currentState!.validate()) return;
    if (date == null || packageId == null) {
      setState(() => error = 'Choose a service and appointment date.');
      return;
    }
    final instants = clock!.wallInstants(date!, time.hour, time.minute);
    if (instants.length != 1) {
      setState(
        () => error =
            'This time is ambiguous or unavailable because clocks change. Choose another time.',
      );
      return;
    }
    final body = <String, dynamic>{
      'firstName': fields['First name']!.text.trim(),
      'lastName': fields['Last name']!.text.trim(),
      'phone': fields['Phone']!.text.trim(),
      'email': fields['Email (optional)']!.text.trim(),
      'address': fields['Service address']!.text.trim(),
      'year': int.tryParse(fields['Year']!.text),
      'make': fields['Make']!.text.trim(),
      'model': fields['Model']!.text.trim(),
      'color': fields['Color']!.text.trim(),
      'bodyType': fields['Body type']!.text.trim(),
      'concerns': fields['Notes']!.text.trim(),
      'durationMinutes': int.tryParse(fields['Duration minutes']!.text),
      'packageId': packageId,
      'addonIds': addons.toList()..sort(),
      'requestedAt': instants.single.toIso8601String(),
    };
    final payload = jsonEncode(body);
    if (payload != lastPayload) {
      key = List.generate(
        24,
        (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
      ).join();
      lastPayload = payload;
    }
    setState(() => busy = true);
    try {
      await widget.api.workspace(
        '/api/owner/appointments',
        method: 'POST',
        body: body,
        key: key,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString());
        if (scroll.hasClients) {
          await scroll.animateTo(
            0,
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
          );
        }
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Schedule appointment')),
    body: SafeArea(
      child: Form(
        key: form,
        child: ListView(
          controller: scroll,
          padding: const EdgeInsets.all(20),
          children: [
            if (busy) const LinearProgressIndicator(),
            if (error != null)
              Text(
                error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            if (clock == null && !busy)
              TextButton(onPressed: load, child: const Text('Retry')),
            if (clock != null) ...[
              Text('Phone, text or in-person booking · ${clock!.zone}'),
              const Text(
                'Saves a confirmed appointment. Working hours, blocked dates and existing appointments are checked.',
              ),
              DropdownButtonFormField<String>(
                initialValue: packageId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Service'),
                items: services
                    .where((s) => s['kind'] == 'package')
                    .map(
                      (s) => DropdownMenuItem(
                        value: s['id'] as String,
                        child: Text(s['name'] as String),
                      ),
                    )
                    .toList(),
                onChanged: busy
                    ? null
                    : (v) => setState(() {
                        packageId = v;
                        addons.clear();
                        final selected = services.firstWhere(
                          (s) => s['id'] == v,
                        );
                        fields['Duration minutes']!.text =
                            '${selected['durationMinutes'] ?? 90}';
                      }),
              ),
              for (final a in services.where(
                (s) =>
                    s['kind'] == 'addon' &&
                    (s['packageIds'] as List? ?? []).contains(packageId),
              ))
                CheckboxListTile(
                  title: Text(a['name'] as String),
                  value: addons.contains(a['id']),
                  onChanged: busy
                      ? null
                      : (v) => setState(() {
                          if (v == true) {
                            addons.add(a['id'] as String);
                          } else {
                            addons.remove(a['id']);
                          }
                        }),
                ),
              OutlinedButton(
                onPressed: busy
                    ? null
                    : () async {
                        final now = clock!.day(DateTime.now());
                        final d = await showDatePicker(
                          context: context,
                          initialDate: date ?? now,
                          firstDate: now,
                          lastDate: now.add(const Duration(days: 365)),
                        );
                        if (d != null && mounted) setState(() => date = d);
                      },
                child: Text(
                  date == null ? 'Choose date' : clock!.dateKey(date!),
                ),
              ),
              OutlinedButton(
                onPressed: busy
                    ? null
                    : () async {
                        final t = await showTimePicker(
                          context: context,
                          initialTime: time,
                        );
                        if (t != null && mounted) setState(() => time = t);
                      },
                child: Text('Time: ${time.format(context)} (${clock!.zone})'),
              ),
              for (final entry in fields.entries)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: TextFormField(
                    controller: entry.value,
                    enabled: !busy,
                    decoration: InputDecoration(labelText: entry.key),
                    keyboardType:
                        ['Year', 'Duration minutes'].contains(entry.key)
                        ? TextInputType.number
                        : entry.key == 'Phone'
                        ? TextInputType.phone
                        : entry.key == 'Email (optional)'
                        ? TextInputType.emailAddress
                        : TextInputType.text,
                    validator: (v) {
                      if (['Email (optional)', 'Notes'].contains(entry.key)) {
                        return null;
                      }
                      if (v == null || v.trim().isEmpty) return 'Required';
                      if (entry.key == 'Duration minutes' &&
                          ((int.tryParse(v) ?? 0) < 1 ||
                              (int.tryParse(v) ?? 0) > 720)) {
                        return 'Enter 1–720 minutes';
                      }
                      return null;
                    },
                  ),
                ),
              FilledButton.icon(
                onPressed: busy ? null : save,
                icon: const Icon(Icons.event_available),
                label: const Text('Save appointment'),
              ),
            ],
          ],
        ),
      ),
    ),
  );
}
