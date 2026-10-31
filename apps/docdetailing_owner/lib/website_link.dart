import 'package:url_launcher/url_launcher.dart';

Uri ownerWebsiteUri(Uri origin) {
  if (origin.scheme != 'https' ||
      origin.host.isEmpty ||
      origin.userInfo.isNotEmpty ||
      origin.hasQuery ||
      origin.hasFragment ||
      !['', '/'].contains(origin.path)) {
    throw ArgumentError('An approved HTTPS business origin is required.');
  }
  return origin.resolve('/owner#website-photos');
}

Future<void> openOwnerWebsite(
  Uri origin, {
  Future<bool> Function(Uri)? open,
}) async {
  final uri = ownerWebsiteUri(origin);
  final opened =
      await (open ??
          (uri) => launchUrl(uri, mode: LaunchMode.externalApplication))(uri);
  if (!opened) {
    throw const FormatException(
      'Could not open the website editor. Try again or open your owner dashboard in Safari.',
    );
  }
}
