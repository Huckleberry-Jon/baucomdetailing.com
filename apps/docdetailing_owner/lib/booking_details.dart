import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'owner_api.dart';
import 'business_time.dart';
import 'job_photos.dart';
import 'money.dart';

String statusLabel(String value) =>
    const {
      'pending': 'Pending',
      'confirmed': 'Confirmed',
      'rescheduled': 'Rescheduled',
      'awaiting_acceptance': 'Waiting for customer',
      'cancelled': 'Cancelled',
      'in_progress': 'In progress',
      'completed': 'Completed',
      'no_show': 'No show',
    }[value] ??
    value;
Map<String, dynamic> objectMap(Object? value) => value is String
    ? Map<String, dynamic>.from(jsonDecode(value) as Map)
    : Map<String, dynamic>.from(value as Map? ?? {});
Future<DateTime?> pickBusinessInstant(
  BuildContext context,
  BusinessTime clock,
  DateTime initial, {
  String label = 'Appointment time',
}) async {
  final day = await showDatePicker(
    context: context,
    initialDate: initial,
    firstDate: DateTime(2020),
    lastDate: DateTime(2100),
    helpText: '$label · ${clock.zone}',
  );
  if (day == null || !context.mounted) return null;
  final time = await showTimePicker(
    context: context,
    initialTime: const TimeOfDay(hour: 9, minute: 0),
    helpText: clock.zone,
  );
  if (time == null || !context.mounted) return null;
  final options = clock.wallInstants(day, time.hour, time.minute);
  if (options.isEmpty) {
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Time does not exist'),
        content: const Text(
          'This local time is skipped by a daylight-saving change. Choose another time.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c),
            child: const Text('OK'),
          ),
        ],
      ),
    );
    return null;
  }
  if (options.length == 1) return options.single;
  return showDialog<DateTime>(
    context: context,
    builder: (c) => SimpleDialog(
      title: const Text('Choose daylight-saving occurrence'),
      children: [
        for (final option in options)
          SimpleDialogOption(
            onPressed: () => Navigator.pop(c, option),
            child: Text(
              '${clock.label(option.toIso8601String())} · ${option.toIso8601String()} UTC',
            ),
          ),
      ],
    ),
  );
}

class BookingDetails extends StatefulWidget {
  const BookingDetails({
    super.key,
    required this.api,
    required this.bookingId,
    required this.clock,
  });
  final OwnerApi api;
  final String bookingId;
  final BusinessTime clock;
  @override
  State<BookingDetails> createState() => _BookingDetailsState();
}

