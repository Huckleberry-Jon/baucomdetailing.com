import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/owner_theme.dart';
import 'package:docdetailing_owner/main.dart';
import 'package:docdetailing_owner/owner_api.dart';
import 'package:docdetailing_owner/workspace.dart';

double contrast(Color a, Color b) {
  final x = a.computeLuminance(), y = b.computeLuminance();
  return ((x > y ? x : y) + 0.05) / ((x > y ? y : x) + 0.05);
}

void main() {
  test('light gold theme meets AA for text, fields, actions and errors', () {
    final t = ownerTheme(), s = t.colorScheme;
    expect(t.brightness, Brightness.light);
    for (final bg in [
      t.scaffoldBackgroundColor,
      s.surface,
      s.surfaceContainerHighest,
      s.primaryContainer,
    ]) {
      expect(contrast(s.onSurface, bg), greaterThanOrEqualTo(4.5));
      expect(contrast(s.onSurfaceVariant, bg), greaterThanOrEqualTo(4.5));
      expect(contrast(s.primary, bg), greaterThanOrEqualTo(4.5));
    }
    expect(contrast(s.error, Colors.white), greaterThanOrEqualTo(4.5));
    expect(
      contrast(t.inputDecorationTheme.hintStyle!.color!, Colors.white),
      greaterThanOrEqualTo(4.5),
    );
    final b = t.filledButtonTheme.style!;
    expect(
      contrast(
        b.foregroundColor!.resolve({})!,
        b.backgroundColor!.resolve({})!,
      ),
      greaterThanOrEqualTo(4.5),
    );
    expect(contrast(s.outline, Colors.white), greaterThanOrEqualTo(3));
  });
  testWidgets(
    'dashboard uses the light theme even with dark device preference',
    (tester) async {
      tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
      addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(OwnerApp(api: DemoOwnerApi()));
      await tester.tap(find.text('Open demo dashboard'));
      await tester.pumpAndSettle();
      expect(
        Theme.of(tester.element(find.text('Ready for the road.'))).brightness,
        Brightness.light,
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'light materials form has readable fields on iPhone at enlarged text size',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          theme: ownerTheme(),
          builder: (c, child) => MediaQuery(
            data: MediaQuery.of(c).copyWith(textScaler: TextScaler.linear(1.3)),
            child: child!,
          ),
          home: WorkspaceScreen(api: DemoOwnerApi(), section: 'Materials'),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add material'));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(TextField), findsWidgets);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );
}
