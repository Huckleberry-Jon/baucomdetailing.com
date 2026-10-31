int completionTotal(
  Map? quote,
  int serviceCents,
  int discountCents,
  int taxBps,
) {
  final subtotal = quote?['subtotalCents'] as int? ?? serviceCents;
  final taxable = quote == null
      ? subtotal
      : (quote['lines'] as List)
            .where((l) => l['taxable'] == true)
            .fold<int>(0, (n, l) => n + (l['totalCents'] as int));
  if (subtotal < 0 ||
      discountCents < 0 ||
      discountCents > subtotal ||
      taxBps < 0 ||
      taxBps > 10000) {
    throw const FormatException(
      'Check the approved price, discount and tax rate.',
    );
  }
  final taxableDiscount = subtotal == 0
      ? 0
      : (discountCents * taxable + subtotal ~/ 2) ~/ subtotal;
  return subtotal -
      discountCents +
      ((taxable - taxableDiscount) * taxBps + 5000) ~/ 10000;
}
