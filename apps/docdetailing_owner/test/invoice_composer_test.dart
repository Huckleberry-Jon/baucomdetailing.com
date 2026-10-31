import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/invoice_composer.dart';
import 'package:docdetailing_owner/document_screen.dart';
import 'business_workflows_test.dart' show BusinessApi, line;

final doc = {
  'kind': 'invoice',
  'status': 'issued',
  'number': 'INV-42',
  'paid_cents': 3000,
};
final data = {
  'businessName': 'Test Detailing',
  'totalCents': 10000,
  'customer': {
    'firstName': 'Test',
    'lastName': 'Customer',
    'email': 'test@example.invalid',
    'phone': '(806) 555-0100',
  },
};

class SendApi extends BusinessApi {
  @override
  Future<Object?> workspace(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? key,
  }) async {
    final response = await super.workspace(
      path,
      method: method,
      body: body,
      key: key,
    );
    if (path.contains('/document?')) {
      final r = Map<String, dynamic>.from(response as Map);
      r['data'] = {
        ...r['data'] as Map,
        'businessName': 'Test Detailing',
        'customer': data['customer'],
      };
      return r;
    }
    return response;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'invoice email/text drafts include the PDF and correct recipient/balance without private website links',
    () {
      final bytes = Uint8List.fromList([37, 80, 68, 70]);
      final email = invoiceMessage(doc, data, bytes, email: true),
          sms = invoiceMessage(doc, data, bytes, email: false);
      expect(email['recipient'], 'test@example.invalid');
      expect(sms['recipient'], '8065550100');
      expect(email['body'], contains('Balance: \$70.00'));
      expect(email['pdf'], bytes);
      expect(email['filename'], 'docdetailing-INV-42.pdf');
      expect(email['body'], isNot(contains('workers.dev')));
      expect(
        () => invoiceMessage(
          {...doc, 'status': 'draft'},
          data,
          bytes,
          email: true,
        ),
        throwsFormatException,
      );
      expect(
        () =>
            invoiceMessage(doc, {...data, 'customer': {}}, bytes, email: false),
        throwsFormatException,
      );
    },
  );
  testWidgets(
    'email button opens a reviewable native composer with PDF; cancellation does not mark delivery',
    (tester) async {
      final calls = <MethodCall>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        InvoiceComposer.channel,
        (call) async {
          calls.add(call);
          return 'cancelled';
        },
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          InvoiceComposer.channel,
          null,
        ),
      );
      final api = SendApi();
      await tester.pumpWidget(
        MaterialApp(
          home: DocumentScreen(api: api, id: 'invoice-1'),
        ),
      );
      await tester.pumpAndSettle();
      final button = find.text('Email invoice');
      await tester.scrollUntilVisible(
        button,
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(calls.single.method, 'composeEmail');
      expect(calls.single.arguments['recipient'], 'test@example.invalid');
      expect(calls.single.arguments['pdf'], isA<Uint8List>());
      expect(
        find.text('Message draft closed without sending.'),
        findsOneWidget,
      );
      expect(api.writes, isEmpty);
    },
  );
  testWidgets('draft invoice preview updates totals and spacing on a phone', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: DocumentEditor(
          api: BusinessApi(),
          existing: {
            'id': 'draft',
            'version': 1,
            'kind': 'invoice',
            'customer_id': 'customer',
            'data': {
              'customer': data['customer'],
              'lines': [line],
              'discountCents': 500,
              'taxBps': 825,
            },
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Total: \$102.84'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Total: \$102.84'), findsOneWidget);
    final discount = find.widgetWithText(TextField, 'Discount (USD)');
    await tester.ensureVisible(discount);
    await tester.enterText(discount, '10');
    await tester.pump();
    await tester.scrollUntilVisible(
      find.text('Total: \$97.43'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Total: \$97.43'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  test(
    'text composer reports unavailable support without claiming a message was sent',
    () async {
      MethodCall? request;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(InvoiceComposer.channel, (call) async {
            request = call;
            return 'unavailable';
          });
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(InvoiceComposer.channel, null),
      );
      final outcome = await InvoiceComposer().compose(
        doc,
        data,
        Uint8List.fromList([37, 80, 68, 70]),
        email: false,
      );
      expect(request!.method, 'composeText');
      expect(request!.arguments['recipient'], '8065550100');
      expect(outcome, 'unavailable');
    },
  );
  testWidgets('saving a new draft opens document review for issue and send', (
    tester,
  ) async {
    final api = BusinessApi();
    await tester.pumpWidget(
      MaterialApp(
        home: DocumentEditor(
          api: api,
          customer: {'id': 'customer-1', 'data': data['customer']},
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add line'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.enterText(
      find.widgetWithText(TextField, 'Description'),
      'Approved detailing',
    );
    await tester.ensureVisible(find.widgetWithText(TextField, 'Unit price'));
    await tester.enterText(
      find.widgetWithText(TextField, 'Unit price'),
      '50.50',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Save draft'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Save draft'));
    await tester.pumpAndSettle();
    expect(find.byType(DocumentScreen), findsOneWidget);
    expect(
      (api.writes.single['body'] as Map)['lines'][0]['unitPriceCents'],
      5050,
    );
  });
}
