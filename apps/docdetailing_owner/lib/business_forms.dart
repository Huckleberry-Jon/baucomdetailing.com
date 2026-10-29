import 'package:flutter/material.dart';
import 'money.dart';

int quantityMillis(String input) {
  final v = input.trim();
  if (!RegExp(r'^\d+(\.\d{1,3})?$').hasMatch(v)) {
    throw const FormatException(
      'Use a nonnegative quantity with up to three decimal places.',
    );
  }
  final p = v.split('.');
  return int.parse(p[0]) * 1000 +
      (p.length == 2 ? int.parse(p[1].padRight(3, '0')) : 0);
}

String quantityInput(int n) =>
    '${n ~/ 1000}.${(n % 1000).toString().padLeft(3, '0')}';
Future<Map<String, String>?> editFields(
  BuildContext context,
  String title,
  Map<String, String> fields,
) async {
  final controls = fields.map(
    (k, v) => MapEntry(k, TextEditingController(text: v)),
  );
  final route = DialogRoute<Map<String, String>>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final e in controls.entries)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextField(
                  controller: e.value,
                  decoration: InputDecoration(labelText: e.key),
                ),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(c),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () =>
              Navigator.pop(c, controls.map((k, v) => MapEntry(k, v.text))),
          child: const Text('Save'),
        ),
      ],
    ),
  );
  final value = await Navigator.of(context).push(route);
  await route.completed;
  for (final c in controls.values) {
    c.dispose();
  }
  return value;
}

Future<Map?> chooseRow(
  BuildContext context,
  String title,
  List rows,
  String Function(Map) label,
) => showDialog<Map>(
  context: context,
  builder: (c) => SimpleDialog(
    title: Text(title),
    children: [
      if (rows.isEmpty)
        const Padding(
          padding: EdgeInsets.all(16),
          child: Text('No records available.'),
        ),
      for (final row in rows)
        SimpleDialogOption(
          onPressed: () => Navigator.pop(c, row),
          child: Text(label(row as Map)),
        ),
    ],
  ),
);
Future<Map<String, dynamic>?> editCharge(
  BuildContext context, {
  Map? line,
}) async {
  final f = await editFields(context, 'Service or approved charge', {
    'Description': line?['description'] as String? ?? '',
    'Quantity': quantityInput(line?['quantityMillis'] as int? ?? 1000),
    'Unit (service/each/hour/oz/gallon/bottle/piece)':
        line?['unit'] as String? ?? 'service',
    'Unit price': moneyInput(line?['unitPriceCents'] as int? ?? 0),
    'Estimated unit cost': moneyInput(line?['unitCostCents'] as int? ?? 0),
    'Taxable (yes/no)': line?['taxable'] == true ? 'yes' : 'no',
  });
  if (f == null) return null;
  return {
    'description': f['Description'],
    'quantityMillis': quantityMillis(f['Quantity']!),
    'unit': f['Unit (service/each/hour/oz/gallon/bottle/piece)'],
    'unitPriceCents': parseMoneyCents(f['Unit price']!),
    'unitCostCents': parseMoneyCents(f['Estimated unit cost']!),
    'taxable': f['Taxable (yes/no)'] == 'yes',
  };
}
