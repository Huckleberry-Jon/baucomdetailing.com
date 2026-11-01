import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/home_dashboard.dart';
import 'package:docdetailing_owner/owner_api.dart';

void main() {
  testWidgets(
    'dashboard counts active work and opens calendar and records on a narrow screen',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var calendar = 0, customers = 0, website = 0, awaiting = 0;
      final future = DateTime.now().add(const Duration(days: 2));
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: HomeDashboard(
                bookings: [
                  Booking(
                    id: '1',
                    status: 'pending',
                    version: 1,
                    customer: 'Pending',
                    start: future,
                  ),
                  Booking(
                    id: '2',
                    status: 'rescheduled',
                    version: 1,
                    customer: 'Confirmed',
                    start: future,
                  ),
                  Booking(
                    id: '3',
                    status: 'cancelled',
                    version: 1,
                    customer: 'Cancelled',
                    start: future,
                  ),
                ],
                onCalendar: () => calendar++,
                onAwaitingReview: () => awaiting++,
                onCustomers: () => customers++,
                onWebsite: () => website++,
              ),
            ),
          ),
        ),
      );
      expect(find.text('1'), findsNWidgets(2));
      expect(find.textContaining('(device time)'), findsOneWidget);
      await tester.ensureVisible(find.text('Awaiting review'));
      await tester.tap(find.text('Awaiting review'));
      expect(awaiting, 1);
      await tester.tap(find.text('Calendar'));
      expect(calendar, 1);
      await tester.ensureVisible(find.text('Edit website & photos'));
      await tester.tap(find.text('Edit website & photos'));
      expect(website, 1);
      await tester.ensureVisible(find.text('Open calendar'));
      await tester.tap(find.text('Open calendar'));
      await tester.ensureVisible(find.text('Customer records'));
      await tester.tap(find.text('Customer records'));
      expect(calendar, 2);
      expect(customers, 1);
      expect(tester.takeException(), isNull);
    },
  );
}
