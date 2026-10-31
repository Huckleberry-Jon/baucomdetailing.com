import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/main.dart';
import 'package:docdetailing_owner/owner_api.dart';

class AutofillApi extends DemoOwnerApi {
  bool fail = true;
  @override
  bool get isDemo => false;
  @override
  Future<void> login(String email, String password) async {
    if (fail) throw const ApiFailure(401, 'Invalid login');
    await super.login(email, password);
  }
}

void main() {
  testWidgets(
    'password save is requested only after successful authentication',
    (tester) async {
      final api = AutofillApi();
      await tester.pumpWidget(OwnerApp(api: api));
      await tester.enterText(
        find.widgetWithText(TextField, 'Owner email'),
        'test@example.invalid',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Password'),
        'synthetic-test-password',
      );
      tester.testTextInput.log.clear();
      await tester.tap(find.text('Sign in'));
      await tester.pumpAndSettle();
      expect(
        tester.testTextInput.log.where(
          (c) =>
              c.method == 'TextInput.finishAutofillContext' &&
              c.arguments == true,
        ),
        isEmpty,
      );
      api.fail = false;
      await tester.tap(find.text('Sign in'));
      await tester.pumpAndSettle();
      expect(
        tester.testTextInput.log.where(
          (c) =>
              c.method == 'TextInput.finishAutofillContext' &&
              c.arguments == true,
        ),
        isNotEmpty,
      );
      expect(find.text('Ready for the road.'), findsOneWidget);
    },
  );
}
