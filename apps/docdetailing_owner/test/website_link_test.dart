import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/website_link.dart';

void main() {
  test(
    'website shortcut opens configured business editor without credentials',
    () async {
      Uri? destination;
      await openOwnerWebsite(
        Uri.parse('https://staging.example.invalid'),
        open: (uri) async {
          destination = uri;
          return true;
        },
      );
      expect(
        destination.toString(),
        'https://staging.example.invalid/owner#website-photos',
      );
      expect(destination!.query, isEmpty);
      expect(destination!.userInfo, isEmpty);
      expect(
        ownerWebsiteUri(
          Uri.parse('https://custom-business.example.invalid'),
        ).host,
        'custom-business.example.invalid',
      );
    },
  );
  test('unsafe origins and failed browser launch are reported', () async {
    for (final origin in [
      'http://example.invalid',
      'https://user:secret@example.invalid',
      'https://example.invalid?token=secret',
      'https://example.invalid/unexpected',
    ]) {
      expect(() => ownerWebsiteUri(Uri.parse(origin)), throwsArgumentError);
    }
    await expectLater(
      openOwnerWebsite(
        Uri.parse('https://example.invalid'),
        open: (_) async => false,
      ),
      throwsFormatException,
    );
  });
}
