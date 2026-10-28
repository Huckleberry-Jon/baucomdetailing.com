import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/main.dart';
import 'package:docdetailing_owner/owner_api.dart';

void main() {
  testWidgets('demo is explicit, loads bookings and signs out', (tester) async {
    await tester.pumpWidget(OwnerApp(api: DemoOwnerApi()));
    expect(find.textContaining('DEVELOPMENT DEMO'), findsOneWidget);
    await tester.tap(find.text('Open demo dashboard'));
    await tester.pumpAndSettle();
    expect(find.text('Synthetic customer'), findsOneWidget);
    expect(find.text('1 pending · 1 confirmed'), findsOneWidget);
    await tester.tap(find.byTooltip('Sign out'));
    await tester.pumpAndSettle();
    expect(find.text('Open demo dashboard'), findsOneWidget);
  });
  test(
    'versions reject stale native commands and logout revokes access',
    () async {
      final api = DemoOwnerApi();
      await expectLater(api.bookings(), throwsA(isA<ApiFailure>()));
      await api.login('', '');
      final booking = (await api.bookings()).first;
      await api.transition(booking, 'confirm');
      await expectLater(
        api.transition(booking, 'confirm'),
        throwsA(isA<ApiFailure>()),
      );
      await api.logout();
      await expectLater(api.bookings(), throwsA(isA<ApiFailure>()));
    },
  );
  test('live transport requires HTTPS and canonical origin', () {
    expect(
      () => HttpOwnerApi(Uri.parse('http://example.invalid')),
      throwsArgumentError,
    );
    expect(
      () => HttpOwnerApi(Uri.parse('https://example.invalid/path')),
      throwsArgumentError,
    );
  });
}
