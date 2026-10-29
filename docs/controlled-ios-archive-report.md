# Controlled iOS archive — October 28, 2026

Result: the signed engineering archive passed verification. Nothing was uploaded to Apple or distributed to testers.

- Codemagic application: 6ae2ac00cda6068e457c2738 (baucomdetailing.com).
- Successful run: https://codemagic.io/app/6ae2ac00cda6068e457c2738/build/6ae2bb42206ce93970c71917
- Source: GitHub main, beaf6d699c5e883f79219ca87e1827c84f7fedd2.
- Workflow: ios-signed-staging / Approved DocDetailing staging archive (no upload).
- Mac mini M2; successful run duration 3m 14s.
- Bundle com.docincorporated.docdetailing; team UDDPKPR3CJ; version 1.0.0; build 1.
- Flutter normalizes two-component 1.0 to 1.0.0; workflow and verifier now explicitly use 1.0.0. Confirm App Store Connect version metadata alignment before any authorized upload.

## Existing signing assets preserved

The saved Workflow Editor configuration used automatic signing (its UI says certificate/profile generation), debug mode and repository-root project discovery. It was not used for the archive. DocDetailing was switched to the reviewed root YAML workflow, which has no Apple API integration, certificate/profile generation, revocation, replacement, publishing or automatic triggers.

Existing certificate reference: docfamily_distribution_master_2026_09.
Certificate serial: 1B61F11135B7C21867D018B13CB5636D.
Certificate SHA-256: D3:28:70:B5:2C:DE:BF:F1:B6:87:74:5E:9D:57:63:F0:04:B8:0D:35:7D:0B:62:7B:41:83:63:0D:F4:2F:79:1A.
Certificate expiry: 2027-09-04 02:14:35 UTC (September 3 in Chicago).

The existing DocDetailing_AppStore_2026 profile was added to Codemagic as docdetailing_appstore_2026. UUID: 389636fe-c1d0-46f9-a477-dcb2f464d855. It matches the existing certificate, exact team and explicit app ID; it is an App Store distribution profile with production APNs capability and expires with the certificate.

No .p12 was reuploaded, no password was used or exposed, and no existing DocInvoices/DocPets/DocPartz signing asset was modified. Only a new Codemagic reference to the already existing DocDetailing profile was added. Profile application changes only the ephemeral DocDetailing CI checkout and export settings.

## Verification

The Mac runner passed Flutter analysis, all 8 Flutter tests and 2 Python plist parser tests. Local Node suite: 49/49. Local source preflight passed. The preceding unchanged Cloudflare baseline remains 29/29; Cloudflare code was not modified by this signing work.

The archive verifier ran codesign --verify --deep --strict, decoded embedded entitlements and provisioning data, checked profile/certificate validity dates, enforced distribution/non-debug profile policy, exact team/bundle/build/version, pinned certificate fingerprint and profile UUID, and byte-matched the actual signer certificate to the profile. It exported ios-signing-verification.json.

Three earlier engineering runs produced IPAs but failed the new verifier: Apple plist date/data JSON conversion, codesign optional argument syntax, and Flutter's normalized version. All were corrected in source; the final run passed. Those earlier candidates are superseded, not accepted releases.

## Actual artifacts

Codemagic displays docdetailing_owner.ipa (19.58 MB) separately and groups remaining outputs into baucomdetailing.com_4_artifacts.zip (43.01 MB). The downloaded ZIP was inspected: 106 entries, including:
- Full Runner.xcarchive with its signed app and embedded provisioning profile.
- Runner.app.dSYM, App.framework.dSYM and Flutter.framework.dSYM inside the archive.
- ios-signing-verification.json.

The IPA is separate, not duplicated inside that ZIP. The ZIP is preserved in the owner's Downloads folder. No binaries, profiles or signing credentials were committed.

Raw .log files and separate machine-readable Flutter test reports are not in this artifact ZIP. The configured /tmp/xcodebuild_logs/*.log pattern matched no files. Build/test logs remain visible in Codemagic. A future controlled build should explicitly capture logs, test JSON and export/provenance reports if separate downloadable diagnostics are required; this absence does not mean the signed archive or dSYMs are missing.

Codemagic's generic Publishing step collected CI artifacts only. There is no App Store Connect publishing configuration.

## Remaining release gates and next step

The signed app's actual APNs entitlement is **missing**. The profile's production APNs capability alone does not implement push. This run intentionally used --signing-only; the strict verifier defaults to requiring production APNs and would reject this candidate for complete notification acceptance.

Before TestFlight readiness: implement native APNs registration/token renewal/backend delivery, permission/failure/deep-link behavior; secure persisted sessions; complete native calendar blocked-time/business-hours/month controls and pagination; finish financial recovery/UX and native icon; verify iPhone photo/HEIC behavior and physical-device acceptance; approve metadata/privacy/support, version alignment and tester group.

Exact next development step: complete native APNs and secure session handling against isolated staging, followed by calendar acceptance. Keep push/email transmission disabled until separately approved. Do not upload the current engineering build as an accepted release. A later identified candidate requires explicit Apple upload authorization.

Production DNS, staging website deployment, billing and other Doc projects were unchanged.
