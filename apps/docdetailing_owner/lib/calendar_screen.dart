import 'package:flutter/material.dart';
import 'owner_api.dart';
import 'business_time.dart';
import 'booking_details.dart';

class OwnerCalendar extends StatefulWidget {
  const OwnerCalendar({super.key, required this.api});
  final OwnerApi api;
  @override
  State<OwnerCalendar> createState() => _OwnerCalendarState();
}

class _OwnerCalendarState extends State<OwnerCalendar> {
  DateTime selected = DateTime.now();
  CalendarView view = CalendarView.month;
  Map<String, dynamic> settings = {};
  BusinessTime? clock;
  List<Map<String, dynamic>> bookings = [], blocks = [];
  bool busy = true;
  String? error;
  int generation = 0;
  @override
  void initState() {
    super.initState();
    load(initial: true);
  }

  Future<void> load({bool initial = false}) async {
    final request = ++generation;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (clock == null) {
        final dashboard =
            await widget.api.workspace('/api/owner/dashboard') as Map;
        settings = Map<String, dynamic>.from(dashboard['settings'] as Map);
        clock = BusinessTime(settings['timezone'] as String);
        if (initial) selected = clock!.day(DateTime.now());
      }
      final range = calendarRange(selected, view), time = clock!;
      final value =
          await widget.api.workspace(
                '/api/owner/calendar?${Uri(queryParameters: {'from': time.dateKey(range.from), 'to': time.dateKey(range.to)}).query}',
              )
              as Map;
      if (mounted && request == generation) {
        setState(() {
          settings = Map<String, dynamic>.from(value['settings'] as Map);
          clock = BusinessTime(settings['timezone'] as String);
          bookings = (value['bookings'] as List)
              .map((x) => Map<String, dynamic>.from(x as Map))
              .toList();
          blocks = (value['blocks'] as List)
              .map((x) => Map<String, dynamic>.from(x as Map))
              .toList();
        });
      }
    } catch (e) {
      if (mounted && request == generation) {
        setState(() => error = e.toString());
      }
    } finally {
      if (mounted && request == generation) setState(() => busy = false);
    }
  }

  bool onDay(Map row, DateTime day) {
    final time = clock!, key = time.dateKey(day);
    return time.dateKey(
              time.day(
                DateTime.fromMillisecondsSinceEpoch(
                  row['start_ms'] as int,
                  isUtc: true,
                ),
              ),
            ) ==
            key ||
        (row['proposal'] is Map &&
            time.dateKey(
                  time.day(
                    DateTime.fromMillisecondsSinceEpoch(
                      row['proposal']['startAt'] as int,
                      isUtc: true,
                    ),
                  ),
                ) ==
                key);
  }

  Future<void> selectDate() async {
    final d = await showDatePicker(
      context: context,
      initialDate: selected,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (d != null) {
      setState(() => selected = DateTime.utc(d.year, d.month, d.day));
      await load();
    }
  }

  void move(int step) {
    setState(() {
      selected = view == CalendarView.month
          ? DateTime.utc(selected.year, selected.month + step, 1)
          : selected.add(
              Duration(days: step * (view == CalendarView.week ? 7 : 1)),
            );
    });
    load();
  }

  Future<void> blockTime() async {
    if (clock == null) return;
    final start = await pickBusinessInstant(
      context,
      clock!,
      selected,
      label: 'Block begins',
    );
    if (!mounted || start == null) return;
    final end = await pickBusinessInstant(
      context,
      clock!,
      clock!.day(start),
      label: 'Block ends',
    );
    if (!mounted || end == null) return;
    final text = TextEditingController();
    final route = DialogRoute<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Block unavailable time'),
        content: TextField(
          controller: text,
          decoration: const InputDecoration(labelText: 'Reason'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, text.text.trim()),
            child: const Text('Block time'),
          ),
        ],
      ),
    );
    final label = await Navigator.of(context).push(route);
    await route.completed;
    text.dispose();
    if (label == null) return;
    await write('/api/owner/block', {
      'startAt': start.toIso8601String(),
      'endAt': end.toIso8601String(),
      'label': label,
    });
  }

  Future<void> write(
    String path,
    Map<String, dynamic> body, {
    String method = 'POST',
  }) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.workspace(path, method: method, body: body);
      await load();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> hours() async {
    try {
      final current = await widget.api.workspace('/api/owner/dashboard') as Map;
      if (!mounted) return;
      final fresh = Map<String, dynamic>.from(current['settings'] as Map);
      final days = Set<String>.from(fresh['workingDays'] as List),
          all = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      var open = fresh['openMinute'] as int,
          close = fresh['closeMinute'] as int;
      final accept = await showDialog<bool>(
        context: context,
        builder: (c) => StatefulBuilder(
          builder: (c, update) => AlertDialog(
            title: const Text('Business hours'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Time zone: ${fresh['timezone']}'),
                  Wrap(
                    children: [
                      for (final d in all)
                        FilterChip(
                          label: Text(d),
                          selected: days.contains(d),
                          onSelected: (v) => update(() {
                            v ? days.add(d) : days.remove(d);
                          }),
                        ),
                    ],
                  ),
                  TextButton(
                    onPressed: () async {
                      final t = await showTimePicker(
                        context: c,
                        initialTime: TimeOfDay(
                          hour: open ~/ 60,
                          minute: open % 60,
                        ),
                      );
                      if (t != null) {
                        update(() => open = t.hour * 60 + t.minute);
                      }
                    },
                    child: Text(
                      'Opens ${(open ~/ 60).toString().padLeft(2, '0')}:${(open % 60).toString().padLeft(2, '0')}',
                    ),
                  ),
                  TextButton(
                    onPressed: () async {
                      final t = await showTimePicker(
                        context: c,
                        initialTime: TimeOfDay(
                          hour: (close % 1440) ~/ 60,
                          minute: close % 60,
                        ),
                      );
                      if (t != null) {
                        update(
                          () => close = t.hour == 0 && t.minute == 0
                              ? 1440
                              : t.hour * 60 + t.minute,
                        );
                      }
                    },
                    child: Text(
                      'Closes ${(close ~/ 60).toString().padLeft(2, '0')}:${(close % 60).toString().padLeft(2, '0')}',
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(c, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(c, true),
                child: const Text('Save hours'),
              ),
            ],
          ),
        ),
      );
      if (accept == true) {
        await write('/api/owner/schedule-settings', {
          'workingDays': all.where(days.contains).toList(),
          'openMinute': open,
          'closeMinute': close,
        }, method: 'PUT');
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final range = calendarRange(selected, view), time = clock;
    final rows =
        bookings.where((b) => time != null && onDay(b, selected)).toList()
          ..sort(
            (a, b) => (a['start_ms'] as int).compareTo(b['start_ms'] as int),
          );
    return Scaffold(
      appBar: AppBar(
        title: const Text('Calendar'),
        actions: [
          IconButton(
            tooltip: 'Refresh calendar',
            onPressed: busy ? null : load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            if (busy) const LinearProgressIndicator(),
            if (error != null)
              Text(
                error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            if (time != null) Text('All appointments use ${time.zone}'),
            Wrap(
              spacing: 8,
              children: [
                for (final v in CalendarView.values)
                  ChoiceChip(
                    label: Text(v.name[0].toUpperCase() + v.name.substring(1)),
                    selected: view == v,
                    onSelected: busy
                        ? null
                        : (_) {
                            setState(() => view = v);
                            load();
                          },
                  ),
              ],
            ),
            Row(
              children: [
                IconButton(
                  tooltip: 'Previous period',
                  onPressed: busy ? null : () => move(-1),
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: TextButton(
                    onPressed: busy ? null : selectDate,
                    child: Text(time?.dateKey(selected) ?? 'Loading calendar'),
                  ),
                ),
                IconButton(
                  tooltip: 'Next period',
                  onPressed: busy ? null : () => move(1),
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
            Wrap(
              spacing: 8,
              children: [
                OutlinedButton(
                  onPressed: busy || time == null
                      ? null
                      : () {
                          setState(() => selected = clock!.day(DateTime.now()));
                          load();
                        },
                  child: const Text('Today'),
                ),
                OutlinedButton(
                  onPressed: busy || widget.api.isDemo ? null : blockTime,
                  child: const Text('Block time'),
                ),
                OutlinedButton(
                  onPressed: busy || widget.api.isDemo ? null : hours,
                  child: const Text('Business hours'),
                ),
              ],
            ),
            if (time != null && view != CalendarView.day) ...[
              Row(
                children: [
                  for (final d in ['M', 'T', 'W', 'T', 'F', 'S', 'S'])
                    Expanded(child: Center(child: Text(d))),
                ],
              ),
              GridView.count(
                crossAxisCount: 7,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                childAspectRatio: .86,
                children: [
                  for (
                    var i = 0;
                    i < (view == CalendarView.month ? 42 : 7);
                    i++
                  )
                    Builder(
                      builder: (c) {
                        final d = range.from.add(Duration(days: i)),
                            count = bookings.where((b) => onDay(b, d)).length;
                        return Semantics(
                          label: '${time.dateKey(d)}, $count appointments',
                          button: true,
                          child: InkWell(
                            onTap: busy
                                ? null
                                : () {
                                    final changedMonth =
                                        d.month != selected.month;
                                    setState(() => selected = d);
                                    if (view == CalendarView.month &&
                                        changedMonth) {
                                      load();
                                    }
                                  },
                            child: Container(
                              margin: const EdgeInsets.all(1),
                              decoration: BoxDecoration(
                                color: time.dateKey(d) == time.dateKey(selected)
                                    ? Theme.of(c).colorScheme.primaryContainer
                                    : null,
                                border: Border.all(
                                  color: Theme.of(c).colorScheme.outlineVariant,
                                ),
                              ),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text('${d.day}'),
                                  if (count > 0)
                                    Text(
                                      '$count jobs',
                                      style: const TextStyle(fontSize: 10),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                ],
              ),
            ],
            const SizedBox(height: 12),
            if (time != null)
              Text(
                'Appointments · ${time.dateKey(selected)}',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            if (!busy && rows.isEmpty)
              const Text('No appointments on this day.'),
            for (final b in rows)
              Card(
                child: ListTile(
                  isThreeLine: true,
                  title: Text(
                    '${b['customer']['firstName']} ${b['customer']['lastName']}',
                  ),
                  subtitle: Text(
                    '${time!.label(b['start_ms'])}\n${statusLabel(b['status'] as String)} · ${b['snapshot']['package']['name']}',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () async {
                    await Navigator.push(
                      context,
                      MaterialPageRoute<void>(
                        builder: (_) => BookingDetails(
                          api: widget.api,
                          bookingId: b['id'] as String,
                          clock: time,
                        ),
                      ),
                    );
                    await load();
                  },
                ),
              ),
            for (final b in blocks.where(
              (b) =>
                  time != null &&
                  (b['start_ms'] as int) <
                      time
                          .startOfDay(selected.add(const Duration(days: 1)))
                          .millisecondsSinceEpoch &&
                  (b['end_ms'] as int) >
                      time.startOfDay(selected).millisecondsSinceEpoch,
            ))
              Card(
                child: ListTile(
                  title: Text('Blocked: ${b['label']}'),
                  subtitle: Text(
                    '${time!.label(b['start_ms'])} – ${time.label(b['end_ms'])}',
                  ),
                  trailing: IconButton(
                    tooltip: 'Remove block',
                    icon: const Icon(Icons.delete_outline),
                    onPressed: busy
                        ? null
                        : () => write('/api/owner/block', {
                            'id': b['id'],
                          }, method: 'DELETE'),
                  ),
                ),
              ),
            if (time != null &&
                (settings['closedDates'] as List? ?? []).contains(
                  time.dateKey(selected),
                ))
              const Text('Business closed on this date.'),
          ],
        ),
      ),
    );
  }
}
