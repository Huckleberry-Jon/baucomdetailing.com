import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/booking_list_screen.dart';
import 'package:docdetailing_owner/owner_api.dart';

void main() {
  final rows = [
    for (final status in ['pending', 'confirmed', 'completed', 'cancelled'])
      Booking(
        id: status,
        status: status,
        version: 1,
        customer: '$status customer',
        start: DateTime(2026, 11, 7, 9),
      ),
  ];
  testWidgets(
    'history keeps active bookings out and opens the selected appointment',
    (tester) async {
      String? opened;
      await tester.pumpWidget(
        MaterialApp(
          home: BookingListScreen(
            history: true,
            initialBookings: rows,
            load: () async => rows,
            onOpen: (b) async {
              opened = b.id;
            },
          ),
        ),
      );
      expect(find.text('completed customer'), findsOneWidget);
      expect(find.text('cancelled customer'), findsOneWidget);
      expect(find.text('pending customer'), findsNothing);
      expect(find.text('confirmed customer'), findsNothing);
      await tester.tap(find.text('completed customer'));
      await tester.pumpAndSettle();
      expect(opened, 'completed');
    },
  );
  testWidgets(
    'awaiting review filters requests and refreshes after a decision',
    (tester) async {
      var changed = false;
      await tester.pumpWidget(
        MaterialApp(
          home: BookingListScreen(
            history: false,
            initialBookings: rows,
            load: () async => changed
                ? rows.where((b) => b.status != 'pending').toList()
                : rows,
            onOpen: (b) async {
              changed = true;
            },
          ),
        ),
      );
      expect(find.text('pending customer'), findsOneWidget);
      expect(find.text('completed customer'), findsNothing);
      await tester.tap(find.text('pending customer'));
      await tester.pumpAndSettle();
      expect(find.text('pending customer'), findsNothing);
      expect(find.text('No appointments awaiting review.'), findsOneWidget);
    },
  );
}
