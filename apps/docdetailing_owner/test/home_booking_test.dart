import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/main.dart';
import 'package:docdetailing_owner/owner_api.dart';
import 'package:docdetailing_owner/booking_details.dart';
import 'calendar_test.dart' show CalendarFixture;

class HomeBookingFixture extends CalendarFixture {
  int reads = 0;
  @override
  Future<List<Booking>> bookings() async {
    reads++;
    return [
      Booking(
        id: 'booking-1',
        status: status,
        version: 7,
        customer: 'Fixture Customer',
        start: DateTime.now(),
      ),
    ];
  }
}

void main() {
  testWidgets(
    'home booking opens correct full details and refreshes on return without calendar',
    (tester) async {
      final api = HomeBookingFixture();
      await tester.pumpWidget(OwnerApp(api: api));
      await tester.tap(find.text('Sign in'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Fixture Customer'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Fixture Customer'));
      await tester.pumpAndSettle();
      expect(find.byType(BookingDetails), findsOneWidget);
      expect(api.queries, contains('/api/owner/booking?id=booking-1'));
      expect(api.queries.any((p) => p.contains('/calendar')), isFalse);
      expect(api.writes, isEmpty);
      expect(find.textContaining('Fixture address'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(api.reads, 2);
      expect(find.byType(BookingDetails), findsNothing);
    },
  );
}