class _BookingDetailsState extends State<BookingDetails> {
  Map<String, dynamic>? booking;
  List<Map<String, dynamic>> history = [], photos = [];
  String? error;
  bool busy = true;
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
      final id = Uri.encodeQueryComponent(widget.bookingId);
      final b = await widget.api.workspace('/api/owner/booking?id=$id') as Map;
      final h = await widget.api.workspace('/api/owner/history?id=$id') as List;
      final p =
          await widget.api.workspace('/api/owner/photos?booking=$id') as List;
      if (mounted) {
        setState(() {
          booking = Map<String, dynamic>.from(b);
          history = h.map((x) => Map<String, dynamic>.from(x as Map)).toList();
          photos = p.map((x) => Map<String, dynamic>.from(x as Map)).toList();
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<Map<String, String>?> editFields(
    String title,
    Map<String, String> initial,
  ) async {
    final controls = initial.map(
      (k, v) => MapEntry(k, TextEditingController(text: v)),
    );
    final formKey = GlobalKey<FormState>();
    final route = DialogRoute<Map<String, String>>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(title),
        content: SingleChildScrollView(
          child: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final e in controls.entries)
                  TextFormField(
                    controller: e.value,
                    keyboardType: TextInputType.numberWithOptions(
                      decimal: e.key != 'Duration minutes',
                    ),
                    decoration: InputDecoration(labelText: e.key),
                    validator: (v) {
                      if (e.key == 'Duration minutes') {
                        final n = int.tryParse(v ?? '');
                        return n != null && n > 0 && n <= 720
                            ? null
                            : 'Use 1 to 720 minutes';
                      }
                      try {
                        parseMoneyCents(v ?? '');
                        return null;
                      } catch (_) {
                        return 'Enter an amount with up to two decimal places';
                      }
                    },
                  ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (formKey.currentState!.validate()) {
                Navigator.pop(c, controls.map((k, v) => MapEntry(k, v.text)));
              }
            },
            child: const Text('Continue'),
          ),
        ],
      ),
    );
    final result = await Navigator.of(context).push(route);
    await route.completed;
    for (final c in controls.values) {
      c.dispose();
    }
    return result;
  }

  Future<void> transition(String action) async {
    final b = booking;
    if (b == null) return;
    final snapshot = objectMap(b['snapshot']),
        package = objectMap(snapshot['package']);
    final calculated =
        (package['durationMinutes'] as int? ?? 0) +
        (snapshot['addons'] as List? ?? []).fold<int>(
          0,
          (n, a) => n + ((a as Map)['durationMinutes'] as int? ?? 0),
        );
    Map<String, String>? fields;
    DateTime? instant;
    if (['confirm', 'propose'].contains(action)) {
      fields = await editFields(
        action == 'confirm' ? 'Confirm appointment' : 'Propose appointment',
        {
          'Duration minutes':
              '${b['end_ms'] != null ? ((b['end_ms'] as int) - (b['start_ms'] as int)) ~/ 60000 : calculated}',
          if (action == 'propose')
            'Proposed total (USD)': moneyInput(
              snapshot['estimatedMin'] as int? ?? 0,
            ),
        },
      );
      if (fields == null || !mounted) return;
    }
    if (action == 'propose') {
      instant = await pickBusinessInstant(
        context,
        widget.clock,
        widget.clock.day(
          DateTime.fromMillisecondsSinceEpoch(
            b['start_ms'] as int,
            isUtc: true,
          ),
        ),
      );
      if (instant == null || !mounted) return;
    }
    if (action == 'cancel') {
      final accepted = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Cancel this appointment?'),
          content: const Text(
            'The cancellation is recorded in the shared booking history.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('Keep appointment'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(c, true),
              child: const Text('Cancel appointment'),
            ),
          ],
        ),
      );
      if (accepted != true) return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.workspace(
        '/api/owner/transition',
        method: 'POST',
        body: {
          'id': b['id'],
          'version': b['version'],
          'action': action,
          if (fields != null)
            'durationMinutes': int.parse(fields['Duration minutes']!),
          if (instant != null) 'startAt': instant.toIso8601String(),
          if (action == 'propose')
            'priceCents': parseMoneyCents(fields!['Proposed total (USD)']!),
        },
      );
      await load();
    } catch (e) {
      if (mounted) {
        setState(() => error = '$e\nRefresh the appointment before retrying.');
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = booking,
        c = b == null ? <String, dynamic>{} : objectMap(b['customer']),
        v = b == null ? <String, dynamic>{} : objectMap(b['vehicle']),
        snapshot = b == null ? <String, dynamic>{} : objectMap(b['snapshot']),
        data = b == null ? <String, dynamic>{} : objectMap(b['data']);
    Object? requested = data['requestedAt'];
    if (requested == null && b != null) {
      for (final row in history) {
        final h = objectMap(row['data']);
        if (h['start_ms'] != null) {
          requested = h['start_ms'];
          break;
        }
      }
      if (requested == null && b['status'] == 'pending') {
        requested = b['start_ms'];
      }
    }
    final status = b?['status'] as String? ?? '';
    return Scaffold(
      appBar: AppBar(
        title: const Text('Appointment'),
        actions: [
          IconButton(
            tooltip: 'Refresh appointment',
            onPressed: busy ? null : load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (busy) const LinearProgressIndicator(),
            if (error != null)
              Text(
                error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            if (b != null) ...[
              Text(
                '${c['firstName'] ?? ''} ${c['lastName'] ?? ''}',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              Text(statusLabel(status)),
              Text(
                '${v['year'] ?? ''} ${v['make'] ?? ''} ${v['model'] ?? ''} · ${v['color'] ?? ''}',
              ),
              Text('Phone: ${c['phone'] ?? ''}\nEmail: ${c['email'] ?? ''}'),
              Text(
                'Service address: ${data['location'] ?? c['address'] ?? ''}',
              ),
              Text('Package: ${objectMap(snapshot['package'])['name'] ?? ''}'),
              Text(
                'Add-ons: ${(snapshot['addons'] as List? ?? []).map((a) => (a as Map)['name']).join(', ')}',
              ),
              Text(
                'Original request: ${requested == null ? 'Not available in this legacy record' : widget.clock.label(requested)}',
              ),
              Text(
                '${['pending', 'awaiting_acceptance'].contains(status) ? 'Scheduled/requested' : 'Confirmed/current'} time: ${widget.clock.label(b['start_ms'])}',
              ),
              Text(
                'Duration: ${b['end_ms'] == null ? 'Not yet confirmed' : '${((b['end_ms'] as int) - (b['start_ms'] as int)) ~/ 60000} minutes'}',
              ),
              Text('Notes: ${data['concerns'] ?? ''}'),
              if (b['proposal'] != null)
                Text(
                  'Proposed time: ${widget.clock.label(objectMap(b['proposal'])['startAt'])}\nWaiting for the customer to accept. The existing reservation remains in place.',
                ),
              Wrap(
                spacing: 8,
                children: [
                  if (status == 'pending')
                    FilledButton(
                      onPressed: busy ? null : () => transition('confirm'),
                      child: const Text('Confirm appointment'),
                    ),
                  if ([
                    'pending',
                    'confirmed',
                    'rescheduled',
                    'awaiting_acceptance',
                  ].contains(status)) ...[
                    OutlinedButton(
                      onPressed: busy ? null : () => transition('propose'),
                      child: const Text('Propose another time'),
                    ),
                    TextButton(
                      onPressed: busy ? null : () => transition('cancel'),
                      child: const Text('Cancel appointment'),
                    ),
                  ],
                  if (['confirmed', 'rescheduled'].contains(status))
                    FilledButton(
                      onPressed: busy ? null : () => transition('start'),
                      child: const Text('Start job'),
                    ),
                  if (status == 'in_progress')
                    FilledButton(
                      onPressed: busy ? null : () => transition('complete'),
                      child: const Text('Complete job'),
                    ),
                  TextButton(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute<void>(
                        builder: (_) => JobPhotos(
                          api: widget.api,
                          bookingId: widget.bookingId,
                        ),
                      ),
                    ),
                    child: const Text('Before & after photos'),
                  ),
                ],
              ),
              const Divider(),
              Text(
                'Customer vehicle-condition photos',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              for (final p in photos.where((p) => p['kind'] == 'intake'))
                FutureBuilder<List<int>>(
                  future: widget.api.privatePhoto(p['id'] as String),
                  builder: (c, image) {
                    if (image.hasError) {
                      return const Text('Photo unavailable. Refresh to retry.');
                    }
                    if (!image.hasData) return const LinearProgressIndicator();
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Image.memory(
                        Uint8List.fromList(image.data!),
                        height: 180,
                        fit: BoxFit.contain,
                        semanticLabel: 'Customer vehicle condition',
                      ),
                    );
                  },
                ),
              const Divider(),
              Text(
                'Booking history and customer responses',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              for (final h in history)
                ListTile(
                  title: Text('${h['event'] ?? h['action'] ?? ''}'),
                  subtitle: Text(
                    '${h['actor'] ?? ''} · ${widget.clock.label(h['created_at'])}',
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}
