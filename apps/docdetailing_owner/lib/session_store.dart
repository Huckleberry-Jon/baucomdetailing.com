import 'dart:convert';
import 'dart:io';
import 'package:flutter/services.dart';

abstract interface class SecureSessionStore {
  Future<String?> read(String account);
  Future<void> write(String account, String value);
  Future<void> delete(String account);
}

class KeychainSessionStore implements SecureSessionStore {
  static const channel = MethodChannel(
    'com.docincorporated.docdetailing/session',
  );
  @override
  Future<String?> read(String account) =>
      channel.invokeMethod<String>('read', {'account': account});
  @override
  Future<void> write(String account, String value) =>
      channel.invokeMethod<void>('write', {'account': account, 'value': value});
  @override
  Future<void> delete(String account) =>
      channel.invokeMethod<void>('delete', {'account': account});
}

class SessionCookies {
  SessionCookies(this.origin, this.store, {DateTime Function()? now})
    : now = now ?? DateTime.now;
  final Uri origin;
  final SecureSessionStore store;
  final DateTime Function() now;
  final List<Cookie> cookies = [];
  Future<void>? _loaded;
  String get account => origin.origin;
  Future<void> load() => _loaded ??= _load();
  Future<void> _load() async {
    final raw = await store.read(account);
    if (raw == null) return;
    try {
      final data = jsonDecode(raw) as Map;
      if (data['origin'] != account) {
        throw const FormatException('Origin mismatch');
      }
      for (final item in data['cookies'] as List) {
        if (!['session', 'dev_access'].contains(item['name'])) continue;
        final expires = DateTime.fromMillisecondsSinceEpoch(
          item['expires'] as int,
          isUtc: true,
        );
        if (!expires.isAfter(now())) continue;
        cookies.add(
          Cookie(item['name'] as String, item['value'] as String)
            ..expires = expires
            ..secure = true
            ..httpOnly = true
            ..path = '/',
        );
      }
    } catch (_) {
      cookies.clear();
      await store.delete(account);
    }
  }

  bool get hasOwner => cookies.any(
    (c) => c.name == 'session' && (c.expires?.isAfter(now()) ?? false),
  );
  bool get needsRefresh => cookies.any(
    (c) =>
        c.name == 'session' &&
        c.expires != null &&
        c.expires!.difference(now()) < const Duration(minutes: 5),
  );
  List<Cookie> get active =>
      cookies.where((c) => c.expires?.isAfter(now()) ?? false).toList();
  Future<void> accept(List<Cookie> updates) async {
    var changed = false;
    for (final c in updates) {
      if (!['session', 'dev_access'].contains(c.name)) continue;
      if (c.domain != null &&
          c.domain!.replaceFirst(RegExp(r'^\.'), '') != origin.host) {
        continue;
      }
      cookies.removeWhere((old) => old.name == c.name);
      final expires = c.maxAge != null
          ? now().add(Duration(seconds: c.maxAge!))
          : c.expires;
      if (expires != null && expires.isAfter(now()) && c.value.isNotEmpty) {
        c.expires = expires.toUtc();
        cookies.add(c);
      }
      changed = true;
    }
    if (changed) await persist();
  }

  Future<void> persist() => store.write(
    account,
    jsonEncode({
      'origin': account,
      'cookies': active
          .map(
            (c) => {
              'name': c.name,
              'value': c.value,
              'expires': c.expires!.millisecondsSinceEpoch,
            },
          )
          .toList(),
    }),
  );
  Future<void> clear() async {
    cookies.clear();
    await store.delete(account);
  }
}
