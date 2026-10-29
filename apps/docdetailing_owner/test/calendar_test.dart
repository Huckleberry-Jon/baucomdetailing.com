import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/owner_api.dart';
import 'package:docdetailing_owner/calendar_screen.dart';
import 'package:docdetailing_owner/booking_details.dart';
import 'package:docdetailing_owner/business_time.dart';

class CalendarFixture extends DemoOwnerApi {
  final writes = <Map<String, dynamic>>[], queries = <String>[];
  String status = 'pending';
  Map<String, dynamic>? rescheduleRequest;
  String get now => DateTime.now().toUtc().toIso8601String();
  Map<String, dynamic> get settings => {
    'timezone': 'UTC',
    'workingDays': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    'openMinute': 480,
    'closeMinute': 1080,
    'closedDates': [],
    'googleReviewUrl': 'https://example.invalid/review',
  };
  Map<String, dynamic> get row => {
    'id': 'booking-1',
    'version': 7,
    'status': status,
    'start_ms': DateTime.now().millisecondsSinceEpoch,
    'end_ms': null,
    'customer': {
      'firstName': 'Fixture',
      'lastName': 'Customer',
      'phone': '555',
      'email': 'test@example.invalid',
      'address': 'Fixture address',
    },
    'vehicle': {
      'year': 2026,
      'make': 'Test',
      'model': 'Sedan',
      'color': 'Gold',
    },
    'snapshot': {
      'package': {'name': 'Fixture service', 'durationMinutes': 90},
      'addons': [],
      'estimatedMin': 12000,
    },
    'data': {
      'concerns': 'Fixture notes',
      'requestedAt': now,
      if (rescheduleRequest != null) 'rescheduleRequest': rescheduleRequest,
    },
  };
  @override
  bool get isDemo => false;
  @override
  Future<Object?> workspace(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? key,
  }) async {
    queries.add(path);
    if (method != 'GET') {
      writes.add({'path': path, 'body': body, 'method': method});
      if (path.endsWith('/transition')) {
        status = body!['action'] == 'confirm'
            ? 'confirmed'
            : 'awaiting_acceptance';
      }
      return {'ok': true};
    }
    if (path.contains('/dashboard')) return {'settings': settings};
    if (path.contains('/calendar')) {
      return {
        'settings': settings,
        'bookings': [row],
        'blocks': [],
      };
    }
    if (path.contains('/history')) {
      return [
        {
          'event': 'booking.requested',
          'actor': 'customer',
          'data': jsonEncode({'start_ms': row['start_ms']}),
          'created_at': row['start_ms'],
        },
      ];
    }
    if (path.contains('/photos')) return [];
    if (path.contains('/booking?')) return row;
    return {};
  }
}

void main() {
  testWidgets(
    'day week month navigation requests the shared backend and fits an iPhone',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = CalendarFixture();
      await tester.pumpWidget(MaterialApp(home: OwnerCalendar(api: api)));
      await tester.pumpAndSettle();
      expect(find.text('Month'), findsOneWidget);
      expect(find.text('All appointments use UTC'), findsOneWidget);
      await tester.tap(find.text('Day'));
      await tester.pumpAndSettle();
      expect(find.text('Fixture Customer'), findsOneWidget);
      await tester.tap(find.text('Week'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Next period'));
      await tester.pumpAndSettle();
      expect(api.queries.where((p) => p.contains('/calendar?')).length, 4);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('working hours submit only scheduling fields', (tester) async {
    final api = CalendarFixture();
    await tester.pumpWidget(MaterialApp(home: OwnerCalendar(api: api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Business hours'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save hours'));
    await tester.pumpAndSettle();
    final write = api.writes.single;
    expect(write['path'], '/api/owner/schedule-settings');
    expect((write['body'] as Map).keys.toSet(), {
      'workingDays',
      'openMinute',
      'closeMinute',
    });
  });
  testWidgets(
    'appointment details display real fields and confirm with the fetched version',
    (tester) async {
      final api = CalendarFixture();
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
      expect(find.text('Fixture Customer'), findsOneWidget);
      expect(find.text('2026 Test Sedan · Gold'), findsOneWidget);
      expect(find.text('Package: Fixture service'), findsOneWidget);
      expect(find.text('Notes: Fixture notes'), findsOneWidget);
      await tester.ensureVisible(find.text('Confirm appointment'));
      await tester.tap(find.text('Confirm appointment'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(api.writes.single['body'], {
        'id': 'booking-1',
        'version': 7,
        'action': 'confirm',
        'durationMinutes': 90,
      });
      expect(find.text('Confirmed'), findsOneWidget);
    },
  );
  testWidgets(
    'owner sees a customer reschedule request without losing confirmed appointment',
    (tester) async {
      final api = CalendarFixture()
        ..status = 'confirmed'
        ..rescheduleRequest = {
          'startAt': DateTime.utc(2026, 12, 1, 15).millisecondsSinceEpoch,
          'note': 'Please move to afternoon',
        };
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
      expect(find.textContaining('Customer requested:'), findsOneWidget);
      expect(find.textContaining('Please move to afternoon'), findsOneWidget);
      expect(find.text('Confirmed'), findsOneWidget);
      expect(api.writes, isEmpty);
    },
  );
}
