import 'dart:convert';
import 'package:flutter/material.dart';
import 'owner_api.dart';
import 'business_forms.dart';
import 'money.dart';

class MaterialPurchaseScreen extends StatefulWidget {
  const MaterialPurchaseScreen({
    super.key,
    required this.api,
    this.row,
    this.configure = false,
  });
  final OwnerApi api;
  final Map? row;
  final bool configure;
  @override
  State<MaterialPurchaseScreen> createState() => _MaterialPurchaseState();
}

class _MaterialPurchaseState extends State<MaterialPurchaseScreen> {
  final name = TextEditingController(),
      cost = TextEditingController(),
      count = TextEditingController(text: '1'),
      contents = TextEditingController(text: '1'),
      markup = TextEditingController(text: '0');
  String purchaseUnit = 'gallon', unit = 'oz', error = '';
  bool busy = false;
  Map<String, dynamic>? pending;
  final key = 'purchase-${DateTime.now().microsecondsSinceEpoch}';
  late Map<String, dynamic> original;
  @override
  void initState() {
    super.initState();
    final data = widget.row?['data'];
    original = data is String
        ? Map<String, dynamic>.from(jsonDecode(data))
        : Map<String, dynamic>.from(data as Map? ?? {});
    name.text = original['product'] as String? ?? '';
    cost.text = moneyInput(
      original['purchaseCostCents'] as int? ??
          original['costCents'] as int? ??
          0,
    );
    purchaseUnit =
        original['purchaseUnit'] as String? ??
        original['unit'] as String? ??
        'gallon';
    unit = original['unit'] as String? ?? 'oz';
    contents.text = quantityInput(
      original['purchaseSizeMillis'] as int? ??
          (purchaseUnit == 'gallon' && unit == 'oz' ? 128000 : 1000),
    );
    markup.text = moneyInput(original['markupBps'] as int? ?? 0);
  }

  @override
  void dispose() {
    for (final c in [name, cost, count, contents, markup]) {
      c.dispose();
    }
    super.dispose();
  }

  int get size => purchaseUnit == unit
      ? 1000
      : purchaseUnit == 'gallon' && unit == 'oz'
      ? 128000
      : quantityMillis(contents.text);
  String get kind => widget.configure
      ? (original['unit'] != unit ? 'convert' : 'settings')
      : 'purchase';
  String preview() {
    try {
      final stock = widget.row?['available_quantity_millis'] as int? ?? 0,
          qty = kind == 'convert' ? stock : quantityMillis(count.text),
          next = kind == 'settings'
              ? stock
              : (kind == 'convert' ? 0 : stock) + qty * size ~/ 1000;
      final perUnit = parseMoneyCents(cost.text) * 1000 / size / 100,
          price = perUnit * (1 + parseMoneyCents(markup.text) / 10000);
      return '${kind == 'convert' ? 'Convert current stock to' : 'Stock after save'}: ${quantityInput(next)} ${unit == 'oz' ? 'US fl oz' : unit}\nCost per usage unit: \$${perUnit.toStringAsFixed(6)}\nBilling per usage unit: \$${price.toStringAsFixed(6)}';
    } catch (_) {
      return 'Enter purchase cost, quantity and contents.';
    }
  }

