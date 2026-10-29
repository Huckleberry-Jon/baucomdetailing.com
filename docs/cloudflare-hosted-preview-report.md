# Private Cloudflare preview — deployed and verified

October 28, 2026. DocDetailing only.

## Working URL and isolation

https://docdetailing-site-staging.huckleberryservices.workers.dev/

Owner dashboard: same origin, /owner. An unauthenticated visitor sees the private tester gate, including on deep links; owner authentication remains separate. Authorized testers remain Joseph and the project owner.

Worker: docdetailing-site-staging.
D1: existing isolated docdetailing-staging.
R2: newly created docdetailing-staging-private, WNAM, Standard storage.
Latest deployed Worker version: 79a53e48-b770-400f-aed6-379e94d970dc.
Application source fix: c25da39. No production Worker/domain was deployed.

The staging config uses only staging bindings and namespaces. SITE_OPEN=false, COMMUNICATIONS_MODE=disabled, ALLOW_EMAIL_SEND=false and ALLOW_PUSH_SEND=false. No email/push sender secrets were uploaded. Porkbun DNS, baucomdetailing.com, DocInvoices and Joseph's Netlify website were unchanged.

R2 activation was completed by the owner before this work. No billing subscription or plan was activated by this deployment.

## Private access handoff

Project-owner gate code and login are in the protected, Git-ignored file:
C:\DocDetailing\data\cloudflare-staging-candidate\owner.json

Joseph's separate verified login and generated password are in:
C:\DocDetailing\data\cloudflare-staging-candidate\joseph-owner.json

Use gateCode from owner.json to unlock the preview, then the appropriate email/password at /owner. Keep these files local/private. No credentials are included in this report or sent by email. Both accounts were authenticated against the deployed HTTPS application successfully.

## Hosted acceptance results

Twelve grouped checks passed against the real deployed services:

1. HTTPS tester gate protects website and APIs.
2. Gate access alone cannot reach the owner dashboard.
3. Project-owner login and dashboard work with Secure/HttpOnly cookies.
4. Synthetic customer/vehicle/location/time booking and PNG intake photo persist.
5. Private R2 original downloads match uploaded bytes; JPEG previews decode; unauthenticated access is refused.
6. Owner confirms a request; overlapping confirmation receives 409.
7. Confirmed booking appears in the hosted calendar.
8. Private customer link reflects confirmation.
9. Review stays private pending moderation; legitimate one-star review can be approved inside the gated preview.
10. Notification records exist and no delivery is accepted/sent/delivered.
11. Owner logout revokes access.
12. Joseph's separate owner login/dashboard/logout work.

Cleanup cancelled the synthetic requests, returned the review to pending, and restored the original unconfirmed business settings. Test records/photos remain private for audit; nothing was automatically deleted. Project-owner sessions left by the failed image probe were revoked. Final session count was zero.

A real browser independently displayed the HTTPS gate. Screenshot evidence is in the local visualizations folder as hosted-staging-gate.png.

## Hosted image defect found and fixed

Additional provider testing found JPEG EXIF metadata remained in an encoded preview despite metadata=none, although the emulator had stripped it. c25da39 now strips APP/comment metadata from the encoded JPEG derivative, including between progressive scans, while preserving encoded pixels. Malformed framing is rejected.

The new regression test verifies metadata/comment/trailing-data removal and identical decoded progressive pixels. After staging redeployment, the actual provider JPEG probe passed: orientation-6 40×20 source produced a 20×40 preview, no EXIF remained, and the original download matched the upload exactly. Original: 966 bytes; preview: 262 bytes.

The genuine synthetic HEIC fixture returned 400 on the actual provider. HEIC is a remaining capability blocker, not a pass. Use JPEG/PNG in this preview. Physical iPhone camera/library/HEIC acceptance remains necessary.

An earlier saved booking and its cancellation were re-read through the private customer API after the Worker redeployment, proving persistence across versions.

## Tests and resource measurements

After the source fix:
- Node suite: 47 passed, zero failed.
- Actual local Cloudflare suite: 28 passed, zero failed, including the new JPEG regression.
- Flutter source unchanged; previously accepted eight tests/static analysis remain the native baseline, not a newly repeated device test.
- Hosted grouped workflow checks: 12 passed.
- Additional hosted JPEG privacy/orientation/integrity and cross-deployment persistence checks passed.
- HEIC capability probe failed as explicitly documented above.

Latest direct remote D1 query:
- Database: 430,080 bytes, 30 application tables.
- Four retained synthetic bookings; all four cancelled.
- Three private media records; six referenced R2 original/preview objects totaling 3,084 bytes.
- Zero accepted/sent/delivered outbound records; zero sessions.
- Foreign-key check: no violations.

The last Wrangler D1 aggregate displayed nine read queries / 50 write queries, 191 rows read / 174 rows written. These delayed counters are not the exact complete test-operation total. R2 aggregate object_count/bucket_size still displayed zero immediately after uploads; successful read-back and checksums prove objects exist, so the zero aggregate is reporting lag, not an empty-bucket claim. The six-object/3,084-byte figure is derived from persisted media references, not a full bucket inventory.

R2 public managed r2.dev access was verified disabled through the provider API; custom-domain list was empty. No public media bucket was created. Worker startup reported 17 ms and bundle approximately 742.49 KiB raw / 109.42 KiB gzip, with 22 assets.

No account-wide invoice or complete Workers/Images billing totals are available through this OAuth token. These tiny test measurements do not establish a final monthly bill; retain the previously discussed low-usage budget and verify account-wide quotas/alerts separately.

## Remaining launch blockers

Actual HEIC handling; physical iPhone usability/permissions; separately approved push/email activation and recipient/sender verification; real off-provider encrypted backup recovery; final business hours/service area/contact/durations/Google link/photo rights and approved policies; production resource/secrets and exact DNS/publication authorization.

This is a working private staging preview, not public launch or TestFlight acceptance. No Apple upload or native release was performed.
