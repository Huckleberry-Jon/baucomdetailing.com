import 'package:flutter/material.dart';
import 'owner_api.dart';

class HomeDashboard extends StatelessWidget {
  const HomeDashboard({
    super.key,
    required this.bookings,
    required this.onCalendar,
    required this.onAwaitingReview,
    required this.onCustomers,
    this.onWebsite,
  });
  final List<Booking> bookings;
  final VoidCallback onCalendar, onCustomers, onAwaitingReview;
  final VoidCallback? onWebsite;

  @override
  Widget build(BuildContext context) {
    final pending = bookings.where((b) => b.status == 'pending').length;
    final confirmed = bookings
        .where((b) => ['confirmed', 'rescheduled'].contains(b.status))
        .length;
    final upcoming =
        bookings
            .where(
              (b) =>
                  ['confirmed', 'rescheduled'].contains(b.status) &&
                  b.start.isAfter(DateTime.now()),
            )
            .toList()
          ..sort((a, b) => a.start.compareTo(b.start));
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'YOUR BUSINESS',
          style: theme.textTheme.labelLarge?.copyWith(
            color: theme.colorScheme.primary,
            letterSpacing: 2,
          ),
        ),
        const SizedBox(height: 8),
        Text('Ready for the road.', style: theme.textTheme.headlineMedium),
        const SizedBox(height: 6),
        const Text('Your appointments, customers and next steps in one place.'),
        if (onWebsite != null) ...[
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: onWebsite,
            icon: const Icon(Icons.web),
            label: const Text('Edit website & photos'),
          ),
          const SizedBox(height: 4),
          const Text(
            'Opens the owner dashboard in your browser. Sign in there to edit website photos and settings.',
          ),
        ],
        const SizedBox(height: 20),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            _summary(
              context,
              Icons.inbox_outlined,
              '$pending',
              'Awaiting review',
              onAwaitingReview,
            ),
            _summary(
              context,
              Icons.event_available,
              '$confirmed',
              'Calendar',
              onCalendar,
            ),
          ],
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Next appointment', style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                Text(
                  upcoming.isEmpty
                      ? 'Your next confirmed appointment will appear here.'
                      : '${MaterialLocalizations.of(context).formatMediumDate(upcoming.first.start.toLocal())} - ${MaterialLocalizations.of(context).formatTimeOfDay(TimeOfDay.fromDateTime(upcoming.first.start.toLocal()))} (device time)',
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 12,
                  runSpacing: 8,
                  children: [
                    FilledButton.icon(
                      onPressed: onCalendar,
                      icon: const Icon(Icons.calendar_month),
                      label: const Text('Open calendar'),
                    ),
                    OutlinedButton.icon(
                      onPressed: onCustomers,
                      icon: const Icon(Icons.people_outline),
                      label: const Text('Customer records'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _summary(
    BuildContext context,
    IconData icon,
    String value,
    String label,
    VoidCallback onTap,
  ) => Semantics(
    label: '$value $label',
    button: true,
    child: SizedBox(
      width: 150,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, color: Theme.of(context).colorScheme.primary),
                const SizedBox(height: 10),
                Text(value, style: Theme.of(context).textTheme.headlineMedium),
                Text(label),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
