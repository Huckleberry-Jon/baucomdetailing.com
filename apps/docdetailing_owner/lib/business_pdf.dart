import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'money.dart';

Future<Uint8List> businessPdf(
  Map row,
  Map<String, dynamic> data, {
  List<Uint8List> photos = const [],
  bool receipt = false,
}) async {
  final regular = pw.Font.ttf(
    await rootBundle.load('assets/fonts/NotoSans-Regular.ttf'),
  );
  final bold = pw.Font.ttf(
    await rootBundle.load('assets/fonts/NotoSans-Bold.ttf'),
  );
  final doc = pw.Document(
    theme: pw.ThemeData.withFont(base: regular, bold: bold),
  );
  final paid = row['paid_cents'] as int? ?? 0,
      total = data['totalCents'] as int;
  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      maxPages: 100,
      build: (_) => [
        pw.Header(
          level: 0,
          child: pw.Text(data['businessName'] as String? ?? 'Business'),
        ),
        pw.Text(
          '${receipt ? 'Payment receipt' : row['kind']} ${row['number'] ?? 'DRAFT'}',
          style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold),
        ),
        pw.SizedBox(height: 12),
        pw.Text(
          '${data['customer']?['firstName'] ?? ''} ${data['customer']?['lastName'] ?? ''}',
        ),
        pw.Text(data['customer']?['address'] as String? ?? ''),
        pw.SizedBox(height: 16),
        if (!receipt)
          pw.TableHelper.fromTextArray(
            headers: ['Description', 'Quantity', 'Unit price', 'Total'],
            data: [
              for (final l in data['lines'] as List)
                [
                  l['description'],
                  '${(l['quantityMillis'] as int) / 1000} ${l['unit']}',
                  '\$${moneyInput(l['unitPriceCents'] as int)}',
                  '\$${moneyInput(l['totalCents'] as int)}',
                ],
            ],
          ),
        pw.SizedBox(height: 12),
        pw.Text('Subtotal: \$${moneyInput(data['subtotalCents'] as int)}'),
        pw.Text(
          'Discount: \$${moneyInput(data['discountCents'] as int? ?? 0)}',
        ),
        pw.Text('Tax: \$${moneyInput(data['taxCents'] as int)}'),
        pw.Text('Total: \$${moneyInput(total)}'),
        pw.Text('Payments received: \$${moneyInput(paid)}'),
        pw.Text('Balance: \$${moneyInput(total - paid)}'),
        if (receipt) ...[
          pw.SizedBox(height: 12),
          for (final p in row['payments'] as List? ?? [])
            pw.Text(
              '${DateTime.fromMillisecondsSinceEpoch(p['occurred_at'] as int, isUtc: true).toIso8601String()}  \$${moneyInput(p['amount_cents'] as int)}  Tip \$${moneyInput(p['tip_cents'] as int)}  Ref ${p['id']}',
            ),
        ],
        pw.SizedBox(height: 12),
        pw.Text(data['notes'] as String? ?? ''),
        if (Uri.tryParse(data['reviewUrl'] as String? ?? '') case final uri?
            when uri.scheme == 'https')
          pw.UrlLink(
            destination: uri.toString(),
            child: pw.Text(
              'Review your experience',
              style: const pw.TextStyle(
                color: PdfColors.blue,
                decoration: pw.TextDecoration.underline,
              ),
            ),
          ),
        for (final photo in photos)
          pw.Padding(
            padding: const pw.EdgeInsets.only(top: 12),
            child: pw.Image(
              pw.MemoryImage(photo),
              height: 220,
              fit: pw.BoxFit.contain,
            ),
          ),
      ],
    ),
  );
  return doc.save();
}
