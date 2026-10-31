import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/completion_screen.dart';
import 'package:docdetailing_owner/owner_api.dart';

class CheckoutApi extends DemoOwnerApi {
  final writes = <Map<String, dynamic>>[];
  bool failFirst = false;
  @override
  Future<Object?> workspace(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? key,
  }) async {
    if (method == 'POST') {
      writes.add({'body': body, 'key': key});
      if (failFirst && writes.length == 1) {
        throw const ApiFailure(503, 'Uncertain response');
      }
      return {
        'documentId': 'invoice-1',
        'paymentId': body!['unpaid'] == true ? null : 'payment-1',
        'amountCents': body['amountCents'],
        'tipCents': body['tipCents'],
        'balanceCents': 10000 - (body['amountCents'] as int),
      };
    }
    return {
      'job': {
        'customer': {'firstName': 'Test', 'lastName': 'Customer'},
        'status': 'in_progress',
        'booking_version': 3,
        'version': 1,
      },
      'invoice': null,
      'quote': {
        'subtotalCents': 10000,
        'totalCents': 10000,
        'lines': [
          {'totalCents': 10000, 'taxable': true},
        ],
      },
      'checkoutRecorded': false,
    };
  }
}

Future<void> open(WidgetTester tester, CheckoutApi api) async {
  await tester.pumpWidget(
    MaterialApp(
      home: CompletionScreen(api: api, bookingId: 'booking-1'),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> paidFields(WidgetTester tester) async {
  await tester.ensureVisible(
    find.widgetWithText(TextField, 'Payment received (excluding tip)'),
  );
  await tester.enterText(
    find.widgetWithText(TextField, 'Payment received (excluding tip)'),
    '80',
  );
  await tester.ensureVisible(find.widgetWithText(TextField, 'Tip received'));
  await tester.enterText(find.widgetWithText(TextField, 'Tip received'), '10');
  final method = find.byType(DropdownButtonFormField<String>);
  await tester.ensureVisible(method);
  await tester.tap(method);
  await tester.pumpAndSettle();
  await tester.tap(find.text('Cash').last);
  await tester.pumpAndSettle();
}

Future<void> submit(WidgetTester tester) async {
  final button = find.text('Confirm & complete job');
  await tester.scrollUntilVisible(
    button,
    200,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.tap(button);
  await tester.pumpAndSettle();
}

void main() {
  test(
    'completion totals preserve proportional discounts and tax rounding',
    () {
      expect(
        completionTotal(
          {
            'subtotalCents': 20000,
            'lines': [
              {'totalCents': 10000, 'taxable': true},
              {'totalCents': 10000, 'taxable': false},
            ],
          },
          0,
          2000,
          825,
        ),
        18743,
      );
      expect(
        () => completionTotal(null, 10000, 10001, 0),
        throwsFormatException,
      );
    },
  );
  testWidgets(
    'phone checkout confirms amount and separate tip before recording payment',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = CheckoutApi();
      await open(tester, api);
      await paidFields(tester);
      await submit(tester);
      expect(api.writes, isEmpty);
      expect(find.textContaining('Total received: \$90.00'), findsOneWidget);
      await tester.tap(find.text('Go back'));
      await tester.pumpAndSettle();
      expect(api.writes, isEmpty);
      await submit(tester);
      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();
      expect(api.writes.single['body']['amountCents'], 8000);
      expect(api.writes.single['body']['tipCents'], 1000);
      expect(api.writes.single['body']['method'], 'cash');
      expect(find.textContaining('Remaining balance: \$20.00'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('unpaid completion explicitly records zero payment and no tip', (
    tester,
  ) async {
    final api = CheckoutApi();
    await open(tester, api);
    await tester.ensureVisible(find.text('Not paid yet'));
    await tester.tap(find.text('Not paid yet'));
    await tester.pumpAndSettle();
    await submit(tester);
    expect(find.text('Complete without payment?'), findsOneWidget);
    await tester.tap(find.text('Confirm'));
    await tester.pumpAndSettle();
    expect(api.writes.single['body']['unpaid'], true);
    expect(api.writes.single['body']['amountCents'], 0);
    expect(api.writes.single['body']['tipCents'], 0);
  });
  testWidgets(
    'uncertain response retries identical payment and idempotency key',
    (tester) async {
      final api = CheckoutApi()..failFirst = true;
      await open(tester, api);
      await paidFields(tester);
      await submit(tester);
      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();
      final retry = find.text('Retry same payment request');
      await tester.scrollUntilVisible(
        retry,
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(retry);
      await tester.pumpAndSettle();
      expect(api.writes.length, 2);
      expect(api.writes.first, api.writes.last);
      expect(find.text('Payment and job completion recorded'), findsOneWidget);
    },
  );
}
