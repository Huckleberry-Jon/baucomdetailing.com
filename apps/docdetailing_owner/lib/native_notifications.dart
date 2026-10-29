import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'owner_api.dart';
import 'session_store.dart';

abstract interface class NotificationPlatform {
  void listen(void Function(Map<String, dynamic>) handler);
  Future<Map<String, dynamic>> status({bool request = false});
  Future<void> settings();
}

class IPhoneNotifications implements NotificationPlatform {
  static const channel = MethodChannel(
    'com.docincorporated.docdetailing/notifications',
  );
  @override
  void listen(void Function(Map<String, dynamic>) handler) {
    channel.setMethodCallHandler((call) async {
      if (call.method == 'event' && call.arguments is Map) {
        handler(Map<String, dynamic>.from(call.arguments as Map));
      }
    });
  }

  @override
  Future<Map<String, dynamic>> status({bool request = false}) async =>
      Map<String, dynamic>.from(
        await channel.invokeMapMethod<String, dynamic>(
              request ? 'request' : 'status',
            ) ??
            {},
      );
  @override
  Future<void> settings() => channel.invokeMethod<void>('settings');
}

/// Device identifiers and user preference are origin-scoped in Keychain.
/// Notification payloads are untrusted hints; navigation requires fresh server authorization.
class NativeNotifications extends ChangeNotifier {
  NativeNotifications(
    this.api,
    this.store,
    this.platform,
    this.account,
    this.openBooking,
  ) {
    platform.listen(event);
  }
  final OwnerApi api;
  final SecureSessionStore store;
  final NotificationPlatform platform;
  final String account;
  final Future<void> Function(String) openBooking;
  String permission = 'unknown';
  String? message, _token, _deviceId;
  bool enabled = false, signedIn = false, _opening = false, _disposed = false;
  int unread = 0, _epoch = 0;
  Map<String, dynamic>? _pending;
  final Set<String> _seen = {};
  Future<void>? _loaded;
  void changed() {
    if (!_disposed) notifyListeners();
  }

  Future<void> load() => _loaded ??= (() async {
    try {
      final data = jsonDecode(await store.read(account) ?? '{}') as Map;
      _deviceId = data['deviceId'] as String?;
      enabled = data['enabled'] == true;
      _seen.addAll((data['seen'] as List? ?? []).whereType<String>());
    } catch (_) {
      enabled = false;
    }
    _deviceId ??= List.generate(
      24,
      (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  })();
  Future<void> persist() => store.write(
    account,
    jsonEncode({
      'deviceId': _deviceId,
      'enabled': enabled,
      'seen': _seen.toList().reversed.take(100).toList().reversed.toList(),
    }),
  );
  Future<void> authenticated() async {
    await load();
    signedIn = true;
    await synchronize();
    await drainTap();
  }

  void locked() {
    _epoch++;
    signedIn = false;

    unread = 0;
    message = null;
    changed();
  }

  Future<void> synchronize({bool request = false}) async {
    await load();
    if (!signedIn) return;
    final epoch = _epoch;
    try {
      await api.workspace('/api/owner/session');
      if (!signedIn || epoch != _epoch) return;
      final state = await platform.status(request: request);
      if (!signedIn || epoch != _epoch) return;
      permission = state['permission'] as String? ?? 'unknown';
      _token = state['token'] as String? ?? _token;
      if (request) {
        enabled = permission == 'authorized' || permission == 'provisional';
        await persist();
      }
      if (enabled &&
          ['authorized', 'provisional'].contains(permission) &&
          _token != null) {
        await api.workspace(
          '/api/owner/native-device',
          method: 'POST',
          body: {
            'deviceId': _deviceId,
            'deviceToken': _token,
            'environment': const String.fromEnvironment(
              'APNS_ENVIRONMENT',
              defaultValue: 'sandbox',
            ),
            'enabled': true,
          },
        );
      } else if (_deviceId != null && (!enabled || permission == 'denied')) {
        await api.workspace(
          '/api/owner/native-device',
          method: 'DELETE',
          body: {'deviceId': _deviceId},
        );
      }
      final inbox = await api.workspace('/api/owner/inbox?unread=true') as Map;
      if (!signedIn || epoch != _epoch) return;
      unread = inbox['unread'] as int? ?? 0;
      final config =
          await api.workspace('/api/owner/native-push-config') as Map;
      message =
          config['transmissionEnabled'] == true &&
              config['providerConfigured'] == true
          ? null
          : 'Device registration is available. Outbound notifications are disabled or awaiting provider setup.';
    } catch (_) {
      if (signedIn && epoch == _epoch) {
        message =
            'Notification setup could not be refreshed. Try again when connected.';
      }
    }
    changed();
  }

  Future<void> disable() async {
    await load();
    enabled = false;
    await persist();
    if (signedIn) {
      try {
        await api.workspace(
          '/api/owner/native-device',
          method: 'DELETE',
          body: {'deviceId': _deviceId},
        );
        message = 'Notifications disabled for this device.';
      } catch (_) {
        message =
            'Device removal needs a connection. Retry to stop delivery on the server.';
      }
    }
    changed();
  }

  void event(Map<String, dynamic> value) {
    switch (value['type']) {
      case 'token':
        _token = value['token'] as String?;
        if (signedIn) unawaited(synchronize());
      case 'failure':
        message =
            'iPhone registration failed. Check notification permissions and try again.';
        changed();
      case 'foreground':
        if (signedIn) unawaited(synchronize());
      case 'tap':
        _pending = value;
        unawaited(drainTap());
    }
  }

  Future<void> drainTap() async {
    final value = _pending;
    if (!signedIn || _opening || value == null) return;
    final eventId = value['eventId'], bookingId = value['bookingId'];
    if (eventId is! String ||
        bookingId is! String ||
        !RegExp(r'^[a-zA-Z0-9_-]{1,100}$').hasMatch(eventId) ||
        !RegExp(r'^[a-zA-Z0-9_-]{1,100}$').hasMatch(bookingId)) {
      _pending = null;
      return;
    }
    if (_seen.contains(eventId)) {
      _pending = null;
      return;
    }
    _opening = true;
    final epoch = _epoch;
    try {
      final session = await api.workspace('/api/owner/session') as Map;
      if (!signedIn ||
          epoch != _epoch ||
          session['businessId'] != value['businessId']) {
        _pending = null;
        return;
      }
      await api.workspace(
        '/api/owner/booking?id=${Uri.encodeQueryComponent(bookingId)}',
      );
      if (!signedIn || epoch != _epoch) return;
      await api.workspace(
        '/api/owner/read',
        method: 'POST',
        body: {'id': eventId},
      );
      if (!signedIn || epoch != _epoch) return;
      _pending = null;
      _seen.add(eventId);
      await persist();
      if (!signedIn || epoch != _epoch) return;
      await openBooking(bookingId);
      await synchronize();
    } catch (_) {
      if (signedIn && epoch == _epoch) {
        message = 'Unable to open the appointment. Open the inbox and retry.';
      }
    } finally {
      _opening = false;
      changed();
    }
    if (_pending != null && _pending != value) unawaited(drainTap());
  }

  @override
  void dispose() {
    _disposed = true;
    _epoch++;
    signedIn = false;
    platform.listen((_) {});
    super.dispose();
  }
}
