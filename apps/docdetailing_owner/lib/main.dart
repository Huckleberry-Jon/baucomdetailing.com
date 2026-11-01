import 'service_shortcuts.dart';
import 'service_supplies_screen.dart';
import 'business_settings_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'owner_api.dart';
import 'workspace.dart';
import 'calendar_screen.dart';
import 'native_notifications.dart';
import 'notification_inbox.dart';
import 'session_store.dart';
import 'booking_details.dart';
import 'business_time.dart';
import 'jobs_screen.dart';
import 'home_dashboard.dart';
import 'booking_list_screen.dart';
import 'schedule_appointment.dart';
import 'website_link.dart';

void main() {
  const demo = bool.fromEnvironment('DEMO_MODE', defaultValue: true);
  const apiOrigin = String.fromEnvironment('API_ORIGIN');
  runApp(
    OwnerApp(api: demo ? DemoOwnerApi() : HttpOwnerApi(Uri.parse(apiOrigin))),
  );
}

class OwnerApp extends StatelessWidget {
  const OwnerApp({super.key, required this.api});
  final OwnerApi api;
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'DocDetailing — development',
    theme: ThemeData(
      colorScheme:
          ColorScheme.fromSeed(
            seedColor: const Color(0xffd4ad60),
            brightness: Brightness.dark,
          ).copyWith(
            primary: const Color(0xffe4bf73),
            onPrimary: const Color(0xff211907),
            surface: const Color(0xff191711),
            onSurface: const Color(0xfff5eddc),
          ),
      scaffoldBackgroundColor: const Color(0xff100f0c),
      inputDecorationTheme: const InputDecorationTheme(
        filled: true,
        border: OutlineInputBorder(),
      ),
      useMaterial3: true,
    ),
    home: OwnerHome(api: api),
  );
}

class OwnerHome extends StatefulWidget {
  const OwnerHome({super.key, required this.api});
  final OwnerApi api;
  @override
  State<OwnerHome> createState() => _OwnerHomeState();
}

