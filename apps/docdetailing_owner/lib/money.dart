int parseMoneyCents(String input) {
  final value = input.trim();
  if (!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(value)) {
    throw const FormatException(
      'Enter an amount with up to two decimal places.',
    );
  }
  final parts = value.split('.');
  final cents =
      int.parse(parts.first) * 100 +
      (parts.length == 2 ? int.parse(parts[1].padRight(2, '0')) : 0);
  if (cents > 9007199254740991) {
    throw const FormatException('Amount is too large.');
  }
  return cents;
}

String moneyInput(int cents) =>
    '${cents ~/ 100}.${(cents % 100).toString().padLeft(2, '0')}';
