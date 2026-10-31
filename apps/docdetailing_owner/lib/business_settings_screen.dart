import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'owner_api.dart';

class BusinessSettingsScreen extends StatefulWidget {
  const BusinessSettingsScreen({super.key, required this.api});
  final OwnerApi api;
  @override
  State<BusinessSettingsScreen> createState() => _BusinessSettingsState();
}

class _BusinessSettingsState extends State<BusinessSettingsScreen> {
  final controls = <String, TextEditingController>{
    for (final k in [
      'name',
      'contact',
      'invoiceAddress',
      'invoicePhone',
      'invoiceEmail',
      'invoiceFooter',
    ])
      k: TextEditingController(),
  };
  final labels = {
    'name': 'Business name',
    'contact': 'Website contact details',
    'invoiceAddress': 'Invoice business address',
    'invoicePhone': 'Invoice phone',
    'invoiceEmail': 'Invoice email',
    'invoiceFooter': 'Invoice footer / payment instructions',
  };
  int? version;
  Uint8List? preview, logo;
  bool busy = false, removeLogo = false;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    for (final c in controls.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result =
              await widget.api.workspace('/api/owner/business-profile') as Map,
          p = result['profile'] as Map;
      Uint8List? image;
      if (p['invoiceLogoId'] != null) {
        final asset =
            await widget.api.workspace(
                  '/api/owner/business-asset?id=${Uri.encodeQueryComponent(p['invoiceLogoId'] as String)}',
                )
                as Map;
        image = base64Decode(asset['base64'] as String);
      }
      if (mounted) {
        setState(() {
          version = result['version'] as int;
          for (final e in controls.entries) {
            e.value.text = p[e.key] as String? ?? '';
          }
          preview = image;
          logo = null;
          removeLogo = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> chooseLogo() async {
    try {
      final file = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 1200,
        maxHeight: 1200,
        imageQuality: 90,
      );
      if (file == null) return;
      final bytes = await file.readAsBytes();
      if (bytes.length > 4 * 1024 * 1024) {
        throw const FormatException('Choose a logo under 4 MB.');
      }
      if (mounted) {
        setState(() {
          logo = bytes;
          preview = bytes;
          removeLogo = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  Future<void> save() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.workspace(
        '/api/owner/business-profile',
        method: 'PUT',
        body: {
          'version': version,
          'profile': controls.map((k, c) => MapEntry(k, c.text.trim())),
          'removeLogo': removeLogo,
          if (logo != null)
            'logo': {'name': 'invoice-logo', 'base64': base64Encode(logo!)},
        },
      );
      await load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Business settings saved. New documents will use this branding.',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Business settings'),
      actions: [
        IconButton(
          onPressed: busy ? null : load,
          icon: const Icon(Icons.refresh),
          tooltip: 'Reload settings',
        ),
      ],
    ),
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (busy) const LinearProgressIndicator(),
          if (error != null)
            Text(
              error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          const Text(
            'Business information and invoice logo. Issued invoices keep the branding saved when they were created. Working days and hours are managed in Calendar.',
          ),
          const SizedBox(height: 16),
          if (preview != null)
            Image.memory(preview!, height: 120, fit: BoxFit.contain),
          Wrap(
            children: [
              OutlinedButton.icon(
                onPressed: busy ? null : chooseLogo,
                icon: const Icon(Icons.add_photo_alternate),
                label: const Text('Choose invoice logo'),
              ),
              if (preview != null)
                TextButton(
                  onPressed: busy
                      ? null
                      : () => setState(() {
                          logo = null;
                          preview = null;
                          removeLogo = true;
                        }),
                  child: const Text('Remove invoice logo'),
                ),
            ],
          ),
          for (final e in controls.entries)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: TextField(
                controller: e.value,
                enabled: !busy,
                keyboardType: e.key == 'invoiceEmail'
                    ? TextInputType.emailAddress
                    : TextInputType.text,
                maxLength: e.key == 'name' ? 120 : 500,
                decoration: InputDecoration(labelText: labels[e.key]),
              ),
            ),
          FilledButton(
            onPressed: busy || version == null ? null : save,
            child: const Text('Save business settings'),
          ),
        ],
      ),
    ),
  );
}
