# Publish Joseph's website — configuration and approval sequence
October 28, 2026. Nothing has been deployed. Render is fallback-only.

## What is prepared

The Fetch Worker implements the existing website APIs against D1 and private R2, with tenant relationships, atomic booking/conflict protection, authentication, calendar, reviews, website-photo consent and notification retry/receipt records. Production-only bundle: npm.cmd run cloud:build. Static check: npm.cmd run cloud:preflight.

Production template: deployment/wrangler.production.example.json. It names baucomdetailing.com and www.baucomdetailing.com, disables workers.dev/preview URLs, routes assets through authentication first, keeps SITE_OPEN=false and outbound communications disabled. Resource IDs are deliberately placeholders. It is not deployable as-is.

Actual local private instance: http://localhost:4334. Local credentials/config are in owner-only ignored data/cloudflare-local. It has its own D1/R2 persistence, separate from the existing Node/device profiles. Synthetic QA on 4335 is NOT Joseph's account or final business settings. No tunnel is active.

## Current blockers

1. Approved Cloudflare account and actual isolated D1/R2 resource IDs are missing. Current production preflight correctly fails on the account and D1 placeholders. Account limits/billing allowances have not been inspected.
2. Domain routing is unresolved. Workers Custom Domains require the relevant Cloudflare zone. The observed Porkbun nameservers have not been moved. The Render A record 216.24.57.1 is NOT the Cloudflare deployment target.
3. Managed Images HEIC/EXIF acceptance needs an authorized real-provider test. JPEG/PNG processing and byte integrity pass locally, and existing Node HEIC tests pass. The real HEIC fixture returns 400 in the local Images emulator and leaves no partial booking. Production HEIC support is documented, not yet proven for this adapter.
4. Separate production preview secrets, owner identity/email verification and production VAPID/provider secrets need provisioning. Proposed Joseph email remains unverified. No production credentials were copied from local, device test or DocInvoices.
5. Real iPhone Home Screen permission, renewal, expired session, exact booking deep link and approved customer email receipt remain unverified.
6. Independent B2 destination/credentials, hosted runner, reviewed retention, backup-age/failure alerts and an actual off-provider upload/read-back/restore drill need approval and configuration. Local full recovery passed; it is not proof of external account recovery.
7. Joseph must confirm actual hours, service area, durations, contacts, final photographs/rights and Google review URL. Local verification temporarily used synthetic settings and restored the unconfirmed originals.
8. No production-to-D1 data migration has run. Existing Node data is untouched. Decide whether any existing records are real/required, rehearse an export/import with image checksums if so, or explicitly start the first production database empty.
9. General paid commercial release still requires automatic tenant provisioning/template/domain ownership lifecycle, subscription entitlements and broader load/abuse tests. Joseph's free testing access must remain separate. Invoice issuance, payment/finance modules are not implemented and financial integrity is not certified.

## Exact sequence after configuration approval

1. Approve the specific Cloudflare account, resource creation/feature eligibility and initial under-$15 operating envelope. Prefer existing paid Workers allowance if available; no new premium workspace/Postgres/standing image server. Create distinct DocDetailing D1/R2 resources and leave the media bucket private with public r2.dev access disabled.
2. Copy the production template to an ignored local configuration and fill verified account/D1 IDs and actual bucket binding. Keep all channels/publication off. Build the production-only bundle and rerun preflight, npm test and npm run test:cloudflare. Check resource ownership and active plan/quotas in the actual account.
3. Select and explicitly approve a private HTTPS preview origin. If using a workers.dev preview, enable it only in a separately reviewed gated preview configuration, with separate staging D1/R2/secrets. All assets must use run_worker_first=true and html_handling=none. Do not expose the local Wrangler debugger/explorer.
4. After explicit deployment authorization, apply the two reviewed migrations to the NEW isolated target only. Provision a separate owner with a unique scrypt-hashed password, a new business link_key and confirmed tenant_domains mapping. Use a private input/file, never credentials in shell arguments/Git. Retain Baucom catalog/settings; leave unknown facts unconfirmed. Preview hostname maps only to that target tenant, never a default fallback.
5. Deploy the approved private preview and prove gated assets, owner login/logout, booking persistence across new Worker versions, conflicts, signed customer links, JPEG/PNG/WebP/HEIC, EXIF stripping, private/public-photo boundaries, reviews and read-back recovery. Use only synthetic/approved test data.
6. Separately approve exact push devices and email recipients before installing production/test sender secrets and switching to test-only mode. Resend HTTP delivery and signed receipts are implemented; free-plan daily/monthly limits must fit expected peaks. SES/Cloudflare Email alternatives remain planned adapters, not enabled functionality. Confirm owner fallback address and sender authentication without replacing Porkbun forwarding records.
7. Approve and configure the independent backup workflow. Run a real encrypted upload/read-back/restore into fresh recovery storage; verify booking/customer/settings/photo checksums, held delivery and revoked sessions. Configure an independent stale-backup alarm. No automatic deletion is implemented.
8. Joseph completes physical iPhone acceptance. Verify his final business data and website assets. Record the exact candidate commit/configuration and rollback plan.
9. Choose/approve DNS separately. For direct Workers Custom Domains, export the complete Porkbun zone, reconcile Cloudflare records/DNSSEC, preserve every MX/TXT/SPF/DKIM/DMARC/unrelated record and approve any nameserver transfer. Do not modify Netlify's project. If retaining Porkbun authoritative DNS, a separately tested Cloudflare for SaaS/flattening/apex solution is needed; do not invent an apex IP or assume free apex proxying.
10. Only after DNS/public launch approval, attach validated apex/www certificates and canonical mappings, set SITE_OPEN=true and separately authorize live channels. Keep host-only cookies and reenroll origin-bound web push. Recheck public root/www HTTPS, forwarded mail, bookings and private media after propagation. Roll back from the saved registrar export and reviewed Worker version, not the old Render plan.

No deployment command has been run. No resource, paid feature, DNS record, email, push, external backup or TestFlight upload has been activated by this work.

Per-business activation: set notificationPreferences to explicit pushEnabled/emailEnabled booleans and a verified ownerEmail using owner settings. A global channel switch cannot opt another business in, and no process-wide owner recipient is used by the Cloudflare sender.
