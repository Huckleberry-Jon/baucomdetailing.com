import 'money.dart';

int invoiceLineTotal(Map line) {
  final quantity = BigInt.from(line['quantityMillis'] as int);
  if (line['costBasisCents'] != null) {
    final denominator =
            BigInt.from(line['costBasisQuantityMillis'] as int) *
            BigInt.from(10000),
        numerator =
            quantity *
            BigInt.from(line['costBasisCents'] as int) *
            BigInt.from(10000 + (line['markupBps'] as int));
    return ((numerator + denominator ~/ BigInt.two) ~/ denominator).toInt();
  }
  return ((quantity * BigInt.from(line['unitPriceCents'] as int) +
              BigInt.from(500)) ~/
          BigInt.from(1000))
      .toInt();
}

String invoiceUnitPrice(Map line) => line['costBasisCents'] == null
    ? moneyInput(line['unitPriceCents'] as int)
    : ((line['costBasisCents'] as num) *
              1000 /
              (line['costBasisQuantityMillis'] as num) *
              (1 + (line['markupBps'] as num) / 10000) /
              100)
          .toStringAsFixed(4);
