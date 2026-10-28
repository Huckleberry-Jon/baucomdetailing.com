# Flutter / Apple / Codemagic preparation

October 28, 2026. Local development only; no signed iOS build, Apple upload, team change or TestFlight invitation has occurred.

## Current native application

apps/docdetailing_owner is a separate Flutter iOS application. The provisional independent bundle ID is com.docincorporated.docdetailing.owner. Flutter 3.44.6/Dart 3.12.2 is used. No DocInvoices, DocPets or DocPartz signing files were modified or copied.

Implemented native source now includes HTTPS owner login/private gate, ephemeral authenticated sessions, booking dashboard/confirmation, calendar agenda, job lifecycle/proposals, inbox/read state, searchable editable customer/vehicle records, materials entry, draft estimates/invoices, immutable issuance, manual received-payment/expense entry, cash-basis Financial Center with UTC quarters, reviews/Google link, and private camera/library job-photo upload/preview/invoice selection. The backend validates every write and tenant boundary.

Demo mode remains explicit and default; management demo views are empty rather than fabricated business data. Photo capture is disabled in demo. Actual native-to-staging integration has not been exercised on an iPhone. Calendar agenda currently derives from the bounded dashboard list; full native blocked-date/month controls remain unfinished. The website already provides these controls.

Materials support quantity in thousandths, oz/gallon/bottle, unit cost, markup, computed selling price and taxable flag. No bottle volume is assumed. Financial records use integer cents, immutable issued snapshots, external-payment recording, durable idempotency keys, atomic balance checks and tenant-scoped reports. No QuickBooks, subscription charging or card processing is integrated.

Financial limitations before commercial acceptance: PDF/print/share presentation, multi-line editing UX, estimate-to-invoice conversion UX, refunds/credit notes/reversals, durable client recovery for an uncertain financial save, business-local quarter boundaries, pagination beyond initial list limits, accountant review and broader reconciliation tests. No claim of a complete accounting system is made.

## Signing and notifications

An existing authorized Apple developer team must be selected by the owner. It has not been inspected or guessed. Register the independent bundle ID and provisioning profile, enable Push Notifications for this app, and create app-specific APNs credentials. Never revoke or replace another Doc app's certificate/profile.

Native APNs registration/device-token storage/delivery adapter and secure persisted session/credential storage are still implementation gates. Existing website web-push infrastructure is not native APNs. No entitlement is attached to an unsigned target merely to claim capability readiness.

Photo picker 1.2.4 is installed, with app-specific camera/library purpose strings. Physical permission denial, limited-library access, camera return, HEIC/HEIF and background upload behavior remain unverified. HEIC cannot be validated by the iOS simulator alone under the package's documented limitation. [Flutter photo-picker documentation](https://pub.dev/packages/image_picker).

## Codemagic

apps/docdetailing_owner/codemagic.yaml has no automatic triggers or publishing stanza. Both workflows require CM_BRANCH=main. Validation runs analysis/tests; unsigned iOS validation additionally requires IOS_BUILD_APPROVED=true and SHARED_BACKEND_ACCEPTED=true. The current unsigned build uses DEMO_MODE=true and does not prove a live backend or TestFlight readiness.

The source is still on a local codex branch and has NOT been pushed/merged to main. After explicit Git authorization, review and move the accepted commits to GitHub main, select this separate Codemagic application/config path, and approve any build charges. Run validation first. The signed workflow, approved HTTPS non-demo origin, signing integration and upload steps must be prepared/reviewed after the owner selects team/profile and backend acceptance is recorded.

[Codemagic built-in environment variables](https://docs.codemagic.io/yaml-basic-configuration/environment-variables/), [Flutter builds](https://docs.codemagic.io/yaml-quick-start/building-a-flutter-app/), [iOS signing](https://docs.codemagic.io/yaml-code-signing/signing-ios/).

## Draft TestFlight metadata (do not submit yet)

App name: DocDetailing Owner (availability unverified).
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
2. Approve pushing reviewed source to main and a distinct Codemagic application/build.
3. Select the authorized Apple team, bundle ID, independent profile and app-specific APNs credentials.
4. Complete native release gates above, build on macOS, sign and test a physical iPhone.
5. Approve metadata/privacy/support information and the exact tester group.
6. Separately authorize uploading/submitting the identified build. No upload is authorized by this handoff.
