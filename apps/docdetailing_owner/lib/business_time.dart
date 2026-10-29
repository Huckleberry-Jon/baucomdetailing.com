import 'package:timezone/data/latest.dart' as data;
import 'package:timezone/timezone.dart' as tz;

class BusinessTime {
  BusinessTime(this.zone) {
    if (!_initialized) {
      data.initializeTimeZones();
      _initialized = true;
    }
    location = ['UTC', 'Etc/UTC', 'GMT'].contains(zone)
        ? tz.UTC
        : tz.getLocation(zone);
  }
  final String zone;
  static bool _initialized = false;
  late final tz.Location location;
  DateTime day(DateTime instant) {
    final d = tz.TZDateTime.from(instant, location);
    return DateTime.utc(d.year, d.month, d.day);
  }

  String dateKey(DateTime day) =>
      '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
  String label(Object? instant) {
    if (instant == null) return 'Not set';
    final utc = instant is int
        ? DateTime.fromMillisecondsSinceEpoch(instant, isUtc: true)
        : DateTime.parse(instant.toString());
    final d = tz.TZDateTime.from(utc, location);
    return '${dateKey(d)} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')} ${d.timeZoneName}';
  }

  DateTime startOfDay(DateTime day) =>
      tz.TZDateTime(location, day.year, day.month, day.day).toUtc();
  List<DateTime> wallInstants(DateTime day, int hour, int minute) {
    final center = tz.TZDateTime(
      location,
      day.year,
      day.month,
      day.day,
      hour,
      minute,
    ).toUtc();
    final result = <DateTime>[];
    for (var delta = -180; delta <= 180; delta += 15) {
      final instant = center.add(Duration(minutes: delta)),
          wall = tz.TZDateTime.from(instant, location);
      if (wall.year == day.year &&
          wall.month == day.month &&
          wall.day == day.day &&
          wall.hour == hour &&
          wall.minute == minute) {
        result.add(instant);
      }
    }
    return result;
  }
}

enum CalendarView { day, week, month }

({DateTime from, DateTime to}) calendarRange(
  DateTime selected,
  CalendarView view,
) {
  final d = DateTime.utc(selected.year, selected.month, selected.day);
  if (view == CalendarView.day) return (from: d, to: d);
  if (view == CalendarView.week) {
    final from = d.subtract(Duration(days: d.weekday - 1));
    return (from: from, to: from.add(const Duration(days: 6)));
  }
  final first = DateTime.utc(d.year, d.month, 1),
      from = first.subtract(Duration(days: first.weekday - 1));
  return (from: from, to: from.add(const Duration(days: 41)));
}
