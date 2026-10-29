# DocDetailing Flutter application

Registered identity supplied by the owner: com.docincorporated.docdetailing, team UDDPKPR3CJ, name DocDetailing, App Store version 1.0. No other Doc app signing material is used.

Run flutter pub get, flutter analyze and flutter test here. Default flutter run uses synthetic demo data. For the isolated backend use flutter run --dart-define-from-file=config/staging.json; enter the tester gate and owner credentials interactively. Credentials are never compile-time constants. Sessions remain in memory.

Implemented: booking management, calendar agenda, customers/vehicles, reviews, private job photos, materials, invoice/payment/expense foundations and financial reports. Remaining release gates include secure session persistence, native APNs, complete calendar controls, financial recovery/UX and real-device acceptance. See ../../docs/apple-testflight-preparation.md.

Select repository-root codemagic.yaml on main. The app-local copy is mirrored; node scripts/ios-preflight.mjs from the repository root checks identity/configuration consistency. Workflows are manual, with no publishing. Signing assets belong only in Codemagic secure storage. No signed build has been made here.

The Flutter native app icon remains a development placeholder. The approved gold B brush emblem is the Baucom website favicon, not approved commercial DocDetailing app artwork.
