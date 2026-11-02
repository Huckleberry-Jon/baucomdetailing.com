import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

ThemeData ownerTheme() {
  const ink = Color(0xff282218);
  const muted = Color(0xff5c5140);
  const gold = Color(0xffe5bd6b);
  const accent = Color(0xff755019);
  const paper = Color(0xfff8f3e9);
  const card = Color(0xfffffdf8);
  final scheme =
      ColorScheme.fromSeed(
        seedColor: gold,
        brightness: Brightness.light,
      ).copyWith(
        primary: accent,
        onPrimary: Colors.white,
        primaryContainer: const Color(0xfff5dfad),
        onPrimaryContainer: ink,
        secondary: const Color(0xff66543a),
        onSecondary: Colors.white,
        secondaryContainer: const Color(0xffefe1c7),
        onSecondaryContainer: ink,
        surface: card,
        onSurface: ink,
        onSurfaceVariant: muted,
        surfaceContainerLowest: Colors.white,
        surfaceContainerLow: const Color(0xfff5eddf),
        surfaceContainer: const Color(0xfff0e6d4),
        surfaceContainerHigh: const Color(0xffecdfc8),
        surfaceContainerHighest: const Color(0xffe7d8bc),
        outline: const Color(0xff8b795b),
        outlineVariant: const Color(0xffd5c7af),
        error: const Color(0xffa62222),
        onError: Colors.white,
        errorContainer: const Color(0xffffe8e2),
        onErrorContainer: const Color(0xff741414),
      );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: paper,
    appBarTheme: const AppBarTheme(
      backgroundColor: paper,
      foregroundColor: ink,
      surfaceTintColor: Colors.transparent,
      systemOverlayStyle: SystemUiOverlayStyle.dark,
    ),
    cardTheme: CardThemeData(
      color: card,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0xffd5c7af)),
      ),
    ),
    drawerTheme: const DrawerThemeData(
      backgroundColor: paper,
      surfaceTintColor: Colors.transparent,
    ),
    dialogTheme: const DialogThemeData(
      backgroundColor: card,
      surfaceTintColor: Colors.transparent,
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: card,
      surfaceTintColor: Colors.transparent,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      labelStyle: const TextStyle(color: muted),
      hintStyle: const TextStyle(color: muted),
      errorStyle: TextStyle(color: scheme.error),
      border: const OutlineInputBorder(),
      enabledBorder: const OutlineInputBorder(
        borderSide: BorderSide(color: Color(0xff8b795b)),
      ),
      focusedBorder: const OutlineInputBorder(
        borderSide: BorderSide(color: accent, width: 2),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: gold,
        foregroundColor: ink,
        minimumSize: const Size(48, 48),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: accent,
        side: const BorderSide(color: accent),
        minimumSize: const Size(48, 48),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: accent,
        minimumSize: const Size(48, 48),
      ),
    ),
    dividerTheme: const DividerThemeData(color: Color(0xffd5c7af)),
  );
}
