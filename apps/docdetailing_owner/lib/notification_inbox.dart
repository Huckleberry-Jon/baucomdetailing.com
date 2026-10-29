import 'package:flutter/material.dart';
import 'owner_api.dart';
import 'native_notifications.dart';
import 'booking_details.dart';
import 'business_time.dart';

class NotificationInbox extends StatefulWidget {
  const NotificationInbox({super.key, required this.api, this.native});
  final OwnerApi api;
  final NativeNotifications? native;
  @override
  State<NotificationInbox> createState() => _NotificationInboxState();
}

class _NotificationInboxState extends State<NotificationInbox> {
  final List<Map<String, dynamic>> rows = [];
  String? cursor, error;
  int unread = 0;
  bool busy = false, onlyUnread = false;
  @override
  void initState() {
    super.initState();
    widget.native?.addListener(update);
    load();
  }

  void update() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.native?.removeListener(update);
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final query = Uri(
        queryParameters: {
          'unread': '$onlyUnread',
          if (more && cursor != null) 'before': cursor!,
        },
      ).query;
      final data = await widget.api.workspace('/api/owner/inbox?$query') as Map;
      if (mounted) {
        setState(() {
          if (!more) rows.clear();
          rows.addAll(
            (data['notifications'] as List).map(
              (x) => Map<String, dynamic>.from(x as Map),
            ),
          );
          cursor = data['nextCursor'] as String?;
          unread = data['unread'] as int;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => error =
              'Could not load notifications. Check your connection and retry.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> open(Map<String, dynamic> row) async {
    try {
      final dashboard =
          await widget.api.workspace('/api/owner/dashboard') as Map;
      final clock = BusinessTime(
        (dashboard['settings'] as Map)['timezone'] as String,
      );
      await widget.api.workspace(
        '/api/owner/read',
        method: 'POST',
        body: {'id': row['id']},
      );
      if (!mounted) return;
      await Navigator.push<void>(
        context,
        MaterialPageRoute(
          builder: (_) => BookingDetails(
            api: widget.api,
            bookingId: row['booking_id'] as String,
            clock: clock,
          ),
        ),
      );
      await load();
      await widget.native?.synchronize();
    } catch (_) {
      if (mounted) {
        setState(
          () => error = 'Appointment unavailable. Refresh or sign in again.',
        );
      }
    }
  }

  Future<void> configure(Future<void> Function() work) async {
    await work();
    if (mounted) setState(() {});
  }

  String title(String event) =>
      const {
        'booking.requested': 'New booking request',
        'booking.cancelled': 'Appointment cancelled',
        'booking.cancel': 'Appointment cancelled',
        'booking.accept': 'Customer accepted proposed time',
        'customer.cancelled': 'Customer cancelled',
        'customer.reschedule_requested': 'Customer requested another time',
        'customer.accepted': 'Customer accepted appointment',
        'appointment.reminder': 'Appointment reminder',
        'payment.recorded': 'Payment recorded',
      }[event] ??
      event.replaceAll('.', ' ').replaceAll('_', ' ');
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text('Notifications · $unread unread'),
      actions: [
        IconButton(
          tooltip: 'Refresh inbox',
          onPressed: busy ? null : load,
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (widget.native case final native?) ...[
          Text('iPhone permission: ${native.permission}'),
          if (native.message != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(native.message!),
            ),
          Wrap(
            spacing: 8,
            children: [
              FilledButton(
                onPressed: () =>
                    configure(() => native.synchronize(request: true)),
                child: const Text('Enable iPhone notifications'),
              ),
              TextButton(
                onPressed: () => configure(native.disable),
                child: const Text('Disable this device'),
              ),
              TextButton(
                onPressed: () => configure(native.platform.settings),
                child: const Text('iPhone settings'),
              ),
            ],
          ),
        ],
        SwitchListTile(
          title: const Text('Unread only'),
          value: onlyUnread,
          onChanged: busy
              ? null
              : (v) {
                  onlyUnread = v;
                  load();
                },
        ),
        if (busy) const LinearProgressIndicator(),
        if (error != null)
          Text(
            error!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        if (rows.isEmpty && !busy)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('No notifications to show.'),
          ),
        for (final row in rows)
          ListTile(
            leading: Icon(
              row['read_at'] == null ? Icons.mark_email_unread : Icons.drafts,
            ),
            title: Text(title((row['event'] as String).split(':').first)),
            subtitle: Text('Open appointment details'),
            onTap: () => open(row),
            trailing: IconButton(
              tooltip: row['read_at'] == null ? 'Mark read' : 'Mark unread',
              icon: const Icon(Icons.mark_email_read),
              onPressed: () async {
                try {
                  await widget.api.workspace(
                    '/api/owner/read',
                    method: 'POST',
                    body: {'id': row['id'], 'read': row['read_at'] == null},
                  );
                  await load();
                  await widget.native?.synchronize();
                } catch (_) {
                  if (mounted) {
                    setState(
                      () => error =
                          'Could not update notification. Retry when connected.',
                    );
                  }
                }
              },
            ),
          ),
        if (cursor != null)
          TextButton(
            onPressed: busy ? null : () => load(more: true),
            child: const Text('Load older notifications'),
          ),
      ],
    ),
  );
}
