import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/session_store.dart';

class MemorySecureStore implements SecureSessionStore {
  final values = <String, String>{};
  @override
  Future<String?> read(String account) async => values[account];
  @override
  Future<void> write(String account, String value) async {
    values[account] = value;
  }

  @override
  Future<void> delete(String account) async {
    values.remove(account);
  }
}

void main() {
  test(
    'session and tester gate survive restart, expire and clear without passwords',
    () async {
      final store = MemorySecureStore();
      var now = DateTime.utc(2026, 10, 29);
      final origin = Uri.parse('https://tenant.example.invalid');
      final vault = SessionCookies(origin, store, now: () => now);
      await vault.load();
      await vault.accept([
        Cookie('session', 'synthetic-session')..maxAge = 43200,
        Cookie('dev_access', 'synthetic-gate')..maxAge = 172800,
      ]);
      final restarted = SessionCookies(origin, store, now: () => now);
      await restarted.load();
      expect(restarted.hasOwner, true);
      expect(restarted.active.length, 2);
      now = now.add(const Duration(hours: 12));
      expect(restarted.hasOwner, false);
      expect(restarted.active.map((x) => x.name), ['dev_access']);
      await restarted.clear();
      expect(store.values, isEmpty);
      expect(restarted.active, isEmpty);
    },
  );
  test('origin namespaces and cookie domains cannot cross tenants', () async {
    final store = MemorySecureStore(),
        a = SessionCookies(Uri.parse('https://a.invalid'), store);
    await a.load();
    await a.accept([
      Cookie('session', 'wrong')
        ..domain = 'evil.invalid'
        ..maxAge = 100,
    ]);
    expect(a.hasOwner, false);
    final b = SessionCookies(Uri.parse('https://b.invalid'), store);
    await b.load();
    expect(b.hasOwner, false);
  });
  test('corrupt secure storage fails closed and is removed', () async {
    final store = MemorySecureStore()..values['https://a.invalid'] = 'broken';
    final vault = SessionCookies(Uri.parse('https://a.invalid'), store);
    await vault.load();
    expect(vault.hasOwner, false);
    expect(store.values, isEmpty);
  });
  test('deleted server cookies are not resurrected after restart', () async {
    final store = MemorySecureStore(), origin = Uri.parse('https://a.invalid');
    final vault = SessionCookies(origin, store);
    await vault.load();
    await vault.accept([Cookie('session', 'synthetic')..maxAge = 100]);
    await vault.accept([Cookie('session', '')..maxAge = 0]);
    final next = SessionCookies(origin, store);
    await next.load();
    expect(next.hasOwner, false);
  });
}
