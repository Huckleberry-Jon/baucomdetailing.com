import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/money.dart';

void main() {
  test(
    'entered amounts preserve exact cents without floating point rounding',
    () {
      expect(parseMoneyCents('0.29'), 29);
      expect(parseMoneyCents('1234.5'), 123450);
      expect(parseMoneyCents(moneyInput(10999)), 10999);
    },
  );
  test(
    'money input rejects precision loss, negatives and oversized amounts',
    () {
      for (final value in ['1.001', '-1', 'NaN', '1e3', '90071992547410']) {
        expect(() => parseMoneyCents(value), throwsFormatException);
      }
    },
  );
}
