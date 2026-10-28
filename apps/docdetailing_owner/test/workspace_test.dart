import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/workspace.dart';
import 'package:docdetailing_owner/owner_api.dart';
import 'package:docdetailing_owner/main.dart';

class FixtureApi extends DemoOwnerApi {
  final writes = <Map<String, dynamic>>[];
  @override
  bool get isDemo => false;
  @override
  Future<Object?> workspace(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? key,
  }) async {
    if (method != 'GET') {
      writes.add({'path': path, 'method': method, 'body': body, 'key': key});
      return {'ok': true};
    }
    if (path.contains('materials')) return {'records': []};
    if (path.contains('finance/report')) {
      return {
        'basis': 'Synthetic cash report',
        'receiptsCents': 10825,
        'tipsCents': 1000,
        'expenseCents': 2000,
        'materialsPurchasedCents': 2000,
        'estimatedProfitCents': 9000,
        'cashFlowCents': 9825,
        'salesTaxCollectedCents': 825,
        'taxRemittedCents': 0,
        'events': [],
      };
    }
    if (path.contains('customers')) {
      return {
        'records': [
          {
            'id': 'customer-1',
            'version': 'fixture-version',
            'data': {
              'firstName': 'Synthetic',
              'lastName': 'Owner test',
              'email': 'test@example.invalid',
              'phone': '8065550100',
              'address': 'Fixture',
            },
          },
        ],
      };
    }
    return {'records': []};
  }
}

void main() {
  testWidgets('owner menu opens native business workflows', (tester) async {
    await tester.pumpWidget(OwnerApp(api: DemoOwnerApi()));
    await tester.tap(find.text('Open demo dashboard'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    expect(find.text('Payment Center'), findsOneWidget);
    await tester.tap(find.text('Materials'));
    await tester.pumpAndSettle();
    expect(find.text('Add material'), findsOneWidget);
    expect(find.text('No records to display.'), findsOneWidget);
  });
  testWidgets('material entry sends cents, unit and fractional quantity', (
    tester,
  ) async {
    final api = FixtureApi();
    await tester.pumpWidget(
      MaterialApp(
        home: WorkspaceScreen(api: api, section: 'Materials'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add material'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.enterText(
      find.widgetWithText(TextField, 'Product'),
      'Cleaner',
    );
    await tester.enterText(find.widgetWithText(TextField, 'Quantity'), '1.5');
    await tester.enterText(find.widgetWithText(TextField, 'Unit cost'), '1.25');
    await tester.enterText(
      find.widgetWithText(TextField, 'Markup percent'),
      '20',
    );
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(api.writes.length, 1);
    final body = api.writes.single['body'] as Map;
    expect(body['quantityMillis'], 1500);
    expect(body['costCents'], 125);
    expect(body['markupBps'], 2000);
    expect(body['unit'], 'oz');
  });
  testWidgets('financial center labels cash basis and quarter boundaries', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: WorkspaceScreen(api: FixtureApi(), section: 'Financial Center'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Synthetic cash report'), findsOneWidget);
    expect(find.text('\$108.25'), findsOneWidget);
    expect(find.text('Estimated cash profit'), findsOneWidget);
    expect(find.text('\$90.00'), findsOneWidget);
  });
  testWidgets('native customer edit retains concurrency token', (tester) async {
    final api = FixtureApi();
    await tester.pumpWidget(
      MaterialApp(
        home: WorkspaceScreen(api: api, section: 'Customers'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Edit'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.enterText(
      find.widgetWithText(TextField, 'firstName'),
      'Updated',
    );
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(api.writes.single['method'], 'PUT');
    final body = api.writes.single['body'] as Map;
    expect(body['version'], 'fixture-version');
    expect(body['data']['firstName'], 'Updated');
  });
}
