import 'package:flutter/material.dart';
import 'owner_api.dart';
import 'booking_details.dart';

class BookingListScreen extends StatefulWidget {
  const BookingListScreen({
    super.key,
    required this.history,
    required this.initialBookings,
    required this.load,
    required this.onOpen,
  });
  final bool history;
  final List<Booking> initialBookings;
  final Future<List<Booking>> Function() load;
  final Future<void> Function(Booking) onOpen;
  @override
  State<BookingListScreen> createState() => _BookingListScreenState();
}

class _BookingListScreenState extends State<BookingListScreen> {
  late List<Booking> rows = widget.initialBookings;
  bool busy = false;
  String? error;
  Future<void> reload() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final updated = await widget.load();
      if (mounted) setState(() => rows = updated);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered =
        rows
            .where(
              (b) => widget.history
                  ? ['completed', 'cancelled', 'declined'].contains(b.status)
                  : b.status == 'pending',
            )
            .toList()
          ..sort(
            (a, b) => widget.history
                ? b.start.compareTo(a.start)
                : a.start.compareTo(b.start),
          );
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.history ? 'Booking history' : 'Awaiting review'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: busy ? null : reload,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          padding: const EdgeInsets.all(16),
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            if (busy) const LinearProgressIndicator(),
            if (error != null)
              Text(
                error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            if (filtered.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Text(
                  widget.history
                      ? 'No completed or cancelled bookings yet.'
                      : 'No appointments awaiting review.',
                ),
              ),
            for (final b in filtered)
              Card(
                child: ListTile(
                  title: Text(b.customer),
                  subtitle: Text(
                    '${statusLabel(b.status)}\n${MaterialLocalizations.of(context).formatMediumDate(b.start.toLocal())} - ${MaterialLocalizations.of(context).formatTimeOfDay(TimeOfDay.fromDateTime(b.start.toLocal()))} (device time)',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  isThreeLine: true,
                  onTap: busy
                      ? null
                      : () async {
                          await widget.onOpen(b);
                          if (mounted) await reload();
                        },
                ),
              ),
          ],
        ),
      ),
    );
  }
}
