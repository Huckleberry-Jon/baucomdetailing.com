import 'package:flutter/services.dart';
import 'money.dart';

Map<String, Object> invoiceMessage(
  Map row,
  Map data,
  Uint8List pdf, {
  required bool email,
}) {
  if (row['status'] != 'issued') {
    throw const FormatException(
      'Issue the invoice or estimate before sending it.',
    );
  }
  final customer = data['customer'] as Map? ?? {};
  final recipient = email
      ? (customer['email'] as String? ?? '').trim()
      : (customer['phone'] as String? ?? '').replaceAll(RegExp(r'[^0-9+]'), '');
  if (email
      ? !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(recipient)
      : !RegExp(r'^\+?\d{7,15}$').hasMatch(recipient)) {
    throw FormatException(
      'Add a valid customer ${email ? 'email address' : 'phone number'} first.',
    );
  }
  final kind = row['kind'] == 'estimate' ? 'Estimate' : 'Invoice',
      number = row['number'] as String? ?? '';
  final business = data['businessName'] as String? ?? 'Your detailing business';
  final total = data['totalCents'] as int,
      paid = row['paid_cents'] as int? ?? 0;
  return {
    'recipient': recipient,
    'subject': '$business - $kind $number',
    'body':
        '$kind $number from $business\nTotal: \$${moneyInput(total)}${kind == 'Invoice' ? '\nBalance: \$${moneyInput(total - paid)}' : '\nThis is an estimate, not a bill.'}\nPlease see the attached PDF.',
    'filename':
        'docdetailing-${number.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_')}.pdf',
    'pdf': pdf,
  };
}

class InvoiceComposer {
  static const channel = MethodChannel(
    'com.docincorporated.docdetailing/documents',
  );
  Future<String> compose(
    Map row,
    Map data,
    Uint8List pdf, {
    required bool email,
  }) async {
    final result = await channel.invokeMethod<String>(
      email ? 'composeEmail' : 'composeText',
      invoiceMessage(row, data, pdf, email: email),
    );
    return result ?? 'unavailable';
  }
}
