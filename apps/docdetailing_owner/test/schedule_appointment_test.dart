import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/owner_api.dart';
import 'package:docdetailing_owner/schedule_appointment.dart';

class ManualApi extends DemoOwnerApi {
  final bodies = <Map<String, dynamic>>[];
  final keys = <String?>[];
  @override
  Future<Object?> workspace(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? key,
  }) async {
    if (path == '/api/owner/dashboard') {
      return {
        'settings': {'timezone': 'America/Chicago'},
        'services': [
          {
            'id': 'dustoff',
            'name': 'Dust Off',
            'kind': 'package',
            'enabled': true,
            'durationMinutes': 90,
          },
        ],
      };
    }
    if (path == '/api/owner/appointments') {
      bodies.add(Map.from(body!));
      keys.add(key);
      throw const ApiFailure(409, 'Appointment overlaps blocked time');
    }
    throw StateError(path);
  }
}

void main() {
  testWidgets(
    'manual entry preserves customer details and retry key on schedule conflict',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = ManualApi();
      await tester.pumpWidget(
        MaterialApp(home: ScheduleAppointmentScreen(api: api)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Dust Off').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose date'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      final values = {
        'First name': 'Manual',
        'Last name': 'Customer',
        'Phone': '8065550101',
        'Service address': 'Test address',
        'Year': '2020',
        'Make': 'Ford',
        'Model': 'F350',
        'Color': 'White',
        'Body type': 'Truck',
      };
      for (final entry in values.entries) {
        final field = find.widgetWithText(TextFormField, entry.key);
        await tester.ensureVisible(field);
        await tester.enterText(field, entry.value);
      }
      tester.testTextInput.hide();
      await tester.scrollUntilVisible(
        find.text('Save appointment'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save appointment'));
      await tester.pumpAndSettle();
      expect(api.bodies.length, 1);
      expect(api.bodies.single['email'], '');
      expect(api.bodies.single['durationMinutes'], 90);
      expect(api.bodies.single['packageId'], 'dustoff');
      expect(
        DateTime.parse(api.bodies.single['requestedAt'] as String).isUtc,
        isTrue,
      );
      tester.testTextInput.hide();
      await tester.scrollUntilVisible(
        find.text('Save appointment'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save appointment'));
      await tester.pumpAndSettle();
      expect(api.keys[0], api.keys[1]);
      expect(find.text('Appointment overlaps blocked time'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
