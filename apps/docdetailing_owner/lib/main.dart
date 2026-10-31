import 'package:flutter/material.dart';
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
  bool signedIn = false, busy = false, showHistory = false;
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
            onPressed: busy ? null : () => act(() => signOut(all: true)),
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
            onPressed: busy ? null : () => act(signOut),
            icon: const Icon(Icons.logout),
          ),
      ],
    ),
    drawer: signedIn
        ? Drawer(
            child: SafeArea(
              child: ListView(
                children: [
                  const DrawerHeader(child: Text('Business workspace')),
                  for (final section in [
                    'Calendar',
                    'Jobs',
                    'Notifications',
                    'Customers',
                    'Vehicles',
                    'Materials',
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
                            builder: (context) => section == 'Calendar'
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
              TextField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Owner email'),
              ),
              TextField(
                controller: password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Password'),
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
                      password.clear();
                      await refresh();
                    }),
              child: Text(
                widget.api.isDemo ? 'Open demo dashboard' : 'Sign in',
              ),
            ),
          ] else ...[
            HomeDashboard(
              bookings: rows,
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
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('Show completed and cancelled bookings'),
              value: showHistory,
              onChanged: (value) => setState(() => showHistory = value),
            ),
            if (rows
                .where(
                  (b) =>
                      showHistory ||
                      ![
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
              (b) =>
                  showHistory ||
                  !['cancelled', 'completed', 'declined'].contains(b.status),
            ))
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        b.customer,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      Text(b.status.replaceAll('_', ' ')),
                      Text('${b.start.toLocal()} · device time'),
                      SelectableText('Booking: ${b.id}'),
                      if (b.status == 'pending')
                        FilledButton(
                          onPressed: busy
                              ? null
                              : () => act(() async {
                                  final duration = await showDialog<int>(
                                    context: context,
                                    builder: (context) => AlertDialog(
                                      title: const Text('Confirm appointment'),
                                      content: const Text(
                                        'Confirm this appointment with a 90-minute duration? Availability is checked again. The customer and vehicle details are already saved in Customers.',
                                      ),
                                      actions: [
                                        TextButton(
                                          onPressed: () =>
                                              Navigator.pop(context),
                                          child: const Text('Cancel'),
                                        ),
                                        FilledButton(
                                          onPressed: () =>
                                              Navigator.pop(context, 90),
                                          child: const Text(
                                            'Confirm 90 minutes',
                                          ),
                                        ),
                                      ],
                                    ),
                                  );
                                  if (duration != null) {
                                    await widget.api.transition(
                                      b,
                                      'confirm',
                                      durationMinutes: duration,
                                    );
                                    await refresh();
                                  }
                                }),
                          child: const Text('Review confirmation'),
                        ),
                    ],
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
