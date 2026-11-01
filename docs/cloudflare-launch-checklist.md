# DocDetailing Cloudflare launch checklist — October 31, 2026

This supersedes the old Render launch report and DNS instructions. Work is confined to DocDetailing; DocInvoices and Joseph's Netlify site remain untouched.

## Verified state

- Private preview: https://docdetailing-site-staging.huckleberryservices.workers.dev/
- Staging Worker: docdetailing-site-staging; D1: docdetailing-staging; R2: docdetailing-staging-private.
- Site gate is on. Email, browser push and native APNs are disabled. Worker secret inventory contains only preview authentication secrets.
- Owner authentication, financial reconciliation, website availability dropdowns and closed-Monday behavior passed hosted read-only verification October 31. No new synthetic bookings were created by these checks.
- Business service area is Amarillo, Texas. Approved initial hours are Saturday/Sunday 08:00–20:00 America/Chicago, editable by Joseph. Production must copy the reviewed live business settings rather than overwrite them with source defaults.
- Source contains durable booking/outbox transactions, delivery attempts/retries, email webhook verification/suppression, APNs registration/renewal and permission handling, private media, and recovery support.
- Local recovery tests cover bookings, customers, settings, services/consumables, invoices/payments, inventory, receipts, logo and photo bytes. External storage has not been activated or tested.

## Email setup

1. Create the Doc Incorporated email-provider account. Existing adapter is Resend; start with its free account, subject to actual verified limits. Do not activate a paid tier automatically.
2. Add a dedicated transactional sending subdomain, such as notify.baucomdetailing.com. Obtain the exact provider DNS records; review separately. Preserve existing Porkbun forwarding MX/SPF/DKIM and do not add a second SPF record on the same host.
3. Create a restricted sending key and a signed webhook for delivery/bounce/complaint events at the application's /api/webhooks/email endpoint. Store RESEND_API_KEY, EMAIL_FROM and RESEND_WEBHOOK_SECRET privately in DocDetailing only.
4. Use deployment/cloudflare-communications.env.example. Start test-only with Joseph and the project owner allowlisted. Set the business notification preferences explicitly; process-wide credentials do not imply tenant opt-in.
5. Inspect blocked historical deliveries before activation; do not replay stale test confirmations to real recipients. Verify fresh booking/confirmation/proposal/cancellation messages, signed receipts, bounce suppression and failure fallback.
6. Only switch to live mode after actual recipient receipt and owner approval. Never equate API acceptance with delivery.

## iPhone push setup

1. Inspect Apple Team UDDPKPR3CJ key inventory. Reuse an existing authorized compatible APNs key only if its private file is available, otherwise prepare a dedicated DocDetailing APNs key without revoking or changing other Doc family assets.
2. Save the one-time .p8 download in protected private storage and escrow it separately. Set APNS_PRIVATE_KEY and APNS_KEY_ID; use topic com.docincorporated.docdetailing and production environment for TestFlight.
3. Begin with test-only mode and explicit TEST_NATIVE_OWNER_IDS. Require permission and a current registered device token.
4. Physical acceptance: foreground/background/cold-start alert; tap opens the correct booking; denial/re-enable; logout; token renewal; expired registration. Confirm owner email/in-app inbox fallback still works.

## Independent backup setup

1. Create a dedicated private B2 bucket/account, with separately scoped credentials. Approve any billing before activation. No independent provider account currently exists per owner confirmation.
2. Use deployment/cloud-backup.env.example: read-only source R2 credentials, scoped D1 export credential, bucket-scoped recovery read/write credentials without deletion, and a separately escrowed BACKUP_PASSPHRASE. Do not share other projects' credentials.
3. Run node scripts/cloud-backup.mjs create in the approved hosted runner. It exports a consistent D1 snapshot, encrypts data/media, reads ciphertext back from the destination, restores a fresh in-memory SQLite database and media set, checks integrity/relationships and recovery safety, then writes and reads back verified.json. Any restoration failure fails the run.
4. Keep the example workflow inactive until account/credentials are approved. Pin actions to reviewed commit SHAs; schedule daily; enable runner failure notifications and an independent backup-age check. No automatic backup deletion is configured. Establish retention and monitor capacity before unattended launch.
5. Perform a real external create and restore-local drill. Retain non-secret backup ID, source commit, restore timestamp, count/checksum results and verified.json. Local mocks do not prove external recovery.

## Production and domain cutover

1. Provision isolated docdetailing-site-production, a new docdetailing-production D1 and docdetailing-production-private R2. Do not reuse staging's D1 ID, owner secrets or test data. Apply all Cloudflare migrations and prepare verified business settings/media with reviewed consent. Keep SITE_OPEN=false and all outbound flags false.
2. Run npm.cmd run cloud:build, node scripts/cloudflare-preflight.mjs PRIVATE_CONFIG_PATH, and npm.cmd run launch:readiness -- PRIVATE_CONFIG_PATH. Readiness reports missing credential names only, never values; its configuration result is not external acceptance.
3. Export the COMPLETE authenticated Porkbun DNS zone, including forwarding and verification records. Public DNS lookups alone are insufficient.
4. October 31 public DNS still uses Porkbun nameservers, parking A records and www uixie.porkbun.com. Workers Custom Domains require an active Cloudflare zone. Prepare an exact reviewed Cloudflare zone import and nameserver/DNS plan before connecting baucomdetailing.com and www. The domain can remain registered at Porkbun. Do not blindly CNAME the apex to workers.dev or apply obsolete Render IPs.
5. Obtain approval for the concrete DNS/nameserver cutover. Preserve mail/forwarding records and keep registrar rollback information. Configure TLS, canonical redirects and tenant host mappings; verify no staging host/data leakage.
6. Run production HTTPS/auth/private photo/upload/booking/conflict/calendar/payment/invoice checks with isolated acceptance data, including Joseph's phone. Resolve failed delivery, recovery and configuration gates before SITE_OPEN=true. Ensure active native clients use the correct backend origin and credentials before retiring staging.

## Sources checked October 31

- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/ — active Cloudflare zone prerequisite.
- https://www.backblaze.com/docs/cloud-storage-application-keys — bucket-scoped application keys.
- https://resend.com/docs/dashboard/domains/introduction — sender-domain verification.

No hosting purchase, customer communication activation, backup-provider account, DNS change or public launch is implied by this checklist.
