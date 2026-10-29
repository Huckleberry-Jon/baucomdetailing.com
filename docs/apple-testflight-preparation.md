# Flutter / Apple / Codemagic preparation

October 28, 2026. Local development only; no signed iOS build, Apple upload or TestFlight invitation has occurred. Local signing identity is configured from the owner-provided registration.

## Current native application

apps/docdetailing_owner is a separate Flutter iOS application. The registered independent bundle ID supplied by the owner is com.docincorporated.docdetailing, Apple team UDDPKPR3CJ. App name: DocDetailing. App Store version: 1.0; source version: 1.0.0+1. SKU DOCDETAILING-IOS-001 is owner-selected, not independently verified from a screenshot. The owner reports App Store Connect “Prepare for Submission”; this is not an uploaded build. Flutter 3.44.6/Dart 3.12.2 is used. No DocInvoices, DocPets or DocPartz signing files were modified or copied.

Implemented native source now includes HTTPS owner login/private gate, ephemeral authenticated sessions, booking dashboard/confirmation, calendar agenda, job lifecycle/proposals, inbox/read state, searchable editable customer/vehicle records, materials entry, draft estimates/invoices, immutable issuance, manual received-payment/expense entry, cash-basis Financial Center with UTC quarters, reviews/Google link, and private camera/library job-photo upload/preview/invoice selection. The backend validates every write and tenant boundary.

Demo mode remains explicit and default; management demo views are empty rather than fabricated business data. Photo capture is disabled in demo. Actual native-to-staging integration has not been exercised on an iPhone. Calendar agenda currently derives from the bounded dashboard list; full native blocked-date/month controls remain unfinished. The website already provides these controls.

Materials support quantity in thousandths, oz/gallon/bottle, unit cost, markup, computed selling price and taxable flag. No bottle volume is assumed. Financial records use integer cents, immutable issued snapshots, external-payment recording, durable idempotency keys, atomic balance checks and tenant-scoped reports. No QuickBooks, subscription charging or card processing is integrated.

Financial limitations before commercial acceptance: PDF/print/share presentation, multi-line editing UX, estimate-to-invoice conversion UX, refunds/credit notes/reversals, durable client recovery for an uncertain financial save, business-local quarter boundaries, pagination beyond initial list limits, accountant review and broader reconciliation tests. No claim of a complete accounting system is made.

## Signing and notifications

The owner supplied registered team UDDPKPR3CJ and bundle ID com.docincorporated.docdetailing. All Runner build configurations and test identifiers now use this identity. No Apple account registration is needed. A matching DocDetailing App Store distribution provisioning profile and signing certificate/private key are still required in Codemagic secure storage. Enable Push Notifications and provide app-specific APNs credentials only when that implementation and activation are separately approved. Never revoke or replace another Doc app's certificate/profile.

Native APNs registration/device-token storage/delivery adapter and secure persisted session/credential storage are still implementation gates. Existing website web-push infrastructure is not native APNs. No entitlement is attached to an unsigned target merely to claim capability readiness.

Photo picker 1.2.4 is installed, with app-specific camera/library purpose strings. Physical permission denial, limited-library access, camera return, HEIC/HEIF and background upload behavior remain unverified. HEIC cannot be validated by the iOS simulator alone under the package's documented limitation. [Flutter photo-picker documentation](https://pub.dev/packages/image_picker).

## Codemagic

Root codemagic.yaml is the configuration to select for this repository on main. The nested app copy is identical for compatibility; scripts/ios-preflight.mjs rejects drift. There are no automatic triggers or publishing steps. Validation runs analysis/tests. Unsigned iOS validation requires IOS_BUILD_APPROVED=true and SHARED_BACKEND_ACCEPTED=true. Both native build workflows use config/staging.json with DEMO_MODE=false and the existing isolated HTTPS Cloudflare origin; no credentials are embedded.

The ios-signed-staging workflow additionally requires IOS_SIGNING_APPROVED=true and a positive APP_BUILD_NUMBER (first proposed build 1; verify uniqueness before each build). It selects uploaded app_store signing assets for the exact registered bundle, applies profiles, and builds an IPA with build-name 1.0. Artifacts remain private CI downloads. This workflow has not run on macOS and is not proof of signing or native connectivity. Team/profile, archive entitlements, expiration and embedded bundle/version must be inspected before any upload.

Next setup steps:
1. Select this GitHub repository and main in a separate DocDetailing Codemagic application; select root codemagic.yaml. Source pushes are authorized; no other app configuration is to be reused or changed.
2. Securely upload a DocDetailing-specific matching profile and authorized signing certificate/private key for team UDDPKPR3CJ in Codemagic. Do not commit .p12, .mobileprovision, .p8, passwords or API keys. The artifact-only workflow does not need an ASC upload API key.
3. Run flutter-validation first after approving any CI usage. Record backend acceptance and explicit build/signing flags only after the remaining native gates are addressed. Then run unsigned and signed staging builds on macOS.
4. Inspect the archive/signature/profile and test staging gate/login, booking changes and photographs on an iPhone. An App Store-signed IPA is not directly sideloadable; TestFlight upload remains a separate approval. A local development-signed device run would need its own approved device profile.
5. Complete metadata/privacy/support and approve the exact candidate upload/tester group separately. No upload or tester invitation is configured here.

[Codemagic iOS signing](https://docs.codemagic.io/yaml-code-signing/signing-ios/) documents uploaded profile selection and xcode-project use-profiles. [Flutter build workflow](https://docs.codemagic.io/yaml-quick-start/building-a-flutter-app/) documents IPA artifacts.

## Draft TestFlight metadata (do not submit yet)

App name: DocDetailing (registration reported by owner).
Owner: Doc Incorporated LLC.
Purpose: manage detailing appointments, customers, vehicles, job photographs, materials, estimates, invoices and externally received payments.
Beta description: controlled owner testing against an isolated DocDetailing backend; Joseph is a complimentary tester.
What to test: gate/login/logout; booking confirmation and proposals; conflicts; customer/vehicle edits; private before/after photos and invoice selections; materials arithmetic; invoice/payment/expense/report reconciliation; notification permissions and exact-booking taps after native APNs implementation.
Feedback/support email: owner must provide and verify.
Privacy policy/support URL: approve and publish final pages on the verified domain before using their URLs in Apple metadata.
Review access: a separate synthetic review account and explicit preview-access instructions; no production customer credentials.

Prepare screenshots only from the functioning signed candidate. Declare collected contact details, service address, identifiers, customer records and photos according to actual shipped behavior and provider practices. Confirm payment/financial metadata classifications with the final feature set. Do not declare tracking or absence of data collection from assumptions. Add third-party SDK/privacy manifest review after a macOS build.

[Apple TestFlight test information](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-test-information/), [Apple submission privacy requirements](https://developer.apple.com/app-store/submitting/).

## Approval sequence

1. Accept the website/backend preview and verify Joseph's business facts.
2. Reviewed source pushes to main are authorized; configure the separate Codemagic application and approve CI usage.
3. Use the confirmed team and bundle ID; supply independent signing assets and finish native security/notification requirements.
4. Complete native release gates above, build on macOS, sign and test a physical iPhone.
5. Approve metadata/privacy/support information and the exact tester group.
6. Separately authorize uploading/submitting the identified build. No upload is authorized by this handoff.
