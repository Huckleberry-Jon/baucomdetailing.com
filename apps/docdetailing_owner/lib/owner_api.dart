import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'session_store.dart';

class Booking {
  const Booking({
    required this.id,
    required this.status,
    required this.version,
    required this.customer,
    required this.start,
  });
  final String id, status, customer;
  final int version;
  final DateTime start;
  factory Booking.fromJson(Map<String, dynamic> row) {
    final raw = row['customer'];
    final customer = raw is String
        ? jsonDecode(raw) as Map<String, dynamic>
        : <String, dynamic>{};
    return Booking(
      id: row['id'] as String,
      status: row['status'] as String,
      version: row['version'] as int,
      customer: '${customer['firstName'] ?? ''} ${customer['lastName'] ?? ''}'
          .trim(),
      start: row['start_ms'] != null
          ? DateTime.fromMillisecondsSinceEpoch(
              row['start_ms'] as int,
              isUtc: true,
            )
          : DateTime.parse(row['requestedAt'] as String),
    );
  }
}

class ApiFailure implements Exception {
  const ApiFailure(this.status, this.message);
  final int status;
  final String message;
  @override
  String toString() => message;
}

abstract interface class OwnerApi {
  bool get isDemo;
  Future<void> unlockPreview(String code);
  Future<void> login(String email, String password);
  Future<List<Booking>> bookings();
  Future<void> transition(
    Booking booking,
    String action, {
    int durationMinutes = 90,
  });
  Future<Object?> workspace(
    String path, {
    String method = "GET",
    Map<String, dynamic>? body,
    String? key,
  });
  Future<List<int>> privatePhoto(String id);
  Future<void> logout();
}

abstract interface class SessionOwnerApi {
  ValueListenable<int> get authChanges;
  Future<bool> restoreSession();
  Future<void> revokeAllSessions();
}

/// Origin-bound HTTPS with Keychain-backed, expiring server sessions. No passwords are persisted.
class HttpOwnerApi implements OwnerApi, SessionOwnerApi {
  HttpOwnerApi(
    this.origin, {
    SecureSessionStore? sessionStore,
    HttpClient? client,
  }) {
    if (origin.scheme != 'https' ||
        origin.userInfo.isNotEmpty ||
        origin.hasQuery ||
        origin.hasFragment ||
        !['', '/'].contains(origin.path)) {
      throw ArgumentError('An approved HTTPS API origin is required.');
    }
    _client =
        client ??
        (HttpClient()..connectionTimeout = const Duration(seconds: 15));
    sessions = SessionCookies(origin, sessionStore ?? KeychainSessionStore());
  }
  final Uri origin;
  late final HttpClient _client;
  late final SessionCookies sessions;
  @override
  final ValueNotifier<int> authChanges = ValueNotifier(0);
  Future<void>? _refreshing;
  int _epoch = 0;
  Future<void> invalidate() async {
    _epoch++;
    try {
      await sessions.clear();
    } finally {
      authChanges.value++;
    }
  }

  @override
  Future<bool> restoreSession() async {
    await sessions.load();
    if (!sessions.hasOwner) {
      await sessions.clear();
      return false;
    }
    try {
      await request('/api/owner/session');
      return true;
    } on ApiFailure catch (e) {
      if (e.status == 401) return false;
      rethrow;
    }
  }

  @override
  Future<void> revokeAllSessions() async {
    try {
      await _refreshing;
      await request(
        '/api/owner/session/revoke-all',
        body: {},
        skipRefresh: true,
      );
    } finally {
      await invalidate();
    }
  }

  @override
  bool get isDemo => false;
  Future<Object?> request(
    String path, {
    Map<String, dynamic>? body,
    String? method,
    String? key,
    bool skipRefresh = false,
  }) async {
    await sessions.load();
    if (!skipRefresh &&
        path.startsWith('/api/owner/') &&
        sessions.hasOwner &&
        sessions.needsRefresh) {
      _refreshing ??=
          request(
            '/api/owner/session/refresh',
            body: {},
            skipRefresh: true,
          ).then((_) {}).whenComplete(() {
            _refreshing = null;
          });
      await _refreshing;
    }
    final epoch = _epoch;
    final uri = origin.resolve(path);
    if (uri.origin != origin.origin) {
      throw const ApiFailure(403, 'Cross-origin request rejected.');
    }
    final r = await _client.openUrl(
      method ?? (body == null ? 'GET' : 'POST'),
      uri,
    );
    r.followRedirects = false;
    r.headers.set('Origin', origin.origin);
    if (key != null) r.headers.set('Idempotency-Key', key);
    r.headers.contentType = ContentType.json;
    r.cookies.addAll(sessions.active);
    if (body != null) r.write(jsonEncode(body));
    final response = await r.close().timeout(const Duration(seconds: 20));
    final text = await utf8.decoder
        .bind(response)
        .join()
        .timeout(const Duration(seconds: 30));
    if (epoch != _epoch) {
      throw const ApiFailure(401, 'Session changed; sign in again.');
    }
    if (response.statusCode >= 300 && response.statusCode < 400) {
      throw const ApiFailure(403, 'Use the approved canonical API origin.');
    }
    Object? value;
    try {
      value = jsonDecode(text);
    } catch (_) {
      throw const ApiFailure(
        502,
        'The service returned an invalid response. Please retry.',
      );
    }
    if (response.statusCode == 401 && path.startsWith('/api/owner/')) {
      await invalidate();
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiFailure(
        response.statusCode,
        value is Map
            ? value['error'] as String? ?? 'Request failed.'
            : 'Request failed.',
      );
    }
    try {
      await sessions.accept(response.cookies);
    } catch (_) {
      await invalidate();
      throw const ApiFailure(
        503,
        'Secure session storage is unavailable. Please sign in again.',
      );
    }
    return value;
  }

