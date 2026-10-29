import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/owner_api.dart';
import 'session_store_test.dart' show MemorySecureStore;

class Reply extends Stream<List<int>> implements HttpClientResponse {
  Reply(this.statusCode, this.value, [this.cookies = const []]);
  @override
  final int statusCode;
  final Object value;
  @override
  final List<Cookie> cookies;
  @override
  StreamSubscription<List<int>> listen(
    void Function(List<int>)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) => Stream.value(utf8.encode(jsonEncode(value))).listen(
    onData,
    onError: onError,
    onDone: onDone,
    cancelOnError: cancelOnError,
  );
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnsupportedError('Unexpected response operation');
}

class Headers extends Fake implements HttpHeaders {
  @override
  ContentType? contentType;
  @override
  void set(String name, Object value, {bool preserveHeaderCase = false}) {}
}

typedef Handler =
    Future<Reply> Function(Uri uri, String method, List<Cookie> cookies);

class Request extends Fake implements HttpClientRequest {
  Request(this.uri, this.method, this.handler);
  @override
  final Uri uri;
  @override
  final String method;
  final Handler handler;
  @override
  final cookies = <Cookie>[];
  @override
  final headers = Headers();
  @override
  bool followRedirects = false;
  @override
  void write(Object? obj) {}
  @override
  Future<HttpClientResponse> close() => handler(uri, method, List.of(cookies));
}

class Client extends Fake implements HttpClient {
  Client(this.handler);
  final Handler handler;
  @override
  Future<HttpClientRequest> openUrl(String method, Uri uri) async =>
      Request(uri, method, handler);
}

void main() {
  final origin = Uri.parse('https://tenant.example.invalid');
  test(
    'login persists only session cookies and restart validates them with the server',
    () async {
      final store = MemorySecureStore();
      final client = Client(
        (uri, method, cookies) async => uri.path == '/api/login'
            ? Reply(
                200,
                {'ok': true},
                [Cookie('session', 'synthetic')..maxAge = 43200],
              )
            : Reply(200, {
                'ownerId': 'synthetic-owner',
                'businessId': 'synthetic-tenant',
              }),
      );
      final first = HttpOwnerApi(origin, sessionStore: store, client: client);
      await first.login('test@example.invalid', 'synthetic-password');
      expect(store.values.values.single, isNot(contains('synthetic-password')));
      final restarted = HttpOwnerApi(
        origin,
        sessionStore: store,
        client: client,
      );
      expect(await restarted.restoreSession(), true);
    },
  );
  test(
    'near-expiry refresh rotates before an authenticated operation',
    () async {
      final store = MemorySecureStore();
      final calls = <String>[];
      final api = HttpOwnerApi(
        origin,
        sessionStore: store,
        client: Client((uri, method, cookies) async {
          calls.add(uri.path);
          if (uri.path == '/api/login') {
            return Reply(
              200,
              {'ok': true},
              [Cookie('session', 'old')..maxAge = 60],
            );
          }
          if (uri.path.endsWith('/refresh')) {
            return Reply(
              200,
              {'ok': true},
              [Cookie('session', 'rotated')..maxAge = 43200],
            );
          }
          expect(
            cookies.singleWhere((c) => c.name == 'session').value,
            'rotated',
          );
          return Reply(200, {'bookings': []});
        }),
      );
      await api.login('', '');
      await api.bookings();
      expect(calls, [
        '/api/login',
        '/api/owner/session/refresh',
        '/api/owner/dashboard',
      ]);
    },
  );
  test(
    'revocation clears secure storage and signals private UI invalidation',
    () async {
      final store = MemorySecureStore();
      var invalidations = 0;
      final api = HttpOwnerApi(
        origin,
        sessionStore: store,
        client: Client(
          (uri, method, cookies) async => uri.path == '/api/login'
              ? Reply(
                  200,
                  {'ok': true},
                  [Cookie('session', 'synthetic')..maxAge = 43200],
                )
              : Reply(401, {'error': 'Owner login required'}),
        ),
      );
      api.authChanges.addListener(() => invalidations++);
      await api.login('', '');
      await expectLater(api.bookings(), throwsA(isA<ApiFailure>()));
      expect(store.values, isEmpty);
      expect(invalidations, 1);
    },
  );
  test(
    'offline logout removes local session even if remote revocation cannot complete',
    () async {
      final store = MemorySecureStore();
      final api = HttpOwnerApi(
        origin,
        sessionStore: store,
        client: Client((uri, method, cookies) async {
          if (uri.path == '/api/login') {
            return Reply(
              200,
              {'ok': true},
              [Cookie('session', 'synthetic')..maxAge = 43200],
            );
          }
          throw const SocketException('Synthetic offline');
        }),
      );
      await api.login('', '');
      await expectLater(api.logout(), throwsA(isA<SocketException>()));
      expect(store.values, isEmpty);
    },
  );
  test(
    'a late authenticated response after logout cannot repopulate private state',
    () async {
      final store = MemorySecureStore(),
          pending = Completer<Reply>(),
          started = Completer<void>();
      final api = HttpOwnerApi(
        origin,
        sessionStore: store,
        client: Client((uri, method, cookies) async {
          if (uri.path == '/api/login') {
            return Reply(
              200,
              {'ok': true},
              [Cookie('session', 'synthetic')..maxAge = 43200],
            );
          }
          if (uri.path.endsWith('/dashboard')) {
            started.complete();
            return pending.future;
          }
          return Reply(200, {'ok': true});
        }),
      );
      await api.login('', '');
      final response = api.bookings();
      await started.future;
      await api.logout();
      pending.complete(Reply(200, {'bookings': []}));
      await expectLater(response, throwsA(isA<ApiFailure>()));
      expect(store.values, isEmpty);
    },
  );
}
