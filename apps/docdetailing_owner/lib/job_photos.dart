import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'owner_api.dart';

class JobPhotos extends StatefulWidget {
  const JobPhotos({super.key, required this.api, required this.bookingId});
  final OwnerApi api;
  final String bookingId;
  @override
  State<JobPhotos> createState() => _JobPhotosState();
}

class _JobPhotosState extends State<JobPhotos> {
  List rows = [];
  String kind = 'before';
  String? error;
  bool busy = false;
  final previews = <String, Future<List<int>>>{};
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> run(Future<void> Function() f) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await f();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> load() => run(() async {
    final value = await widget.api.workspace(
      '/api/owner/photos?${Uri(queryParameters: {'booking': widget.bookingId}).query}',
    );
    if (mounted) setState(() => rows = value as List);
  });
  Future<void> upload(ImageSource source) => run(() async {
    final selected = await ImagePicker().pickImage(
      source: source,
      requestFullMetadata: false,
    );
    if (selected == null) return;
    final bytes = await selected.readAsBytes();
    if (bytes.length > 4 * 1024 * 1024) {
      throw const ApiFailure(413, 'Choose a photograph smaller than 4 MB.');
    }
    await widget.api.workspace(
      '/api/owner/photos',
      method: 'POST',
      body: {
        'bookingId': widget.bookingId,
        'kind': kind,
        'photos': [
          {'name': selected.name, 'base64': base64Encode(bytes)},
        ],
      },
    );
    await load();
  });
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Private job photographs')),
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Originals remain private. Invoice selection does not publish a photograph. Provider HEIC processing and camera permissions still require physical iPhone verification.',
          ),
          if (widget.api.isDemo) const Text('Demo contains no photographs.'),
          if (busy) const LinearProgressIndicator(),
          if (error != null) Text(error!),
          DropdownButton<String>(
            value: kind,
            items: [
              for (final k in ['intake', 'before', 'after'])
                DropdownMenuItem(value: k, child: Text(k)),
            ],
            onChanged: busy ? null : (v) => setState(() => kind = v!),
          ),
          Wrap(
            spacing: 12,
            children: [
              FilledButton(
                onPressed: busy || widget.api.isDemo
                    ? null
                    : () => upload(ImageSource.camera),
                child: const Text('Take photo'),
              ),
              OutlinedButton(
                onPressed: busy || widget.api.isDemo
                    ? null
                    : () => upload(ImageSource.gallery),
                child: const Text('Choose photo'),
              ),
            ],
          ),
          for (final raw in rows)
            Builder(
              builder: (context) {
                final row = raw as Map, id = row['id'] as String;
                return Card(
                  child: Column(
                    children: [
                      FutureBuilder<List<int>>(
                        future: previews.putIfAbsent(
                          id,
                          () => widget.api.privatePhoto(id),
                        ),
                        builder: (context, snapshot) {
                          if (snapshot.hasError) {
                            return const Text('Private preview unavailable.');
                          }
                          if (!snapshot.hasData) {
                            return const Padding(
                              padding: EdgeInsets.all(16),
                              child: CircularProgressIndicator(),
                            );
                          }
                          return Image.memory(
                            Uint8List.fromList(snapshot.data!),
                            height: 220,
                            fit: BoxFit.contain,
                          );
                        },
                      ),
                      Text('${row['kind']} · ${row['filename']}'),
                      CheckboxListTile(
                        title: const Text('Select for invoice'),
                        value: row['include_on_invoice'] == 1,
                        onChanged: busy
                            ? null
                            : (value) => run(() async {
                                await widget.api.workspace(
                                  '/api/owner/invoice-photo',
                                  method: 'PUT',
                                  body: {'id': id, 'include': value},
                                );
                                await load();
                              }),
                      ),
                    ],
                  ),
                );
              },
            ),
        ],
      ),
    ),
  );
}