class _OwnerHomeState extends State<OwnerHome> with WidgetsBindingObserver {
  final email = TextEditingController(),
      password = TextEditingController(),
      previewCode = TextEditingController();
  bool signedIn = false, busy = false;
  String? error;
  List<Booking> rows = [];
  NativeNotifications? notifications;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final api = widget.api;
    if (api is HttpOwnerApi) {
      notifications = NativeNotifications(
        api,
        KeychainSessionStore(),
        IPhoneNotifications(),
        "${api.origin.origin}/notification-device",
        (id) async {
          final dashboard = await api.workspace('/api/owner/dashboard') as Map;
          final clock = BusinessTime(
            (dashboard['settings'] as Map)['timezone'] as String,
          );
          if (!mounted || !signedIn) return;
          await Navigator.push<void>(
            context,
            MaterialPageRoute(
              builder: (_) =>
                  BookingDetails(api: api, bookingId: id, clock: clock),
            ),
          );
        },
      );
    }
    if (api is SessionOwnerApi) {
      final sessionApi = api as SessionOwnerApi;
      sessionApi.authChanges.addListener(sessionInvalidated);
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => act(() async {
          if (await sessionApi.restoreSession()) await refresh();
        }),
      );
    }
  }

  void sessionInvalidated() {
    notifications?.locked();
    if (!mounted) return;
    PaintingBinding.instance.imageCache.clear();
    PaintingBinding.instance.imageCache.clearLiveImages();
    Navigator.of(context).popUntil((route) => route.isFirst);
    setState(() {
      signedIn = false;
      rows = [];
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && signedIn && !busy) {
      act(refresh);
    }
  }

  Future<void> confirmSignOut({bool all = false}) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(all ? 'Sign out all devices?' : 'Sign out?'),
        content: Text(
          all
              ? 'Are you sure you want to sign out on all devices? You and any other devices using this owner account will need to sign in again.'
              : 'Are you sure you want to sign out?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(all ? 'Sign out all devices' : 'Sign out'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted && signedIn && !busy) {
      await act(() => signOut(all: all));
    }
  }

  Future<void> signOut({bool all = false}) async {
    notifications?.locked();
    try {
      if (all && widget.api is SessionOwnerApi) {
        await (widget.api as SessionOwnerApi).revokeAllSessions();
      } else {
        await widget.api.logout();
      }
    } finally {
      PaintingBinding.instance.imageCache.clear();
      PaintingBinding.instance.imageCache.clearLiveImages();
      if (mounted) {
        setState(() {
          signedIn = false;
          rows = [];
          password.clear();
        });
      }
    }
  }

  Future<void> act(Future<void> Function() work) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await work();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> refresh() async {
    final updated = await widget.api.bookings();
    if (mounted) {
      setState(() {
        rows = updated;
        signedIn = true;
      });
      await notifications?.authenticated();
    }
  }

  Future<void> openBooking(Booking booking) => act(() async {
    final dashboard = await widget.api.workspace('/api/owner/dashboard') as Map;
    final clock = BusinessTime(
      (dashboard['settings'] as Map)['timezone'] as String,
    );
    if (!mounted || !signedIn) return;
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => BookingDetails(
          api: widget.api,
          bookingId: booking.id,
          clock: clock,
        ),
      ),
    );
    if (mounted && signedIn) await refresh();
  });

  Future<void> openBookingList({required bool history}) async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => BookingListScreen(
          history: history,
          initialBookings: rows,
          load: widget.api.bookings,
          onOpen: openBooking,
        ),
      ),
    );
    if (mounted && signedIn) await act(refresh);
  }

  @override
  void dispose() {
    notifications?.dispose();
    WidgetsBinding.instance.removeObserver(this);
    if (widget.api is SessionOwnerApi) {
      (widget.api as SessionOwnerApi).authChanges.removeListener(
        sessionInvalidated,
      );
    }
    email.dispose();
    password.dispose();
    previewCode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('DocDetailing'),
      actions: [
        if (signedIn && widget.api is SessionOwnerApi)
          IconButton(
            tooltip: 'Sign out all devices',
            onPressed: busy ? null : () => confirmSignOut(all: true),
            icon: const Icon(Icons.phonelink_erase),
          ),
        if (signedIn)
          IconButton(
            tooltip: 'Refresh bookings',
            onPressed: busy ? null : () => act(refresh),
            icon: const Icon(Icons.refresh),
          ),
        if (signedIn)
          IconButton(
            tooltip: 'Sign out',
            onPressed: busy ? null : () => confirmSignOut(),
            icon: const Icon(Icons.logout),
          ),
      ],
    ),
    drawer: signedIn
        ? Drawer(
            child: SafeArea(
              child: ListView(
                children: [
                  const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('Business workspace'),
                  ),
                  ServiceShortcuts(api: widget.api),
                  if (widget.api is HttpOwnerApi)
                    ListTile(
                      leading: const Icon(Icons.web),
                      title: const Text('Edit website & photos'),
                      onTap: busy
                          ? null
                          : () {
                              Navigator.pop(context);
                              act(
                                () => openOwnerWebsite(
                                  (widget.api as HttpOwnerApi).origin,
                                ),
                              );
                            },
                    ),
                  for (final section in [
                    'Calendar',
                    'Jobs',
                    'Notifications',
                    'Customers',
                    'Vehicles',
                    'Materials',
                    'Service consumables',
                    'Business settings',
                    'Estimates & invoices',
                    'Payment Center',
                    'Financial Center',
                    'Reviews',
                  ])
                    ListTile(
                      title: Text(section),
                      onTap: () {
                        Navigator.pop(context);
                        Navigator.push(
                          context,
                          MaterialPageRoute<void>(
                            builder: (context) =>
                                section == 'Service consumables'
                                ? ServiceSuppliesScreen(api: widget.api)
                                : section == 'Business settings'
                                ? BusinessSettingsScreen(api: widget.api)
                                : section == 'Calendar'
                                ? OwnerCalendar(api: widget.api)
                                : section == 'Jobs'
                                ? JobsScreen(api: widget.api)
                                : section == 'Notifications'
                                ? NotificationInbox(
                                    api: widget.api,
                                    native: notifications,
                                  )
                                : WorkspaceScreen(
                                    api: widget.api,
                                    section: section,
                                  ),
                          ),
                        );
                      },
                    ),
                ],
              ),
            ),
          )
        : null,
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (widget.api.isDemo)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Text(
                  'DEVELOPMENT DEMO · Synthetic bookings only. No customer messages or payments.',
                ),
              ),
            ),
          if (busy) const LinearProgressIndicator(),
          if (error != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          if (!signedIn) ...[
            Text(
              widget.api.isDemo
                  ? 'Preview the owner workflow'
                  : 'Owner sign in',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            if (!widget.api.isDemo) ...[
              TextField(
                controller: previewCode,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Private preview code',
                  helperText:
                      'Use the shared staging code, not your owner password.',
                ),
              ),
              AutofillGroup(
                onDisposeAction: AutofillContextAction.cancel,
                child: Column(
                  children: [
                    TextField(
                      controller: email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [
                        AutofillHints.username,
                        AutofillHints.email,
                      ],
                      autocorrect: false,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        labelText: 'Owner email',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: password,
                      obscureText: true,
                      autofillHints: const [AutofillHints.password],
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: const InputDecoration(labelText: 'Password'),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: busy
                  ? null
                  : () => act(() async {
                      if (previewCode.text.isNotEmpty) {
                        await widget.api.unlockPreview(previewCode.text);
                        previewCode.clear();
                      }
                      await widget.api.login(email.text.trim(), password.text);
                      if (!widget.api.isDemo) {
                        TextInput.finishAutofillContext(shouldSave: true);
                      }
                      password.clear();
                      await refresh();
                    }),
              child: Text(
                widget.api.isDemo ? 'Open demo dashboard' : 'Sign in',
              ),
            ),
          ] else ...[
            FutureBuilder<Object?>(
              future: widget.api.workspace('/api/owner/materials'),
              builder: (context, snapshot) {
                final value = snapshot.data;
                final list = value is Map
                    ? (value['records'] as List? ?? [])
                    : [];
                final low = list.where((r) => r['low_stock'] == true).toList();
                return low.isEmpty
                    ? const SizedBox.shrink()
                    : Card(
                        child: ListTile(
                          leading: const Icon(Icons.warning_amber),
                          title: Text('Low stock: ${low.length} product(s)'),
                          subtitle: const Text(
                            'Review supplies before your next job',
                          ),
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => WorkspaceScreen(
                                api: widget.api,
                                section: 'Materials',
                              ),
                            ),
                          ),
                        ),
                      );
              },
            ),
            HomeDashboard(
              bookings: rows,
              onPayments: () => Navigator.push<void>(
                context,
                MaterialPageRoute(
                  builder: (_) => WorkspaceScreen(
                    api: widget.api,
                    section: 'Payment Center',
                  ),
                ),
              ),
              onInvoices: () => Navigator.push<void>(
                context,
                MaterialPageRoute(
                  builder: (_) => WorkspaceScreen(
                    api: widget.api,
                    section: 'Estimates & invoices',
                  ),
                ),
              ),
              onSchedule: () => act(() async {
                await Navigator.push<bool>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ScheduleAppointmentScreen(api: widget.api),
                  ),
                );
                await refresh();
              }),
              onAwaitingReview: () => openBookingList(history: false),
              onWebsite: widget.api is HttpOwnerApi && !busy
                  ? () => act(
                      () =>
                          openOwnerWebsite((widget.api as HttpOwnerApi).origin),
                    )
                  : null,
              onCalendar: () => Navigator.push<void>(
                context,
                MaterialPageRoute(
                  builder: (_) => OwnerCalendar(api: widget.api),
                ),
              ),
              onCustomers: () => Navigator.push<void>(
                context,
                MaterialPageRoute(
                  builder: (_) =>
                      WorkspaceScreen(api: widget.api, section: 'Customers'),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text('Bookings', style: Theme.of(context).textTheme.headlineMedium),
            Text(
              '${rows.where((b) => b.status == 'pending').length} pending · ${rows.where((b) => b.status == 'confirmed').length} confirmed',
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: busy ? null : () => openBookingList(history: true),
                icon: const Icon(Icons.history),
                label: const Text('History'),
              ),
            ),
            if (rows
                .where(
                  (b) => ![
                    'cancelled',
                    'completed',
                    'declined',
                  ].contains(b.status),
                )
                .isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Text(
                  'No active bookings. New website requests will appear here.',
                ),
              ),
            for (final b in rows.where(
              (b) => !['cancelled', 'completed', 'declined'].contains(b.status),
            ))
              Card(
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: busy ? null : () => openBooking(b),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                b.customer,
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                            ),
                            const Icon(Icons.chevron_right),
                          ],
                        ),
                        Text(statusLabel(b.status)),
                        Text('${b.start.toLocal()} · device time'),
                        const SizedBox(height: 8),
                        Text(
                          b.status == 'pending'
                              ? 'View details & review appointment'
                              : 'View appointment details',
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 20),
            const Text(
              'Customer contact details and vehicles are saved with each website request. Use Customers to view their records and booking history.',
            ),
          ],
        ],
      ),
    ),
  );
}