  Future<void> save() async {
    if (pending == null) {
      try {
        final sizeMillis = size;
        if (name.text.trim().isEmpty || sizeMillis <= 0) {
          throw const FormatException('Enter product and container contents.');
        }
        final product = {
          ...original,
          'product': name.text.trim(),
          'unit': unit,
          'quantityMillis': kind == 'convert'
              ? 1000
              : original['quantityMillis'] ?? 1000,
          'costCents': 0,
          'purchaseUnit': purchaseUnit,
          'purchaseSizeMillis': sizeMillis,
          'purchaseCostCents': parseMoneyCents(cost.text),
          'markupBps': parseMoneyCents(markup.text),
          'taxable': original['taxable'] ?? false,
          'lowStockMillis': kind == 'convert'
              ? null
              : original['lowStockMillis'],
        };
        final payload = {
          'kind': kind,
          'confirmed': true,
          'product': product,
          'purchaseQuantityMillis': quantityMillis(count.text),
          if (widget.row != null) 'materialId': widget.row!['id'],
          if (widget.row != null) 'materialVersion': widget.row!['version'],
          if (widget.row != null)
            'stockVersion': widget.row!['stock_version'] ?? 0,
        };
        final yes = await showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
            title: Text(
              kind == 'convert'
                  ? 'Convert stock units?'
                  : 'Save purchase cost and units?',
            ),
            content: Text(
              '${preview()}\n\n${kind == 'convert' ? 'Current stock is interpreted as containers of the declared purchase size. This does not add a new purchase.' : 'Purchase quantities are converted to the usage unit. Purchase records do not create a financial expense automatically.'}',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(c, false),
                child: const Text('Keep reviewing'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(c, true),
                child: const Text('Confirm'),
              ),
            ],
          ),
        );
        if (yes != true || !mounted) return;
        pending = payload;
      } catch (e) {
        setState(() => error = e.toString());
        return;
      }
    }
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await widget.api.workspace(
        '/api/owner/material-purchase',
        method: 'POST',
        body: pending,
        key: key,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(
          () =>
              error = '$e\nRetry uses the same key to prevent duplicate stock.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(
        widget.configure ? 'Purchase units & cost' : 'Add stock purchase',
      ),
    ),
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (busy) const LinearProgressIndicator(),
          if (error.isNotEmpty)
            Text(
              error,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          const Text(
            '1 US gallon = 128 fl oz. Supplies used on a job are included in the service price at actual cost. Optional markup applies only to separately billed products.',
          ),
          TextField(
            controller: name,
            enabled: !busy && pending == null,
            decoration: const InputDecoration(labelText: 'Product name'),
          ),
          DropdownButtonFormField<String>(
            initialValue: purchaseUnit,
            decoration: const InputDecoration(labelText: 'Purchase unit'),
            items: [
              for (final u in ['gallon', 'oz', 'bottle', 'piece'])
                DropdownMenuItem(
                  value: u,
                  child: Text(
                    u == 'gallon'
                        ? 'US gallon'
                        : u == 'oz'
                        ? 'US fluid ounce'
                        : u,
                  ),
                ),
            ],
            onChanged: busy || pending != null
                ? null
                : (v) => setState(() {
                    purchaseUnit = v!;
                    if (v == 'gallon') {
                      unit = 'oz';
                      contents.text = '128';
                    } else if (v == unit) {
                      contents.text = '1';
                    }
                  }),
          ),
          DropdownButtonFormField<String>(
            key: ValueKey(unit),
            initialValue: unit,
            decoration: const InputDecoration(
              labelText: 'Track and bill usage in',
            ),
            items: [
              for (final u in ['oz', 'gallon', 'bottle', 'piece'])
                DropdownMenuItem(
                  value: u,
                  child: Text(u == 'oz' ? 'US fluid ounces' : u),
                ),
            ],
            onChanged: busy || pending != null
                ? null
                : (v) => setState(() => unit = v!),
          ),
          if (purchaseUnit != unit &&
              !(purchaseUnit == 'gallon' && unit == 'oz'))
            TextField(
              controller: contents,
              enabled: !busy && pending == null,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Usage units in one purchased container',
              ),
              onChanged: (_) => setState(() {}),
            ),
          if (!widget.configure)
            TextField(
              controller: count,
              enabled: !busy && pending == null,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Purchased quantity (containers)',
              ),
              onChanged: (_) => setState(() {}),
            ),
          TextField(
            controller: cost,
            enabled: !busy && pending == null,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Cost per purchased container',
            ),
            onChanged: (_) => setState(() {}),
          ),
          TextField(
            controller: markup,
            enabled: !busy && pending == null,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Optional separate-charge markup (%)',
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 16),
          Text(preview()),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: busy ? null : save,
            child: Text(
              pending == null ? 'Review and save' : 'Retry same save',
            ),
          ),
        ],
      ),
    ),
  );
}
