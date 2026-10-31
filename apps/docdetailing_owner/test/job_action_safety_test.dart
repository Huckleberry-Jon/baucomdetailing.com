import 'package:docdetailing_owner/completion_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/booking_details.dart';
import 'package:docdetailing_owner/business_time.dart';
import 'package:docdetailing_owner/jobs_screen.dart';
import 'calendar_test.dart' show CalendarFixture;
import 'business_workflows_test.dart' show BusinessApi;

class CompletionApi extends BusinessApi {
  String status = 'in_progress';
  @override
  Future<Object?> workspace(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? key,
  }) async {
    if (path.contains('/job-completion')) {
      return {
        'job': {
          'customer': {'firstName': 'Test', 'lastName': 'Customer'},
          'status': 'in_progress',
          'booking_version': 7,
          'version': 4,
        },
        'quote': {
          'subtotalCents': 10000,
          'totalCents': 10000,
          'lines': [
            {'taxable': true, 'totalCents': 10000},
          ],
        },
        'invoice': null,
        'checkoutRecorded': false,
      };
    }
    final result = await super.workspace(
      path,
      method: method,
      body: body,
      key: key,
    );
    if (path == '/api/owner/transition') status = 'completed';
    if (path.contains('/job?')) {
      return {...result as Map, 'status': status, 'booking_version': 7};
    }
    return result;
  }
}

void main() {
  testWidgets(
    'cancellation requires explicit confirmation; keeping appointment writes nothing',
    (tester) async {
      final api = CalendarFixture()..status = 'confirmed';
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
      final cancel = find.widgetWithText(TextButton, 'Cancel appointment');
      await tester.ensureVisible(cancel);
      await tester.tap(cancel);
      await tester.pumpAndSettle();
      expect(api.writes, isEmpty);
      await tester.tap(find.text('Keep appointment'));
      await tester.pumpAndSettle();
      expect(api.writes, isEmpty);
      await tester.tap(cancel);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Cancel appointment'));
      await tester.pumpAndSettle();
      expect(api.writes.single['body']['action'], 'cancel');
      expect(api.writes.single['body']['version'], 7);
    },
  );
  testWidgets(
    'green Complete job opens payment confirmation without completing or recording money yet',
    (tester) async {
      final api = CompletionApi();
      await tester.pumpWidget(
        MaterialApp(
          home: JobScreen(api: api, id: 'job-1'),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Complete job'));
      await tester.pumpAndSettle();
      expect(find.byType(CompletionScreen), findsOneWidget);
      expect(find.text('Payment received (excluding tip)'), findsOneWidget);
      expect(api.writes.length, 1);
      expect(api.writes.single['path'], '/api/owner/job');
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(
        api.writes.where(
          (w) =>
              w['path'] == '/api/owner/transition' ||
              w['path'] == '/api/owner/job-completion',
        ),
        isEmpty,
      );
    },
  );
}
