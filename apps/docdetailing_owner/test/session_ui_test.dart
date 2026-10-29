import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/main.dart';
import 'package:docdetailing_owner/owner_api.dart';

class SessionFixture extends DemoOwnerApi implements SessionOwnerApi {
  SessionFixture({this.restore = true, this.failLogout = false});
  final bool restore, failLogout;
  @override
  final ValueNotifier<int> authChanges = ValueNotifier(0);
  @override
  Future<bool> restoreSession() async {
    if (restore) await super.login('', '');
    return restore;
  }

  @override
  Future<void> revokeAllSessions() async {
    await super.logout();
    authChanges.value++;
  }

  @override
  Future<void> logout() async {
    await super.logout();
    if (failLogout) {
      throw const ApiFailure(
        503,
        'Offline: server revocation could not be confirmed.',
      );
    }
  }
}

void main() {
  testWidgets(
    'restart restores a valid server session without asking for a password',
    (tester) async {
      await tester.pumpWidget(OwnerApp(api: SessionFixture()));
      await tester.pumpAndSettle();
      expect(find.text('Synthetic customer'), findsOneWidget);
      expect(find.text('Open demo dashboard'), findsNothing);
    },
  );
  testWidgets('revoked session removes private routes and booking rows', (
    tester,
  ) async {
    final api = SessionFixture();
    await tester.pumpWidget(OwnerApp(api: api));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Customers'));
    await tester.pumpAndSettle();
    api.authChanges.value++;
    await tester.pumpAndSettle();
    expect(find.text('Open demo dashboard'), findsOneWidget);
    expect(find.text('Synthetic customer'), findsNothing);
    expect(find.byType(Drawer), findsNothing);
  });
  testWidgets('offline logout still removes customer information', (
    tester,
  ) async {
    await tester.pumpWidget(OwnerApp(api: SessionFixture(failLogout: true)));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Sign out'));
    await tester.pumpAndSettle();
    expect(find.text('Open demo dashboard'), findsOneWidget);
    expect(find.text('Synthetic customer'), findsNothing);
    expect(find.textContaining('revocation could not'), findsOneWidget);
  });
  testWidgets('expired session returns to login', (tester) async {
    await tester.pumpWidget(OwnerApp(api: SessionFixture(restore: false)));
    await tester.pumpAndSettle();
    expect(find.text('Open demo dashboard'), findsOneWidget);
    expect(find.text('Synthetic customer'), findsNothing);
  });
}
