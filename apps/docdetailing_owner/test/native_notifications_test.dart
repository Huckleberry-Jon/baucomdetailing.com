import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/native_notifications.dart';
import 'package:docdetailing_owner/owner_api.dart';
import 'package:docdetailing_owner/session_store.dart';

class Store implements SecureSessionStore {
  final values = <String, String>{};
  @override
  Future<String?> read(String a) async => values[a];
  @override
  Future<void> write(String a, String v) async {
    values[a] = v;
  }

  @override
  Future<void> delete(String a) async {
    values.remove(a);
  }
}

class Platform implements NotificationPlatform {
  void Function(Map<String, dynamic>)? handler;
  String permission = 'authorized';
  @override
  void listen(void Function(Map<String, dynamic>) handler) {
    this.handler = handler;
  }

  @override
  Future<Map<String, dynamic>> status({bool request = false}) async => {
    'permission': permission,
    'token': 'ab' * 32,
  };
  @override
  Future<void> settings() async {}
}

class Api extends DemoOwnerApi {
  final calls = <String>[];
  String tenant = 'tenant-a';
  Completer<Object?>? delayed;
  @override
  Future<Object?> workspace(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? key,
  }) async {
    calls.add('$method $path');
    if (path == '/api/owner/session') return {'businessId': tenant};
    if (path == '/api/owner/native-device') return {'ok': true};
    if (path.startsWith('/api/owner/inbox')) return {'unread': 3};
    if (path == '/api/owner/native-push-config') {
      return {'transmissionEnabled': false};
    }
    if (path.startsWith('/api/owner/booking')) {
      return delayed?.future ?? {'id': 'booking-a'};
    }
    return {'ok': true};
  }
}

Map<String, dynamic> tap({String tenant = 'tenant-a', String id = 'event-a'}) =>
    {
      'type': 'tap',
      'eventId': id,
      'bookingId': 'booking-a',
      'businessId': tenant,
    };

void main() {
  test(
    'registration needs explicit opt-in and denial removes server registration',
    () async {
      final api = Api(), platform = Platform(), store = Store();
      final n = NativeNotifications(
        api,
        store,
        platform,
        'https://example.test/device',
        (_) async {},
      );
      await n.authenticated();
      expect(
        api.calls.where((x) => x == 'POST /api/owner/native-device'),
        isEmpty,
      );
      await n.synchronize(request: true);
      expect(
        api.calls.where((x) => x == 'POST /api/owner/native-device'),
        hasLength(1),
      );
      expect(n.unread, 3);
      expect(n.message, contains('disabled'));
      platform.permission = 'denied';
      await n.synchronize();
      expect(
        api.calls.lastWhere((x) => x.contains('/native-device')),
        startsWith('DELETE'),
      );
      n.dispose();
    },
  );
  test(
    'cold taps wait for authentication, reject other tenants and deduplicate after restart',
    () async {
      final api = Api(),
          platform = Platform(),
          store = Store(),
          opened = <String>[];
      final n = NativeNotifications(
        api,
        store,
        platform,
        'https://example.test/device',
        (id) async {
          opened.add(id);
        },
      );
      n.event(tap());
      expect(opened, isEmpty);
      await n.authenticated();
      expect(opened, ['booking-a']);
      n.event(tap());
      await Future<void>.delayed(Duration.zero);
      expect(opened, hasLength(1));
      n.event(tap(tenant: 'tenant-b', id: 'event-b'));
      await Future<void>.delayed(Duration.zero);
      expect(opened, hasLength(1));
      n.dispose();
      final next = NativeNotifications(
        api,
        store,
        Platform(),
        'https://example.test/device',
        (id) async {
          opened.add(id);
        },
      );
      next.event(tap());
      await next.authenticated();
      expect(opened, hasLength(1));
      next.dispose();
    },
  );
  test(
    'logout fences pending private booking navigation and renewal requires signed-in owner',
    () async {
      final api = Api(), platform = Platform(), opened = <String>[];
      final n = NativeNotifications(
        api,
        Store(),
        platform,
        'https://example.test/device',
        (id) async {
          opened.add(id);
        },
      );
      await n.authenticated();
      await n.synchronize(request: true);
      api.delayed = Completer<Object?>();
      n.event(tap());
      await Future<void>.delayed(Duration.zero);
      n.locked();
      final before = api.calls.length;
      n.event({'type': 'token', 'token': 'cd' * 32});
      api.delayed!.complete({'id': 'booking-a'});
      await Future<void>.delayed(Duration.zero);
      expect(opened, isEmpty);
      expect(api.calls.length, before);
      n.dispose();
    },
  );
}
