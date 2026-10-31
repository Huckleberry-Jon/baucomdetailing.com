import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:docdetailing_owner/receipt_recognizer.dart';
import 'package:docdetailing_owner/receipt_import_screen.dart';
import 'package:docdetailing_owner/business_settings_screen.dart';
import 'package:docdetailing_owner/owner_api.dart';
import 'package:docdetailing_owner/business_pdf.dart';

class ReceiptApi extends DemoOwnerApi {
  final writes = <Map<String, dynamic>>[];
  bool failOnce = false;
  @override
  Future<Object?> workspace(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? key,
  }) async {
    if (method != 'GET') {
      writes.add({'body': body, 'key': key, 'path': path});
      if (failOnce) {
        failOnce = false;
        throw Exception('Uncertain response');
      }
      return {'ok': true};
    }
    if (path.contains('business-profile')) {
      return {
        'version': 4,
        'profile': {
          'name': 'Fixture Detail',
          'contact': 'Amarillo',
          'invoiceAddress': '',
          'invoicePhone': '',
          'invoiceEmail': '',
          'invoiceFooter': '',
        },
      };
    }
    return {'records': []};
  }
}

final png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWO4st4cjhiI4wAA2GIboZOCNmwAAAAASUVORK5CYII=',
);
void main() {
  test(
    'receipt parser extracts review candidates without treating totals, tax or tender as products',
    () {
      final d = parseReceipt(
        'Fixture Store\nCleaner 9.99\n2 x Towels 6.00\nSubtotal 15.99\nTax 1.32\nTotal 17.31\nVisa 17.31',
      );
      expect(d.vendor, 'Fixture Store');
      expect(d.items.length, 2);
      expect(d.items[0].costCents, 999);
      expect(d.items[1].quantityMillis, 2000);
      expect(d.items[1].costCents, 300);
    },
  );
  test(
    'receipt native channel passes bounded image bytes and receives recognized text',
    () async {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(ReceiptRecognizer.channel, (call) async {
            expect(call.method, 'recognize');
            expect((call.arguments as Map)['bytes'], png);
            return 'Shop\nCleaner 5.00';
          });
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(ReceiptRecognizer.channel, null),
      );
      expect(
        (await ReceiptRecognizer().extract(png)).items.single.costCents,
        500,
      );
    },
  );
  testWidgets(
    'receipt review does not write before explicit apply and retries identical payload/key',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = ReceiptApi()..failOnce = true;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (c) => Scaffold(
              body: TextButton(
                onPressed: () => Navigator.push(
                  c,
                  MaterialPageRoute(
                    builder: (_) => ReceiptImportScreen(
                      api: api,
                      pick: (_) async =>
                          XFile.fromData(png, name: 'receipt.png'),
                      recognize: (_) async =>
                          parseReceipt('Fixture Shop\nCleaner 5.00'),
                    ),
                  ),
                ),
                child: const Text('Open receipt'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open receipt'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose receipt photo'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Cleaner'), findsWidgets);
      expect(api.writes, isEmpty);
      await tester.scrollUntilVisible(find.text('Apply reviewed items'), 250);
      await tester.tap(find.text('Apply reviewed items'));
      await tester.pumpAndSettle();
      expect(api.writes, isEmpty);
      await tester.tap(find.text('Apply to inventory'));
      await tester.pumpAndSettle();
      expect(api.writes.length, 1);
      expect(api.writes.single['body']['lines'][0]['unit'], 'piece');
      await tester.scrollUntilVisible(find.text('Retry same receipt'), 150);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Retry same receipt'));
      await tester.pumpAndSettle();
      expect(api.writes.length, 2);
      expect(api.writes[0]['body'], api.writes[1]['body']);
      expect(api.writes[0]['key'], api.writes[1]['key']);
    },
  );
  testWidgets(
    'business settings edits invoice identity using versioned isolated endpoint',
    (tester) async {
      final api = ReceiptApi();
      await tester.pumpWidget(
        MaterialApp(home: BusinessSettingsScreen(api: api)),
      );
      await tester.pumpAndSettle();
      expect(find.text('Choose invoice logo'), findsOneWidget);
      await tester.enterText(
        find.widgetWithText(TextField, 'Business name'),
        'Updated Detail',
      );
      await tester.scrollUntilVisible(
        find.text('Save business settings'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save business settings'));
      await tester.pumpAndSettle();
      expect(api.writes.single['path'], '/api/owner/business-profile');
      expect(api.writes.single['body']['version'], 4);
      expect(api.writes.single['body']['profile']['name'], 'Updated Detail');
    },
  );
  test('invoice PDF accepts a logo and business contact snapshot', () async {
    final data = <String, dynamic>{
      'businessName': 'Fixture',
      'businessAddress': 'Amarillo',
      'businessPhone': '8065550100',
      'businessEmail': 'fixture@example.invalid',
      'invoiceFooter': 'Thank you',
      'totalCents': 500,
      'subtotalCents': 500,
      'discountCents': 0,
      'taxCents': 0,
      'lines': <Map>[],
    };
    final bytes = await businessPdf(
      {'kind': 'invoice', 'number': 'INV-1'},
      data,
      logo: Uint8List.fromList(png),
    );
    expect(utf8.decode(bytes.take(4).toList()), '%PDF');
  });
}
