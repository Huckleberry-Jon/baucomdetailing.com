# DocDetailing execution report — October 28, 2026

Work continued only in C:\DocDetailing on codex/website-foundation. No push, deployment, DNS change, purchase, public tunnel, customer communication, external backup upload, Apple signing or submission occurred. Joseph's Netlify site and other Doc applications were not changed.

## Result and next milestone

The website/backend are verified locally, with additional owner workflows and native business-management source. They are not production accepted. The exact next step is to approve the Cloudflare account, isolated staging resources, exact HTTPS preview hostname, verified owner identity, authorized testers and test window; then review/authorize deployment of the gated staging candidate using device-preview-commands.md. Keep sending disabled while verifying the secured connection.

## Website

Preserved the existing architecture, all package descriptions and owner-editable ranges: Route 66 Revival $79–119, The Dust Off $119–169, The Final Mile $169–229. Full condition/additional-charge disclaimers now appear on each card and the private booking status page. Added prelaunch privacy and booking-conditions pages, legal navigation, editable public contact details and configured business-hours display. No contact information, hours, pricing facts, customer reviews or work photographs were invented.

Owner workspace adds today's confirmed appointments and authenticated searchable/editable customer and vehicle directories with tenant scoping, concurrency hashes and audit records. Existing booking/calendar/services/add-ons/photos/reviews/settings remain. Node retains its working booking engine; directory editing is a Cloudflare extension and the Node UI explains that limitation rather than failing silently.

Business facts/assets/policies still need Joseph's approval. Eleven real-photo slots remain pending his authorized files. Public HTML still has Joseph-specific branding and copy; complete template branding/domain onboarding is future commercial work.

## Cloudflare and security

Workers/D1/R2/Images bindings, gated assets/private routes, owner sessions, secure customer links, origin checks, rate/upload limits, tenant joins, immutable media keys, consent publication and delivery controls remain in place. New migrations 0003/0004 add query indexes, materials, immutable financial documents, ledger records and complimentary entitlement metadata. All four migrations ran in fresh actual local workerd tests; the two additions also applied successfully to the isolated persisted local D1. No remote migration ran.

Atomic tenant revision checks still protect scheduling and writes. Confirmation races have one winner; later-write failures roll back customer/booking/history/outbox changes. Notification failures leave durable bookings and retry records. Owner settings must explicitly opt each tenant into a channel; no global owner recipient is inherited. Redacted unexpected-error logs contain route/status/random request ID rather than credentials or customer payloads.

Tracked-file scan found no recognizable private-key/provider-token patterns in 206 files at scan time; this is a limited scan, not proof against every possible secret. Generated credentials remain under ignored owner-protected data folders. Production Node dependency audit: zero vulnerabilities. New offline release preparation creates separate owner/gate/link secrets and complimentary access, refuses overwrite, and performs no network calls. Real candidate generation remains blocked on approved account/identity/origin values.

Production bundle builds. cloud:preflight exits 1 intentionally: approved account ID and new isolated production D1 ID are absent. Resource ownership, account quotas, exact preview hostname, R2 privacy and provider Images eligibility remain unverified externally.

## Automated verification

| Check | Final result |
| --- | --- |
| npm.cmd test | 47 passed, 0 failed |
| npm.cmd run test:cloudflare | 27 passed, 0 failed |
| Flutter tests | 8 passed, 0 failed |
| Flutter static analysis | No issues |
| Combined automated tests | 82 passed |
| Production-only Worker build | Passed; no fixture endpoints |
| Production configuration preflight | Correctly blocked on missing account/D1 IDs |
| Production npm audit | 0 vulnerabilities |
| Persisted private local verification | Gate, separate owner authentication, intake/history, conflict prevention; settings restored and synthetic bookings cancelled |

Cloudflare coverage includes booking lifecycle, requests/add-ons, duplicate submission, cancellation/proposals/customer acceptance, calendar/blocks/hours/durations/DST/buffers/capacity, concurrent confirmations/settings races, tenant/session/private-photo boundaries, notification encryption/renewal/failure/retry/receipts/opt-in, migrations, R2 integrity, Images processing, consent, financial races/idempotency and full recovery.

Failures found and fixed during development included migration-comment compatibility in the test loader, native dialog test synchronization, and an actual narrow-screen quarter-selector overflow. The final responsive test checks 390×844 native customer/material/financial views without layout errors. No known automated regression remains. Provider HEIC remains an explicit failed capability probe outside the passing suite.

## Browser evidence

Used real browser interaction on the isolated synthetic workerd fixture at localhost:4335 with both channels disabled. Verified owner sign-in; customer package/add-on selection and contact/vehicle/address/time intake; successful request and private link; owner pending/inbox record; confirmation; blocked owner/customer delivery records; customer confirmed status plus full disclaimer; customer search and saved edit reflected back in the owner request. Synthetic data only.

Screenshot: C:\Users\Huckl\.codex\visualizations\2026\10\28\01a18424-61f7-72e2-9159-18dbe7721e1d\execution-booking-proof.png.
These browser interactions are separate from the automated test totals. Full physical Safari/iPhone acceptance and automated browser coverage of every owner module are not claimed.

## Photos

Actual local Images tests pass JPEG EXIF orientation (40×20 orientation-6 source becomes 20×40), metadata stripping, PNG-to-JPEG conversion, and exact private original download. Other runtime tests verify private R2 checksum integrity, tenant access, consent and job/invoice selections.

