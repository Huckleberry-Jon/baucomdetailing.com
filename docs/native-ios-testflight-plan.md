# Native iOS / TestFlight gates

> Current implementation: see cloudflare-migration-report.md and apps/docdetailing_owner. Earlier planned-only/SwiftUI descriptions below are historical; the authorized foundation is now Flutter. Production/native release gates remain unfulfilled.

Hosted backend and physical iPhone acceptance have NOT passed. No native project, repository, signing assets, App Store Connect record, archive or upload exists. Website tests do not establish TestFlight readiness.

After acceptance, create a separate SwiftUI owner app/repository. Temporary name: DocDetailing Owner. Proposed bundle ID com.docincorporated.docdetailing.owner and SKU DOCDETAILING-OWNER-IOS need owner/team availability approval before registration. Do not reuse or modify DocInvoices identifiers, signing assets or secrets.

Implement and test Keychain-backed owner authentication and the native API contract first; website cookies/CSRF are not a completed native integration. Add dashboard/calendar/atomic confirmation/customer/vehicle/job photos. Native APNs token registration and exact-booking deep links remain to implement; web push is not native APNs. Then implement jobs/materials, estimates/invoices, Payment Center and Financial Center with financial integrity tests. Existing invoice photo/review contracts are preparation only.

deployment/codemagic.ios.template.yaml is inactive, has approval guards and no triggers/upload/publishing. Once real source exists, replace project/scheme/simulator values and configure an independently scoped signing integration and secret group. Run analyze/tests, verify staging/production connectivity and authorization, then separately approve a signed archive. Inspect team, bundle ID, entitlements and IPA before any upload approval. Windows cannot validate Xcode/provisioning.

Create the separate ASC record only with approval. Prepare internal beta group, export compliance, privacy, review notes and a privately supplied test account. First external beta generally requires review and builds expire after 90 days. Verify Joseph's proposed email and authorize the invitation separately.

## Asset and disclosure draft

Generated PNG/touch icons are provisional WEB assets derived from existing branding. Native AppIcon/launch catalogs await the actual project and Joseph's final branding. They have not been generated into a native project.

Proposed camera text: "Take before-and-after photographs for your detailing jobs." Prefer the system photo picker and request broader library access only if implemented functionality needs it. Explain notifications before prompting. No usage strings are compiled yet.

Privacy inventory: customer contact/address, vehicles/bookings, job photos/metadata, reviews, owner identifiers, push tokens and delivery logs. Inventory future invoice/payment data when implemented. Record purposes, linkage, retention/deletion and processors accurately; do not claim no collection. Public privacy/support URLs and SDK manifest/required-reason API review remain required. Do not invent reason codes before inspecting source.

Draft What to Test: owner login; test booking; push opens the same request; confirm/propose; conflict rejection; real HEIC selection; private photo access; review moderation; denied permission, expired session and offline retry. Use synthetic customers/approved destinations. Supply reviewer credentials privately, never in Git.

Blockers: hosted/device acceptance, actual native source, authentication/APNs and required business modules, final assets/privacy/support pages, independent Apple signing/ASC setup, Mac CI validation, signed archive and upload/review/invitation approvals.

Sources: https://docs.codemagic.io/yaml-quick-start/building-a-native-ios-app/ ; https://docs.codemagic.io/yaml-publishing/app-store-connect/ ; https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/

