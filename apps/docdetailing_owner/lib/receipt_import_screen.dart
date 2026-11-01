import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'owner_api.dart';
import 'business_forms.dart';
import 'money.dart';
import 'receipt_recognizer.dart';

class ReceiptImportScreen extends StatefulWidget {
  const ReceiptImportScreen({
    super.key,
    required this.api,
    this.pick,
    this.recognize,
  });
  final OwnerApi api;
  final Future<XFile?> Function(ImageSource)? pick;
  final Future<ReceiptDraft> Function(Uint8List)? recognize;
  @override
  State<ReceiptImportScreen> createState() => _ReceiptImportState();
}

class _ReceiptImportState extends State<ReceiptImportScreen> {
  Uint8List? photo;
  String vendor = '', reference = '', raw = '', error = '';
  final lines = <Map<String, dynamic>>[];
  List<Map> stock = [];
  bool busy = false;
  Map<String, dynamic>? pending;
  String key = 'receipt-${DateTime.now().microsecondsSinceEpoch}';
  @override
  void initState() {
    super.initState();
    loadStock();
  }

  Future<void> loadStock() async {
    try {
      final data = await widget.api.workspace('/api/owner/materials') as Map;
      if (mounted) {
        setState(() => stock = (data['records'] as List).cast<Map>());
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  Future<void> capture(ImageSource source) async {
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final file =
          await (widget.pick?.call(source) ??
              ImagePicker().pickImage(
                source: source,
                maxWidth: 2200,
                maxHeight: 2200,
                imageQuality: 85,
              ));
      if (file == null) return;
      final bytes = await file.readAsBytes();
      if (bytes.length > 4 * 1024 * 1024) {
        throw const FormatException('Use a receipt photo under 4 MB.');
      }
      ReceiptDraft? draft;
      try {
        draft =
            await (widget.recognize?.call(bytes) ??
                ReceiptRecognizer().extract(bytes));
      } catch (_) {
        error =
            'Text recognition is unavailable. Review the photo and add items manually.';
      }
      if (!mounted) return;
      setState(() {
        photo = bytes;
        vendor = draft?.vendor ?? '';
        raw = draft?.rawText ?? '';
        lines.clear();
        for (final item in draft?.items ?? <ReceiptItem>[]) {
          lines.add({
            'product': item.product,
            'quantityMillis': item.quantityMillis,
            'costCents': item.costCents,
            'unit': 'piece',
            'markupBps': 0,
            'taxable': false,
            'lowStockMillis': null,
          });
        }
      });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> editLine([int? index]) async {
    final d = index == null ? <String, dynamic>{} : lines[index];
    final f = await editFields(context, 'Review receipt item', {
      'Product': d['product'] as String? ?? '',
      'Quantity received': quantityInput(d['quantityMillis'] as int? ?? 1000),
      'Unit (oz/gallon/bottle/piece)': d['unit'] as String? ?? 'piece',
      'Cost per unit': moneyInput(
        d['purchaseCostCents'] as int? ?? d['costCents'] as int? ?? 0,
      ),
      'Purchase unit (gallon/oz/bottle/piece)':
          d['purchaseUnit'] as String? ?? d['unit'] as String? ?? 'piece',
      'Usage units per container (gallon to oz is 128)': quantityInput(
        d['purchaseSizeMillis'] as int? ?? 1000,
      ),
      'Markup percent': moneyInput(d['markupBps'] as int? ?? 0),
    });
    if (f == null) return;
    try {
      final value = <String, dynamic>{
        ...d,
        'product': f['Product']!.trim(),
        'quantityMillis': quantityMillis(f['Quantity received']!),
        'unit': f['Unit (oz/gallon/bottle/piece)']!.trim(),
        'costCents': parseMoneyCents(f['Cost per unit']!),
        'markupBps': parseMoneyCents(f['Markup percent']!),
        'purchaseUnit': f['Purchase unit (gallon/oz/bottle/piece)']!.trim(),
        'purchaseSizeMillis':
            f['Purchase unit (gallon/oz/bottle/piece)']!.trim() == 'gallon' &&
                f['Unit (oz/gallon/bottle/piece)']!.trim() == 'oz'
            ? 128000
            : quantityMillis(
                f['Usage units per container (gallon to oz is 128)']!,
              ),
        'purchaseCostCents': parseMoneyCents(f['Cost per unit']!),
        'taxable': d['taxable'] ?? false,
      };
      if (value['product'] == '' ||
          value['quantityMillis'] <= 0 ||
          !['oz', 'gallon', 'bottle', 'piece'].contains(value['unit'])) {
        throw const FormatException(
          'Enter a product, positive quantity and valid unit.',
        );
      }
      setState(() {
        if (index == null) {
          lines.add(value);
        } else {
          lines[index] = value;
        }
        error = '';
      });
    } catch (e) {
      setState(() => error = e.toString());
    }
  }

  Future<void> apply() async {
    if (pending == null) {
      if (photo == null || lines.isEmpty || vendor.trim().isEmpty) {
        setState(
          () => error =
              'Add a receipt photo, vendor and at least one reviewed item.',
        );
        return;
      }
      if (lines.any((l) => (l['quantityMillis'] as int) <= 0)) {
        setState(
          () => error =
              'Review the quantity in the selected stock unit before applying.',
        );
        return;
      }
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Apply receipt to inventory?'),
          content: Text(
            'Add ${lines.length} reviewed item(s) to stock. Confirm quantities and units against the receipt. This records inventory only; it does not charge a card or record a financial expense.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('Keep reviewing'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(c, true),
              child: const Text('Apply to inventory'),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
      pending = {
        'reviewed': true,
        'vendor': vendor.trim(),
        'reference': reference.trim(),
        'photo': {'name': 'receipt.jpg', 'base64': base64Encode(photo!)},
        'lines': lines.map((l) => Map<String, dynamic>.from(l)).toList(),
      };
    }
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await widget.api.workspace(
        '/api/owner/inventory-receipts',
        method: 'POST',
        body: pending,
        key: key,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(
          () => error =
              '$e\nRetry uses the same receipt key to avoid duplicate stock.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> editVendor() async {
    final f = await editFields(context, 'Receipt details', {
      'Vendor': vendor,
      'Receipt number (optional)': reference,
    });
    if (f != null) {
      setState(() {
        vendor = f['Vendor']!;
        reference = f['Receipt number (optional)']!;
      });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Receipt to inventory')),
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
            'Photograph a receipt, review extracted items, then apply. Check every quantity, price and stock unit. A bottle is not automatically converted to ounces.',
          ),
          Wrap(
            spacing: 12,
            children: [
              OutlinedButton.icon(
                onPressed: busy || pending != null
                    ? null
                    : () => capture(ImageSource.camera),
                icon: const Icon(Icons.camera_alt),
                label: const Text('Take receipt photo'),
              ),
              OutlinedButton.icon(
                onPressed: busy || pending != null
                    ? null
                    : () => capture(ImageSource.gallery),
                icon: const Icon(Icons.photo_library),
                label: const Text('Choose receipt photo'),
              ),
            ],
          ),
          if (photo != null)
            Image.memory(photo!, height: 180, fit: BoxFit.contain),
          ListTile(
            title: Text(vendor.isEmpty ? 'Set receipt vendor' : vendor),
            subtitle: Text(reference),
            trailing: const Icon(Icons.edit),
            onTap: busy || pending != null ? null : editVendor,
          ),
          if (raw.isNotEmpty)
            ExpansionTile(
              title: const Text('Recognized text'),
              children: [SelectableText(raw)],
            ),
          const Text(
            'Match existing products explicitly to add to their stock. Choose New product for a separate stock item.',
          ),
          for (var i = 0; i < lines.length; i++)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(receiptLineLabel(lines[i])),
                    DropdownButtonFormField<String>(
                      initialValue: lines[i]['materialId'] as String? ?? '',
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Add stock to',
                      ),
                      items: [
                        const DropdownMenuItem(
                          value: '',
                          child: Text('New product'),
                        ),
                        for (final row in stock)
                          DropdownMenuItem(
                            value: row['id'] as String,
                            child: Text(
                              '${(row['data'] is String ? jsonDecode(row['data']) : row['data'])['product']}',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                      onChanged: busy || pending != null
                          ? null
                          : (id) {
                              setState(() {
                                final line = lines[i];
                                if (id == null || id.isEmpty) {
                                  line.remove('materialId');
                                  line.remove('materialVersion');
                                  line.remove('stockVersion');
                                } else {
                                  final r = stock.firstWhere(
                                        (r) => r['id'] == id,
                                      ),
                                      d = r['data'] is String
                                          ? jsonDecode(r['data'])
                                          : r['data'];
                                  if (line['unit'] != d['unit']) {
                                    line['quantityMillis'] = 0;
                                    error =
                                        'Units differ. Review and enter the quantity in the existing stock unit.';
                                  }
                                  line.addAll({
                                    'materialId': id,
                                    'materialVersion': r['version'],
                                    'stockVersion': r['stock_version'] ?? 0,
                                    'product': d['product'],
                                    'unit': d['unit'],
                                  });
                                }
                              });
                            },
                    ),
                    Wrap(
                      children: [
                        TextButton(
                          onPressed: busy || pending != null
                              ? null
                              : () => editLine(i),
                          child: const Text('Review / edit'),
                        ),
                        TextButton(
                          onPressed: busy || pending != null
                              ? null
                              : () => setState(() => lines.removeAt(i)),
                          child: const Text('Remove'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          TextButton(
            onPressed: busy || pending != null ? null : () => editLine(),
            child: const Text('Add item manually'),
          ),
          FilledButton(
            onPressed: busy ? null : apply,
            child: Text(
              pending == null ? 'Apply reviewed items' : 'Retry same receipt',
            ),
          ),
          if (pending != null)
            TextButton(
              onPressed: busy
                  ? null
                  : () async {
                      await loadStock();
                      if (mounted) {
                        setState(() {
                          pending = null;
                          key =
                              'receipt-${DateTime.now().microsecondsSinceEpoch}';
                          for (final l in lines) {
                            final matches = stock.where(
                              (r) => r['id'] == l['materialId'],
                            );
                            if (matches.isNotEmpty) {
                              l['materialVersion'] = matches.first['version'];
                              l['stockVersion'] =
                                  matches.first['stock_version'] ?? 0;
                            }
                          }
                        });
                      }
                    },
              child: const Text('Reload stock and review again'),
            ),
        ],
      ),
    ),
  );
}

String receiptLineLabel(Map l) {
  final purchase = l['purchaseCostCents'] != null,
      count = l['quantityMillis'] as int,
      size = l['purchaseSizeMillis'] as int? ?? 1000;
  final sourceUnit = purchase ? l['purchaseUnit'] : l['unit'];
  return '${l['product']} · ${quantityInput(count)} $sourceUnit${purchase ? ' → ${quantityInput(count * size ~/ 1000)} ${l['unit']}' : ''} · USD ${moneyInput((l['purchaseCostCents'] ?? l['costCents']) as int)}/$sourceUnit';
}
