import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/service_supplies_screen.dart';
import 'package:docdetailing_owner/job_consumables.dart';
import 'package:docdetailing_owner/completion_screen.dart';
import 'package:docdetailing_owner/owner_api.dart';
import 'completion_screen_test.dart' show CheckoutApi;

class SuppliesApi extends DemoOwnerApi {
  final writes = <Map<String, dynamic>>[];
  final service = <String, dynamic>{
    'id': 'detail',
    'name': 'Detail',
    'version': 1,
    'consumables': <Map>[],
  };
  @override
  Future<Object?> workspace(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? key,
  }) async {
    if (method != 'GET') {
      writes.add({'path': path, 'body': body, 'key': key});
      if (path.contains('service-consumables')) {
        service['consumables'] = body!['consumables'];
      }
      return {'ok': true};
    }
    if (path.contains('dashboard')) {
      return {
        'services': [service],
      };
    }
    return {
      'records': [
        {
          'id': 'rag',
          'data': {'product': 'Rags', 'unit': 'piece'},
        },
      ],
    };
  }
}

class PendingSuppliesApi extends CheckoutApi {
  @override
  Future<Object?> workspace(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? key,
  }) async {
    final value = await super.workspace(
      path,
      method: method,
      body: body,
      key: key,
    );
    if (method == 'GET') {
      final d = Map<String, dynamic>.from(value as Map);
      d['job'] = {
        ...d['job'] as Map,
        'id': 'job1',
        'plannedConsumables': [
          {'recorded': false},
        ],
      };
      return d;
    }
    return value;
  }
}

void main() {
  testWidgets(
    'service editor preserves recipes and identity while saving details',
    (tester) async {
      final api = SuppliesApi();
      api.service.addAll({
        'kind': 'package',
        'enabled': true,
        'min': 7900,
        'max': 11900,
        'durationMinutes': 90,
        'items': ['Vacuum'],
        'consumables': [
          {
            'materialId': 'rag',
            'quantityMillis': 2000,
            'billSeparately': false,
          },
        ],
      });
      await tester.pumpWidget(
        MaterialApp(home: ServiceSuppliesScreen(api: api)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit service details'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Service name'),
        'Dust Off Plus',
      );
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(api.writes.single['path'], '/api/owner/service');
      final body = api.writes.single['body'] as Map;
      expect(body['id'], 'detail');
      expect(body['name'], 'Dust Off Plus');
      expect(body['min'], 7900);
      expect(body['durationMinutes'], 90);
      expect((body['consumables'] as List).single['quantityMillis'], 2000);
      expect(find.text('Dust Off Plus'), findsOneWidget);
    },
  );

  testWidgets('owner assigns rag quantity to a service as an included cost', (
    tester,
  ) async {
    final api = SuppliesApi();
    await tester.pumpWidget(MaterialApp(home: ServiceSuppliesScreen(api: api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Assign consumable'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rags (piece)'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Quantity in piece'),
      '2',
    );
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(api.writes, isEmpty);
    expect(find.text('Included in service price'), findsOneWidget);
    await tester.tap(find.text('Save assignments'));
    await tester.pumpAndSettle();
    expect(api.writes.single['body']['serviceId'], 'detail');
    expect(api.writes.single['body']['consumables'][0]['quantityMillis'], 2000);
    expect(
      api.writes.single['body']['consumables'][0]['billSeparately'],
      false,
    );
  });
  testWidgets(
    'actual use defaults to included and sends stable planned usage key',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = SuppliesApi();
      var refreshed = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: JobConsumables(
                api: api,
                jobId: 'job1',
                plans: [
                  {
                    'materialId': 'rag',
                    'product': 'Rags',
                    'unit': 'piece',
                    'quantityMillis': 2000,
                    'estimatedCostCents': 50,
                    'availableQuantityMillis': 10000,
                    'stockVersion': 1,
                    'recorded': false,
                    'services': ['Detail'],
                  },
                ],
                open: true,
                onChanged: () async {
                  refreshed++;
                },
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Rags ·'));
      await tester.pumpAndSettle();
      expect(find.text('Separate customer charge (yes/no)'), findsNothing);
      await tester.enterText(
        find.widgetWithText(
          TextField,
          'Actual quantity in piece (0 if not used)',
        ),
        '1.5',
      );
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(api.writes.single['key'], 'planned-job1-rag');
      expect(api.writes.single['body']['quantityMillis'], 1500);
      expect(api.writes.single['body']['planned'], true);
      expect(api.writes.single['body']['billSeparately'], false);
      expect(refreshed, 1);
    },
  );
  testWidgets(
    'checkout prompts for assigned supplies before allowing completion',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: CompletionScreen(
            api: PendingSuppliesApi(),
            bookingId: 'booking1',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Review consumables before completing'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Confirm & complete job'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Confirm & complete job'),
            )
            .onPressed,
        isNull,
      );
    },
  );
  testWidgets(
    'recorded consumables have an editable invoice-only visibility switch',
    (tester) async {
      final api = SuppliesApi();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: JobConsumables(
              api: api,
              jobId: 'job1',
              plans: [
                {
                  'materialId': 'rag',
                  'movementId': 'movement1',
                  'product': 'Rags',
                  'unit': 'piece',
                  'quantityMillis': 2000,
                  'actualQuantityMillis': 1500,
                  'estimatedCostCents': 50,
                  'availableQuantityMillis': 8500,
                  'stockVersion': 2,
                  'recorded': true,
                  'includeOnInvoice': false,
                  'services': ['Detail'],
                },
              ],
              open: true,
              onChanged: () async {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Actual: 1.500 piece'), findsOneWidget);
      expect(
        tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value,
        false,
      );
      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      expect(api.writes.single['path'], '/api/owner/consumable-visibility');
      expect(api.writes.single['body'], {
        'id': 'movement1',
        'expectedVisibility': false,
        'includeOnInvoice': true,
      });
      expect(tester.takeException(), isNull);
    },
  );
}
