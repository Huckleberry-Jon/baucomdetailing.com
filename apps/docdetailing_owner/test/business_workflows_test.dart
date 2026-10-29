import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/owner_api.dart';
import 'package:docdetailing_owner/document_screen.dart';
import 'package:docdetailing_owner/jobs_screen.dart';
import 'package:docdetailing_owner/business_forms.dart';
import 'package:docdetailing_owner/business_pdf.dart';

final line = {
  'description': 'Approved detailing',
  'unit': 'service',
  'quantityMillis': 1000,
  'unitPriceCents': 10000,
  'unitCostCents': 0,
  'taxable': true,
  'totalCents': 10000,
};

class BusinessApi extends DemoOwnerApi {
  final writes = <Map>[];
  @override
  Future<Object?> workspace(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? key,
  }) async {
    if (method != 'GET') {
      writes.add({'path': path, 'body': body, 'key': key});
      return {'id': 'draft-1'};
    }
    if (path.contains('/customers')) {
      return {
        'records': [
          {
            'id': 'customer-1',
            'data': {'firstName': 'Test', 'lastName': 'Customer'},
          },
        ],
      };
    }
    if (path.contains('/document?')) {
      return {
        'id': 'invoice-1',
        'version': 2,
        'number': 'INV-1',
        'customer_id': 'customer-1',
        'kind': 'invoice',
        'status': 'issued',
        'paid_cents': 3000,
        'payments': [],
        'data': {
          'totalCents': 10825,
          'subtotalCents': 10000,
          'taxCents': 825,
          'taxBps': 825,
          'lines': [line],
          'customer': {'firstName': 'Test', 'lastName': 'Customer'},
        },
      };
    }
    if (path.contains('/job?')) {
      return {
        'id': 'job-1',
        'booking_id': 'booking-1',
        'version': 4,
        'status': 'in_progress',
        'customer': {'firstName': 'Test', 'lastName': 'Customer'},
        'data': {
          'lines': [line],
          'laborCostCents': 2000,
          'travelCostCents': 500,
        },
        'materials': [],
      };
    }
    return {'records': []};
  }
}

void main() {
  test(
    'quantities preserve thousandths and reject negative or extra precision',
    () {
      expect(quantityMillis('1.005'), 1005);
      expect(quantityInput(1005), '1.005');
      expect(() => quantityMillis('1.0005'), throwsFormatException);
      expect(() => quantityMillis('-1'), throwsFormatException);
    },
  );
  testWidgets(
    'native invoice editor retains multiple lines, discount and version',
    (tester) async {
      final api = BusinessApi();
      await tester.pumpWidget(
        MaterialApp(
          home: DocumentEditor(
            api: api,
            existing: {
              'id': 'draft-1',
              'version': 3,
              'customer_id': 'customer-1',
              'kind': 'invoice',
              'data': {
                'customer': {'firstName': 'Test', 'lastName': 'Customer'},
                'taxBps': 825,
                'discountCents': 500,
                'lines': [
                  line,
                  {...line, 'description': 'Travel'},
                ],
              },
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Approved detailing'), findsOneWidget);
      expect(find.text('Travel'), findsOneWidget);
      await tester.ensureVisible(find.text('Save draft'));
      await tester.tap(find.text('Save draft'));
      await tester.pumpAndSettle();
      final body = api.writes.single['body'] as Map;
      expect(body['lines'], hasLength(2));
      expect(body['discountCents'], 500);
      expect(body['taxBps'], 825);
      expect(body['version'], 3);
    },
  );
  testWidgets('native job save retains server version and cost values', (
    tester,
  ) async {
    final api = BusinessApi();
    await tester.pumpWidget(
      MaterialApp(
        home: JobScreen(api: api, id: 'job-1'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save charges'));
    await tester.pumpAndSettle();
    final body = api.writes.single['body'] as Map;
    expect(body['version'], 4);
    expect(body['data']['laborCostCents'], 2000);
    expect(body['data']['lines'], hasLength(1));
  });
  testWidgets('invoice payments show partial balance on an iPhone viewport', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: DocumentScreen(api: BusinessApi(), id: 'invoice-1'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Partially paid'), findsOneWidget);
    expect(find.textContaining('78.25'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  test(
    'invoice and receipt PDFs contain valid document headers and clickable review link',
    () async {
      final row = {
        'kind': 'invoice',
        'number': 'INV-1',
        'paid_cents': 3000,
        'payments': [],
      };
      final data = {
        'businessName': 'Test Business',
        'customer': {'firstName': 'Test'},
        'lines': [line],
        'subtotalCents': 10000,
        'taxCents': 825,
        'totalCents': 10825,
        'reviewUrl': 'https://g.page/r/test/review',
      };
      for (final receipt in [false, true]) {
        final bytes = await businessPdf(row, data, receipt: receipt);
        final content = latin1.decode(bytes);
        expect(content.startsWith('%PDF-'), true);
        expect(content, contains('/URI'));
        expect(content, contains('%%EOF'));
      }
    },
  );
}
