import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/workspace.dart';
import 'workspace_test.dart' show FixtureApi;

void main() {
  testWidgets(
    'Add customer saves company and a linked vehicle from one mobile form',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = FixtureApi();
      await tester.pumpWidget(
        MaterialApp(
          home: WorkspaceScreen(api: api, section: 'Customers'),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add customer'));
      await tester.pump(const Duration(milliseconds: 300));
      final fields = {
        'company': 'Fleet company',
        'make': 'Chevrolet',
        'model': 'Express',
        'firstName': 'Test',
        'lastName': 'Customer',
        'email': 'test@example.invalid',
        'phone': '8065550100',
        'address': 'Amarillo',
      };
      for (final e in fields.entries) {
        final field = find.widgetWithText(TextField, e.key);
        await tester.ensureVisible(field);
        await tester.enterText(field, e.value);
      }
      await tester.tap(find.widgetWithText(FilledButton, 'Save'));
      await tester.pumpAndSettle();
      expect(api.writes.length, 1);
      final body = api.writes.single['body'] as Map;
      expect(body['data']['company'], 'Fleet company');
      expect((body['data'] as Map).containsKey('make'), isFalse);
      expect(body['vehicle'], {'make': 'Chevrolet', 'model': 'Express'});
      expect(tester.takeException(), isNull);
    },
  );
}
