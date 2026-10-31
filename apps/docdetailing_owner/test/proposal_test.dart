import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/booking_details.dart';
import 'package:docdetailing_owner/business_time.dart';
import 'calendar_test.dart' show CalendarFixture;

class ProposalApi extends CalendarFixture {
  @override
  Map<String, dynamic> get row => {
    ...super.row,
    'start_ms': DateTime.now()
        .toUtc()
        .add(const Duration(days: 7))
        .millisecondsSinceEpoch,
    'snapshot': {
      'package': {'name': 'Fixture service', 'durationMinutes': null},
      'addons': [],
      'estimatedMin': 7900,
    },
  };
}

void main() {
  testWidgets(
    'proposal exposes date and time, requires duration, and sends selected instant',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = ProposalApi();
      await tester.pumpWidget(
        MaterialApp(
          home: BookingDetails(
            api: api,
            bookingId: 'booking-1',
            clock: BusinessTime('UTC'),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('Propose another time'), 200);
      await tester.tap(find.text('Propose another time'));
      await tester.pumpAndSettle();
      expect(find.text('Appointment date and time (UTC)'), findsOneWidget);
      final duration = find.widgetWithText(TextFormField, 'Duration minutes');
      expect(tester.widget<TextFormField>(duration).controller!.text, isEmpty);
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(find.text('Use 1 to 720 minutes'), findsOneWidget);
      expect(api.writes, isEmpty);
      await tester.tap(find.byIcon(Icons.edit_calendar));
      await tester.pumpAndSettle();
      expect(find.byType(DatePickerDialog), findsOneWidget);
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      expect(find.byType(TimePickerDialog), findsOneWidget);
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      await tester.enterText(duration, '90');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      final body = api.writes.single['body'] as Map;
      expect(body['action'], 'propose');
      expect(body['durationMinutes'], 90);
      expect(body['priceCents'], 7900);
      final instant = DateTime.parse(body['startAt'] as String).toUtc();
      expect(instant.hour, 9);
      expect(instant.minute, 0);
      expect(instant.isAfter(DateTime.now()), isTrue);
      expect(tester.takeException(), isNull);
    },
  );
}
