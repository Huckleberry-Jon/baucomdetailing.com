import 'package:flutter/material.dart';
import 'owner_api.dart';
import 'workspace.dart';

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
    title: 'DocDetailing Owner — development',
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff244f41)),
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

class _OwnerHomeState extends State<OwnerHome> {
  final email = TextEditingController(),
      password = TextEditingController(),
      previewCode = TextEditingController();
  bool signedIn = false, busy = false;
  String? error;
  List<Booking> rows = [];
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
    }
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    previewCode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('DocDetailing Owner'),
      actions: [
        if (signedIn)
          IconButton(
            tooltip: 'Refresh bookings',
            onPressed: busy ? null : () => act(refresh),
            icon: const Icon(Icons.refresh),
          ),
        if (signedIn)
          IconButton(
            tooltip: 'Sign out',
            onPressed: busy
                ? null
                : () => act(() async {
                    await widget.api.logout();
                    if (mounted) {
                      setState(() {
                        signedIn = false;
                        rows = [];
                      });
                    }
                  }),
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
                            builder: (context) => WorkspaceScreen(
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
                  labelText: 'Private preview code (if required)',
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
            Text('Bookings', style: Theme.of(context).textTheme.headlineMedium),
            Text(
              '${rows.where((b) => b.status == 'pending').length} pending · ${rows.where((b) => b.status == 'confirmed').length} confirmed',
            ),
            const SizedBox(height: 12),
            for (final b in rows)
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
                                        'Confirm this appointment with a 90-minute duration? The backend rechecks availability.',
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
              'Open the menu for business records, calendar, materials and finances. Photo permissions, APNs and signed iPhone acceptance remain release gates.',
            ),
          ],
        ],
      ),
    ),
  );
}
