import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/main.dart';
import 'session_ui_test.dart' show SessionFixture;

class LogoutFixture extends SessionFixture {
  int logouts = 0, revocations = 0;
  @override
  Future<void> logout() async {
    logouts++;
    await super.logout();
  }

  @override
  Future<void> revokeAllSessions() async {
    revocations++;
    await super.revokeAllSessions();
  }
}

void main() {
  for (final all in [false, true]) {
    testWidgets(
      'logout confirmation protects ${all ? 'all devices' : 'this device'} until confirmed',
      (tester) async {
        final api = LogoutFixture();
        await tester.pumpWidget(OwnerApp(api: api));
        await tester.pumpAndSettle();
        final tooltip = all ? 'Sign out all devices' : 'Sign out';
        await tester.tap(find.byTooltip(tooltip));
        await tester.pumpAndSettle();
        expect(api.logouts, 0);
        expect(api.revocations, 0);
        await tester.tap(find.text('Cancel'));
        await tester.pumpAndSettle();
        expect(find.text('Ready for the road.'), findsOneWidget);
        expect(api.logouts, 0);
        expect(api.revocations, 0);
        await tester.tap(find.byTooltip(tooltip));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(FilledButton, tooltip));
        await tester.pumpAndSettle();
        expect(api.logouts, all ? 0 : 1);
        expect(api.revocations, all ? 1 : 0);
        expect(find.text('Open demo dashboard'), findsOneWidget);
      },
    );
  }
}
