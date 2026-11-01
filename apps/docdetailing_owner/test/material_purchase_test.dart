import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/material_purchase_screen.dart';
import 'package:docdetailing_owner/material_costing.dart';
import 'package:docdetailing_owner/owner_api.dart';

class PurchaseApi extends DemoOwnerApi {
  final writes = <Map<String, dynamic>>[];
  @override
  Future<Object?> workspace(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? key,
  }) async {
    writes.add({'path': path, 'body': body, 'key': key});
    return {'ok': true};
  }
}

void main() {
  test(
    'invoice preview uses exact gallon basis and 30% markup without rounding the unit price first',
    () {
      final line = {
        'quantityMillis': 8000,
        'unitPriceCents': 33,
        'costBasisCents': 3299,
        'costBasisQuantityMillis': 128000,
        'markupBps': 3000,
      };
      expect(invoiceLineTotal(line), 268);
      expect(invoiceUnitPrice(line), '0.3351');
      expect(invoiceLineTotal({...line, 'quantityMillis': 128000}), 4289);
    },
  );
  testWidgets(
    'new gallon purchase defaults to 128 ounces with no consumable markup',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = PurchaseApi();
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (c) => Scaffold(
              body: TextButton(
                onPressed: () => Navigator.push(
                  c,
                  MaterialPageRoute(
                    builder: (_) => MaterialPurchaseScreen(api: api),
                  ),
                ),
                child: const Text('Open purchase'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open purchase'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<TextField>(
              find.widgetWithText(
                TextField,
                'Optional separate-charge markup (%)',
              ),
            )
            .controller!
            .text,
        '0.00',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Product name'),
        'Gallon cleaner',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Cost per purchased container'),
        '32.99',
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('128.000 US fl oz'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Review and save'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Review and save'));
      await tester.pumpAndSettle();
      expect(api.writes, isEmpty);
      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();
      final body = api.writes.single['body'];
      expect(body['kind'], 'purchase');
      expect(body['purchaseQuantityMillis'], 1000);
      expect(body['product']['purchaseCostCents'], 3299);
      expect(body['product']['purchaseSizeMillis'], 128000);
      expect(body['product']['markupBps'], 0);
      expect(body['product']['unit'], 'oz');
    },
  );
  testWidgets(
    'existing single container requires explicit conversion confirmation',
    (tester) async {
      final api = PurchaseApi(),
          row = {
            'id': 'material1',
            'version': 2,
            'stock_version': 3,
            'available_quantity_millis': 1000,
            'data': {
              'product': 'Cleaner',
              'unit': 'piece',
              'quantityMillis': 1000,
              'costCents': 3299,
              'markupBps': 0,
              'taxable': false,
            },
          };
      await tester.pumpWidget(
        MaterialApp(
          home: MaterialPurchaseScreen(api: api, row: row, configure: true),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byType(DropdownButtonFormField<String>).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('US gallon').last);
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Convert current stock to: 128.000'),
        findsOneWidget,
      );
      await tester.scrollUntilVisible(
        find.text('Review and save'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Review and save'));
      await tester.pumpAndSettle();
      expect(find.text('Convert stock units?'), findsOneWidget);
      await tester.tap(find.text('Keep reviewing'));
      await tester.pumpAndSettle();
      expect(api.writes, isEmpty);
    },
  );
}