Existing Node tests decode genuine HEIC. A fresh Cloudflare local Images HEIC probe still returned 400 and created zero bookings. Production HEIC/HEIF is NOT verified. Run the authorized real-provider and physical-iPhone drill; JPEG/PNG remains the documented usable fallback. Native camera/library selection, upload, private preview and invoice selection are implemented in source with purpose strings, but not tested on hardware.

## Encrypted recovery

Full local encrypted snapshot/read-back/fresh actual D1/R2 restore passed, now including materials, issued invoice snapshots, received-payment ledger and complimentary-access records. Exact restored records/bytes matched. Wrong passphrase and tampering fail closed; populated targets are refused; sessions are revoked, subscriptions disabled, deliveries held and production domains detached. Older metadata snapshots have compatibility handling for newly introduced empty tables.

The independent hosted B2 runner is prepared but inactive. No off-provider recovery claim is made. Remote D1 export permissions, B2 conditions, approved runner, independent backup-age/failure alerts, key escrow, retention/capacity and a timed external recovery drill remain gates. Dashboard backup_runs is not yet fed by the external runner. Current snapshots copy all referenced media each time; no automatic retention deletion occurs. RPO ≤24h / RTO ≤4h remain unproven targets.

## Native app and business-management foundation

Flutter source now includes dashboard/login, calendar agenda, inbox, customer/vehicle editing, job confirmation/proposal/cancel/start/complete/no-show, materials, estimates/invoice drafts and immutable issue, manual Payment Center, cash-basis Financial Center, review settings and private job photos. Native date/time pickers replace timestamp entry for proposals. HTTPS transport supports create/update/list responses, ephemeral cookies, origin checks and manual-payment idempotency headers.

Materials support oz/gallon/bottle, thousandth quantities, cost/markup/selling price/taxable designation. Tenant financial records use integer cents, immutable snapshots, invoice balances, atomic concurrent payment checks and duplicate protection. Reports distinguish receipts, tips, tax, expenses/material purchases, estimated cash profit and cash flow. There is no QuickBooks or live card charge.

This is a foundation, not a complete commercial accounting/native release. Native APNs registration/delivery and secure persistent sessions, full calendar block/month controls, pagination, invoice PDF/share, richer document editing/conversion, refunds/adjustments, durable uncertain-save recovery, business-local reporting boundaries and broader reconciliation remain unfinished. These implementation gaps are separate from missing Apple credentials.

## Apple / Codemagic

Independent provisional bundle ID: com.docincorporated.docdetailing.owner. No authorized team/profile has been selected. Codemagic is preparation-only, enforces main, has no triggers/publishing, and guards unsigned demo build behind acceptance flags. Source has not been pushed to main. No signed build exists; TestFlight readiness is not claimed.

apple-testflight-preparation.md provides draft metadata, privacy/testing instructions and exact owner/account steps. App-specific APNs/signing and final artwork/support information remain required. Other Doc app signing was untouched.

## Publication and costs

device-preview-commands.md provides local checks, gated staging resource/candidate/secret/migration/deploy commands (remote steps not executed), and the production/Porkbun sequence. A workers.dev staging preview avoids DNS/Netlify changes. Direct production Workers Custom Domains requires the correct Cloudflare zone; the provider-assigned nameservers and complete mail-preserving zone diff are unavailable. No apex IP is invented and the old Render IP must not be used.

Initial planning remains approximately $6–12/month, around $11 conservative allowance at low volume. This is an estimate, not an observed bill. Workers $5/account base, included D1/R2/Images capacity subject to actual shared quotas, low-volume email and independent backup/runner allowances. Resend free limits of 3,000/month and 100/day must fit peaks; delayed queue delivery is not a substitute for adequate quota. B2 advertises $6.95/TB/month. Domain renewal, Apple membership, paid Codemagic minutes, payment fees and taxes are excluded. No expensive hosting purchase is proposed.

See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Resend pricing](https://resend.com/pricing), [B2 pricing](https://www.backblaze.com/cloud-storage/pricing).

## Local commits and files

Implementation commits in this execution pass:
- e803b9e — website policies, directories, tenant financial records and recovery.
- 5b833fa — expanded Flutter owner workflows and private job photos.
- 2a5638e — responsive Financial Center fix and appointment pickers.
- d5eeb60 — offline release candidates and public contact settings.
- A following documentation commit contains this report, runbooks and full changed-file inventory.

Branch: codex/website-foundation. No push. The final documentation commit leaves a clean worktree, verified separately after committing. execution-changed-files.txt lists every path changed since cefdc72, including this report. Local ignored runtime credentials, D1/R2 persistence, test backup artifacts and build output are excluded from Git.

## Exact owner actions remaining

1. Approve the named Cloudflare account, isolated staging resources/cost envelope, exact HTTPS hostname, verified Joseph email, authorized testers and test window.
2. Separately authorize the gated staging deployment, then verify secured remote booking/photo access with sending disabled.
3. Approve specific push devices/email recipients/sender and test-only activation after connection verification.
4. Approve B2/runner/key escrow/retention capacity and run the actual external recovery drill.
5. Supply/approve business facts, 11 real photos/rights, Google link and final privacy/booking policies.
6. Approve the exact production resource/configuration and mail-preserving DNS diff after preview acceptance.
7. For native work, approve reviewed source on main, a separate Codemagic build, the existing authorized Apple team, independent bundle/profile/APNs and eventual upload of a specifically identified signed candidate.

No permission is inferred from this list. Independent development work was completed where practical; unverified services and remaining native/commercial implementation are identified explicitly.
