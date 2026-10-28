# DocDetailing Owner — Flutter foundation

Independent app directory; separate provisional iOS bundle identity, not registered with Apple. No DocInvoices signing material is used. Current source lives in this repository; a separate remote app repository and App Store Connect record have not been created.

Implemented: explicit synthetic demo dashboard, sign-in flow, booking list, versioned confirmation, refresh/logout, provider-neutral OwnerApi, HTTPS-only origin-bound transport with redirect rejection, and optional private-preview gate access. Sessions stay in memory; no password/session is written to preferences. Backend membership/authorization remains authoritative.

From this directory:
- flutter pub get
- flutter analyze
- flutter test
- flutter run (synthetic demo by default)

Live transport is opt-in with DEMO_MODE=false and an approved HTTPS API_ORIGIN. No live app connectivity has been tested. Keychain persistence, APNs, calendar/photo/review UI and the remaining commercial modules are pending. Never mark this foundation as a functional TestFlight release.

codemagic.yaml has no automatic triggers, publishing or signing credentials. Its unsigned iOS workflow requires explicit IOS_BUILD_APPROVED and SHARED_BACKEND_ACCEPTED flags. Verify the workflow working directory if moving this app into a separate repository. Windows tests do not establish an Xcode archive; a separately approved Mac build and independent signing/ASC setup remain required.

The scaffold's icon/launch resources are temporary Flutter development assets. Joseph's final app name/artwork, privacy/support pages and permission strings must be approved before TestFlight. No camera/APNs permissions are requested by this foundation.
