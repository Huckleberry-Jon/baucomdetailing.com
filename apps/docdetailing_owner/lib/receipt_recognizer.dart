import 'package:flutter/services.dart';
import 'money.dart';

class ReceiptItem {
  ReceiptItem({
    required this.product,
    required this.costCents,
    this.quantityMillis = 1000,
  });
  String product;
  int costCents, quantityMillis;
}

class ReceiptDraft {
  ReceiptDraft(this.vendor, this.items, this.rawText);
  final String vendor, rawText;
  final List<ReceiptItem> items;
}

ReceiptDraft parseReceipt(String text) {
  final lines = text
      .split(RegExp(r'[\r\n]+'))
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .toList();
  final items = <ReceiptItem>[];
  final exclude = RegExp(
    r'\b(subtotal|sub total|total|tax|change|tender|cash|visa|mastercard|debit|credit|balance|discount|savings|coupon|payment|amount due|tel|phone|date|time|receipt|transaction|approval|auth|store|terminal|thank)\b',
    caseSensitive: false,
  );
  final priced = RegExp(r'^(.+?)\s+\$?(\d{1,6}\.\d{2})\s*[A-Za-z]?$');
  for (final line in lines) {
    if (exclude.hasMatch(line)) continue;
    final match = priced.firstMatch(line);
    if (match == null) continue;
    var product = match[1]!.trim();
    if (!RegExp(r'[A-Za-z]').hasMatch(product)) continue;
    var quantity = 1000;
    final qty = RegExp(r'^(\d{1,3})\s*[xX]\s+(.+)$').firstMatch(product);
    if (qty != null) {
      quantity = int.parse(qty[1]!) * 1000;
      product = qty[2]!;
    }
    if (quantity <= 0) continue;
    final total = parseMoneyCents(match[2]!);
    items.add(
      ReceiptItem(
        product: product,
        costCents: (total * 1000 / quantity).round(),
        quantityMillis: quantity,
      ),
    );
  }
  return ReceiptDraft(lines.isEmpty ? '' : lines.first, items, text);
}

class ReceiptRecognizer {
  static const channel = MethodChannel(
    'com.docincorporated.docdetailing/receipts',
  );
  Future<ReceiptDraft> extract(Uint8List bytes) async {
    final text =
        await channel.invokeMethod<String>('recognize', {'bytes': bytes}) ?? '';
    return parseReceipt(text);
  }
}
