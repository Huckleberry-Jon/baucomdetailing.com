import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/document_screen.dart';
import 'business_workflows_test.dart' show BusinessApi;

class EstimateFixture extends BusinessApi {
  @override
  Future<Object?> workspace(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? key,
  }) async {
    final result = await super.workspace(
      path,
      method: method,
      body: body,
      key: key,
    );
    if (path.contains('/document?') && method == 'GET') {
      return {
        ...result as Map,
        'kind': 'estimate',
        'number': 'EST-1',
        'paid_cents': 0,
      };
    }
    return result;
  }
}

void main() {
  testWidgets(
    'issued estimate is a quote without unpaid balance or payment collection controls',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: DocumentScreen(api: EstimateFixture(), id: 'estimate-1'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('EST-1 \u00b7 Estimate issued'), findsOneWidget);
      expect(find.textContaining('Estimate total: \$108.25'), findsOneWidget);
      expect(find.textContaining('Unpaid'), findsNothing);
      expect(find.textContaining('Balance:'), findsNothing);
      expect(find.text('Record payment or deposit'), findsNothing);
      expect(find.textContaining('quote, not a bill'), findsOneWidget);
    },
  );
}
