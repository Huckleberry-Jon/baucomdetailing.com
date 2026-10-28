import 'dart:convert';
import 'dart:io';

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
  Future<void> logout();
}

/// HTTPS, origin-bound, in-memory sessions only. No production credentials are embedded.
/// Keychain persistence, native APNs and multi-membership APIs remain release gates.
class HttpOwnerApi implements OwnerApi {
  HttpOwnerApi(this.origin) {
    if (origin.scheme != 'https' ||
        origin.userInfo.isNotEmpty ||
        origin.hasQuery ||
        origin.hasFragment ||
        !['', '/'].contains(origin.path)) {
      throw ArgumentError('An approved HTTPS API origin is required.');
    }
  }
  final Uri origin;
  final HttpClient _client = HttpClient()
    ..connectionTimeout = const Duration(seconds: 15);
  final List<Cookie> _cookies = [];
  @override
  bool get isDemo => false;
  Future<Map<String, dynamic>> request(
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final uri = origin.resolve(path);
    if (uri.origin != origin.origin) {
      throw const ApiFailure(403, 'Cross-origin request rejected.');
    }
    final r = await _client.openUrl(body == null ? 'GET' : 'POST', uri);
    r.followRedirects = false;
    r.headers.set('Origin', origin.origin);
    r.headers.contentType = ContentType.json;
    r.cookies.addAll(_cookies);
    if (body != null) r.write(jsonEncode(body));
    final response = await r.close().timeout(const Duration(seconds: 20));
    final text = await utf8.decoder.bind(response).join();
    if (response.statusCode >= 300 && response.statusCode < 400) {
      throw const ApiFailure(403, 'Use the approved canonical API origin.');
    }
    final value = jsonDecode(text) as Map<String, dynamic>;
    if (response.statusCode != 200) {
      throw ApiFailure(
        response.statusCode,
        value['error'] as String? ?? 'Request failed.',
      );
    }
    for (final cookie in response.cookies) {
      _cookies.removeWhere((old) => old.name == cookie.name);
      if (cookie.maxAge != 0) _cookies.add(cookie);
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
    final data = await request('/api/owner/dashboard');
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
  Future<void> logout() async {
    try {
      await request('/api/owner/logout', body: {});
    } finally {
      _cookies.clear();
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
  Future<void> logout() async {
    _signedIn = false;
  }
}