  @override
  Future<void> unlockPreview(String code) async {
    await request("/dev-access", body: {"code": code});
  }

  @override
  Future<void> login(String email, String password) async {
    await request('/api/login', body: {'email': email, 'password': password});
  }

  @override
  Future<List<Booking>> bookings() async {
    final data = await request('/api/owner/dashboard') as Map<String, dynamic>;
    return (data['bookings'] as List)
        .map((row) => Booking.fromJson(row as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<void> transition(
    Booking booking,
    String action, {
    int durationMinutes = 90,
  }) async {
    await request(
      '/api/owner/transition',
      body: {
        'id': booking.id,
        'version': booking.version,
        'action': action,
        'durationMinutes': durationMinutes,
      },
    );
  }

  @override
  Future<Object?> workspace(
    String path, {
    String method = "GET",
    Map<String, dynamic>? body,
    String? key,
  }) {
    if (!path.startsWith("/api/owner/")) {
      throw const ApiFailure(403, "Owner route required.");
    }
    return request(path, method: method, body: body, key: key);
  }

  @override
  Future<List<int>> privatePhoto(String id) async {
    await sessions.load();
    final epoch = _epoch;
    final uri = origin.resolve(
      '/api/owner/photo?${Uri(queryParameters: {'id': id}).query}',
    );
    final r = await _client.getUrl(uri);
    r.followRedirects = false;
    r.cookies.addAll(sessions.active);
    r.headers.set('Origin', origin.origin);
    final response = await r.close().timeout(const Duration(seconds: 20));
    if (response.statusCode != 200) {
      if (response.statusCode == 401) await invalidate();
      await response.drain<void>();
      throw ApiFailure(response.statusCode, 'Private photo unavailable.');
    }
    final bytes = <int>[];
    await for (final chunk in response.timeout(const Duration(seconds: 30))) {
      bytes.addAll(chunk);
      if (bytes.length > 4 * 1024 * 1024) {
        throw const ApiFailure(413, 'Preview too large.');
      }
    }
    if (epoch != _epoch) {
      throw const ApiFailure(401, 'Session changed; sign in again.');
    }
    return bytes;
  }

  @override
  Future<void> logout() async {
    try {
      await _refreshing;
      await request('/api/owner/logout', body: {}, skipRefresh: true);
    } finally {
      await invalidate();
    }
  }
}

class DemoOwnerApi implements OwnerApi {
  @override
  bool get isDemo => true;
  bool _signedIn = false;
  final List<Booking> _rows = [
    Booking(
      id: 'synthetic-booking-1',
      status: 'pending',
      version: 1,
      customer: 'Synthetic customer',
      start: DateTime.utc(2026, 11, 12, 16),
    ),
    Booking(
      id: 'synthetic-booking-2',
      status: 'confirmed',
      version: 2,
      customer: 'Sample customer',
      start: DateTime.utc(2026, 11, 13, 16),
    ),
  ];
  @override
  Future<void> unlockPreview(String code) async {}
  @override
  Future<void> login(String email, String password) async {
    _signedIn = true;
  }

  @override
  Future<List<Booking>> bookings() async {
    if (!_signedIn) throw const ApiFailure(401, 'Sign in required.');
    return List.unmodifiable(_rows);
  }

  @override
  Future<void> transition(
    Booking booking,
    String action, {
    int durationMinutes = 90,
  }) async {
    if (!_signedIn) throw const ApiFailure(401, 'Sign in required.');
    final index = _rows.indexWhere((b) => b.id == booking.id);
    if (index < 0 || _rows[index].version != booking.version) {
      throw const ApiFailure(
        409,
        'Booking changed; refresh before trying again.',
      );
    }
    if (action != 'confirm' || booking.status != 'pending') {
      throw const ApiFailure(409, 'Invalid confirmation.');
    }
    _rows[index] = Booking(
      id: booking.id,
      status: 'confirmed',
      version: booking.version + 1,
      customer: booking.customer,
      start: booking.start,
    );
  }

  @override
  Future<Object?> workspace(
    String path, {
    String method = "GET",
    Map<String, dynamic>? body,
    String? key,
  }) async {
    if (!_signedIn) throw const ApiFailure(401, "Sign in required.");
    if (method != "GET") {
      throw const ApiFailure(409, "Use an approved backend to save records.");
    }
    if (path.contains("/calendar")) {
      return {
        "bookings": [],
        "blocks": [],
        "settings": {
          "timezone": "UTC",
          "workingDays": ["Mon", "Tue", "Wed", "Thu", "Fri"],
          "openMinute": 540,
          "closeMinute": 1020,
          "closedDates": [],
        },
      };
    }
    if (path.contains("/finance/report")) {
      return {
        "basis": "Demo: no financial activity recorded.",
        "receiptsCents": 0,
        "tipsCents": 0,
        "expenseCents": 0,
        "materialsPurchasedCents": 0,
        "estimatedProfitCents": 0,
        "cashFlowCents": 0,
        "salesTaxCollectedCents": 0,
        "taxRemittedCents": 0,
      };
    }
    if (path.contains("/reviews")) return [];
    if (path.contains("/dashboard")) {
      return {
        "notifications": [],
        "settings": {
          "googleReviewUrl": null,
          "timezone": "UTC",
          "workingDays": ["Mon", "Tue", "Wed", "Thu", "Fri"],
          "openMinute": 540,
          "closeMinute": 1020,
          "closedDates": [],
        },
      };
    }
    return {"records": []};
  }

  @override
  Future<List<int>> privatePhoto(String id) async =>
      throw const ApiFailure(404, 'Demo has no photos.');
  @override
  Future<void> logout() async {
    _signedIn = false;
  }
}
