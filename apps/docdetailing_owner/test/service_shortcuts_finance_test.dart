import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/service_shortcuts.dart';
import 'package:docdetailing_owner/service_supplies_screen.dart';
import 'package:docdetailing_owner/workspace.dart';
import 'service_supplies_test.dart' show SuppliesApi;

class ServiceFinanceApi extends SuppliesApi {
  @override
  Future<Object?> workspace(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    String? key,
  }) async {
    if (path.contains('dashboard')) {
      return {
        'settings': {'timezone': 'America/Chicago'},
        'services': [
          {
            'id': 'dustoff',
            'name': 'Dust Off',
            'enabled': true,
            'version': 1,
            'consumables': [],
          },
          {
            'id': 'route66',
            'name': 'Route 66 Revival',
            'enabled': true,
            'version': 1,
            'consumables': [],
          },
        ],
      };
    }
    if (path.contains('finance/report')) {
      return {
        'consumablesUsedCents': 50,
        'includedConsumablesUsedCents': 50,
        'separatelyBilledConsumablesUsedCents': 0,
        'jobProfitCents': 9950,
        'jobProfitability': [
          {
            'number': 'INV-1',
            'revenueExcludingTaxCents': 10000,
            'costCents': 50,
            'consumablesCostCents': 50,
            'profitCents': 9950,
          },
        ],
        'events': [],
      };
    }
    return super.workspace(path, method: method, body: body, key: key);
  }
}

void main() {
  testWidgets('drawer service button opens only that service supplies', (
    tester,
  ) async {
    final api = ServiceFinanceApi();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          appBar: AppBar(),
          drawer: Drawer(
            child: ListView(children: [ServiceShortcuts(api: api)]),
          ),
          body: const Text('Home'),
        ),
      ),
    );
    await tester.tap(find.byTooltip('Open navigation menu'));
    await tester.pumpAndSettle();
    expect(find.text('Dust Off'), findsNothing);
    await tester.tap(find.text('Services'));
    await tester.pumpAndSettle();
    expect(find.text('Dust Off'), findsOneWidget);
    await tester.tap(find.text('Dust Off'));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<ServiceSuppliesScreen>(find.byType(ServiceSuppliesScreen))
          .serviceId,
      'dustoff',
    );
    expect(find.text('Dust Off'), findsOneWidget);
    expect(find.text('Route 66 Revival'), findsNothing);
  });
  testWidgets(
    'financial center separates included consumables and job profit from cash costs',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: WorkspaceScreen(
            api: ServiceFinanceApi(),
            section: 'Financial Center',
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Consumables used this period'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      final tile = find.ancestor(
        of: find.text('Consumables used this period'),
        matching: find.byType(ListTile),
      );
      expect((tester.widget<ListTile>(tile).trailing as Text).data, '\$0.50');
      await tester.scrollUntilVisible(
        find.text('Issued job profit before overhead'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(
        (tester
                    .widget<ListTile>(
                      find.ancestor(
                        of: find.text('Issued job profit before overhead'),
                        matching: find.byType(ListTile),
                      ),
                    )
                    .trailing
                as Text)
            .data,
        '\$99.50',
      );
    },
  );
}
