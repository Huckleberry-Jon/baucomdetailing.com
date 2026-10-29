import 'package:flutter_test/flutter_test.dart';
import 'package:docdetailing_owner/business_time.dart';

void main() {
  test('business dates are independent of the phone timezone', () {
    final clock = BusinessTime('Pacific/Auckland');
    expect(
      clock.dateKey(clock.day(DateTime.parse('2026-10-29T23:00:00Z'))),
      '2026-10-30',
    );
  });
  test(
    'DST skipped times are rejected and repeated times have both explicit instants',
    () {
      final clock = BusinessTime('America/New_York');
      expect(clock.wallInstants(DateTime.utc(2026, 3, 8), 2, 30), isEmpty);
      expect(clock.wallInstants(DateTime.utc(2026, 11, 1), 1, 30), [
        DateTime.parse('2026-11-01T05:30:00Z'),
        DateTime.parse('2026-11-01T06:30:00Z'),
      ]);
    },
  );
  test('business day boundaries retain 23-hour and 25-hour DST days', () {
    final clock = BusinessTime('America/New_York');
    expect(
      clock
          .startOfDay(DateTime.utc(2026, 3, 9))
          .difference(clock.startOfDay(DateTime.utc(2026, 3, 8)))
          .inHours,
      23,
    );
    expect(
      clock
          .startOfDay(DateTime.utc(2026, 11, 2))
          .difference(clock.startOfDay(DateTime.utc(2026, 11, 1)))
          .inHours,
      25,
    );
  });
  test('day week and month requests stay within server calendar range', () {
    final day = DateTime.utc(2028, 2, 29);
    final d = calendarRange(day, CalendarView.day),
        w = calendarRange(day, CalendarView.week),
        m = calendarRange(day, CalendarView.month);
    expect(d.from, d.to);
    expect(w.from.weekday, DateTime.monday);
    expect(w.to.difference(w.from).inDays, 6);
    expect(m.from.weekday, DateTime.monday);
    expect(m.to.difference(m.from).inDays, 41);
    expect(m.from.isBefore(day), true);
    expect(m.to.isAfter(day), true);
  });
}
