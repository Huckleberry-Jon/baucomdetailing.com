import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/notification_inbox.dart';
import 'package:docdetailing_owner/native_notifications.dart';
import 'package:docdetailing_owner/owner_api.dart';
import 'native_notifications_test.dart' show Store, Platform;

class InboxApi extends DemoOwnerApi {
  int count = 0, reads = 0;
  Completer<Object?>? held;
  @override
  Future<Object?> workspace(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? key,
  }) async {
    if (path.startsWith('/api/owner/inbox')) {
      reads++;
      if (held != null) {
        final waiting = held!;
        held = null;
        return waiting.future;
      }
      return {
        'notifications': [
          for (var i = 0; i < count; i++)
            {
              'id': 'event-$i',
              'booking_id': 'booking-$i',
              'event': 'booking.requested',
              'read_at': null,
            },
        ],
        'unread': count,
        'nextCursor': null,
      };
    }
    return {};
  }
}

class InboxController extends NativeNotifications {
  InboxController(OwnerApi api)
    : super(
        api,
        Store(),
        Platform(),
        'https://example.invalid/device',
        (_) async {},
      );
  void announce(int count) {
    unread = count;
    notifyListeners();
  }
}

void main() {
  testWidgets('foreground unread changes refresh the visible inbox and count', (
    tester,
  ) async {
    final api = InboxApi(), native = InboxController(InboxApi());
    await tester.pumpWidget(
      MaterialApp(
        home: NotificationInbox(api: api, native: native),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Notifications · 0 unread'), findsOneWidget);
    api.count = 1;
    native.announce(1);
    await tester.pumpAndSettle();
    expect(find.text('Notifications · 1 unread'), findsOneWidget);
    expect(find.text('New booking request'), findsOneWidget);
    expect(api.reads, 2);
    await tester.pumpWidget(const SizedBox());
    native.dispose();
  });
  testWidgets(
    'notification during an inbox load schedules one follow-up refresh',
    (tester) async {
      final api = InboxApi(),
          native = InboxController(InboxApi()),
          held = Completer<Object?>();
      api.held = held;
      await tester.pumpWidget(
        MaterialApp(
          home: NotificationInbox(api: api, native: native),
        ),
      );
      await tester.pump();
      api.count = 2;
      native.announce(2);
      held.complete({'notifications': [], 'unread': 0, 'nextCursor': null});
      await tester.pumpAndSettle();
      expect(find.text('Notifications · 2 unread'), findsOneWidget);
      expect(api.reads, 2);
      await tester.pumpWidget(const SizedBox());
      native.dispose();
    },
  );
}
