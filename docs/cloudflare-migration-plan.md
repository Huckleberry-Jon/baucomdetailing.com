# DocDetailing Cloudflare implementation review

> Current implementation: see cloudflare-migration-report.md and apps/docdetailing_owner. Earlier planned-only/SwiftUI descriptions below are historical; the authorized foundation is now Flutter. Production/native release gates remain unfulfilled.
October 28, 2026. Current recommendation: Cloudflare-first feasibility budget; supersedes the Render-first commercial purchase proposal. No infrastructure was activated.

## What the actual DocInvoices code demonstrates

Read-only inspection of C:/DocInvoices:
- backend/docinvoices-receipts/wrangler.jsonc selects a Worker entrypoint, one D1 DB binding and built-in observability. No R2 binding is present in this checked-in file.
- src/index.js implements fetch(request,env) and forwards versioned backend routes.
- src/backend.js has an async D1Store, business memberships, business-scoped records, JWT issuer/audience/JWKS verification, and a SendGrid provider adapter.
- schema.sql uses compound keys such as (business_id,kind,id) and business membership roles.
- App/docinvoices/lib/services/full_backup_service.dart exports local preferences and attachment bytes through a shareable backup; it does not prove scheduled cloud D1/R2 recovery.
- Native Flutter code supplies PDF/image/share functionality; those client-side costs should not be confused with a web backend's server-side media responsibilities.

This supports Workers/D1 and tenant repository patterns, not a claim that DocInvoices already implements every DocDetailing requirement. Local files do not establish currently deployed versions, live usage, subscription plan, monthly spend, active SendGrid configuration, external backup automation or R2 use elsewhere. No Cloudflare authentication/account billing was inspected, no credentials copied, and no DocInvoices files modified.

Do not copy development/shared-secret auth fallbacks into public DocDetailing authorization. Keep the product's own identities and tenant memberships. Do not copy a generic read-then-upsert record method for booking confirmation: appointment conflicts require conditional writes and atomic history/outbox.

## Existing work retained

Preserve public HTML/CSS/JS, service/pricing data, calendar validation, booking state machine, consent/moderation, private-link semantics, notification payload/event IDs, audit requirements and all existing tests. Add cloud adapters and migrate storage explicitly; no rewrite of the visual site or native app is required. D1 uses SQLite SQL but an asynchronous remote API; renaming imports is insufficient.

## Exact code changes required (planned unless marked implemented)

| Files / area | Required change | Acceptance evidence |
| --- | --- | --- |
| New cloudflare/worker.js; src/server.js | Extract request handlers into Fetch Request/Response functions; use env.ASSETS for public assets, preserving endpoint paths, CSP/security headers, request limits, exact-host/origin/CSRF checks and owner/customer auth | Port existing HTTP workflow tests to a local Worker |
| New inactive Wrangler config | Separate Worker name, D1/media/recovery bindings, static assets, explicit local/staging/prod settings; no default route or public preview; secrets through scoped provider mechanisms | Local build; no deployment to provision resources during preparation |
| src/db.js; src/bookings.js/calendar.js/reviews.js/media.js/website-photos.js | Async repository API with bind().first/all/run; remove filesystem DB initialization and synchronous reads from cloud route graph | Run same behavioral fixtures against both adapters |
| migrations/001–007 and new cloud-only schema | D1-compatible explicit migrations, tenant compound keys/FKs; media metadata/object keys/checksums instead of original/preview BLOB columns; no startup seeding all tenants as Baucom | Fresh isolated schema, repeated migration, FK and cross-tenant tests |
| src/db.js transaction helper; BookingService.create/transition; calendar block/settings writes | Replace BEGIN IMMEDIATE callbacks with D1 batch transactions and guarded SQL. Include expected booking/settings versions, capacity/conflict predicates and atomic history/outbox. A zero-row guard is NOT an SQL error: explicitly prevent subsequent writes or use a fail-closed guard constraint inside the batch | Full concurrent confirm/reschedule/capacity/block/settings tests against local D1, plus rollback/idempotency |
| src/catalog.js and all BUSINESS imports | Inject verified tenant context instead of mutable/global BUSINESS. Tenant-aware services, owner memberships, currencies/timezones, notification identities, gallery/package slots | Two-tenant hostile-access matrix before business two |
| src/security.js/dev-access.js/customer-links.js | Retain Node crypto compatibility for scrypt/HMAC/timing-safe checks where supported and benchmark actual Worker CPU/memory; make DB auth/rate-limit operations async/atomic, retain signed gate and link expiry | Local workerd crypto probe passed; full login/rate limits still to port |
| src/runtime-config.js/production-config.js/production-storage.js/private-files.js | New cloud env validation; explicit dev/prod bindings/secrets; omit POSIX mount/Windows ACL requirements from the cloud runtime rather than weakening the local profile | Fail closed for missing/mixed environment bindings; local/device profiles unchanged |
| src/media.js/heic.js/heic-worker.js/website-photos.js | Replace Sharp + worker_threads only in the Cloudflare adapter with private Images binding .info/.input/.transform/.output; enforce current raster allowlist, 4 MB/file, 16 MB combined, pixel/frame limits; strip EXIF/GPS; preserve exact R2 original | Real HEIC/truncated/oversize/metadata tests through actual provider required; documentation alone is not acceptance |
| public/photos.js/app.js/owner photo UI | Maintain current small upload compatibility initially; prefer staged binary uploads rather than base64 when adapter lands. Server-issued bounded upload grants and opaque object IDs, no client-trusted tenant/path | Forged uploads, unclaimed staged files and private/public access tests |
| R2 media protocol (new) | Stage private immutable objects, verify decoding/checksums, then atomically commit D1 booking/media/history/outbox references. Retain valid booking submissions if later preview/storage processing fails using an explicit recoverable pending-media state; invalid images retain existing reject-before-booking semantics. No distributed transaction is assumed | Booking durability, partial object failure, retry, consent publication and orphan recovery tests |
| src/notifications.js | Extract enqueue/claim/attempt/receipt repository; drain D1 outbox via scheduled() instead of setInterval; use leases/conditional updates, tenant settings and exact canonical links. Use web-push request generation + fetch or validated equivalent, retain payload encryption and VAPID | Real local Worker package/crypto compatibility plus approved iPhone delivery |
| email adapter / receipts | Keep Resend fetch API initially; optional SES fetch/SigV4 adapter with trusted signed receipts/suppressions. Cloudflare Email Beta is an alternative only after access/provider acceptance | Authorized real sender/recipient tests; failures never remove bookings |
| src/backups.js/hosted-backups.js/backup-remote.js and scripts | Keep tested Node SQLite backups for local use. Add D1 export + immutable R2 manifests, encrypted independent destination, scheduled hosted runner and fresh recovery workflow | Actual uploaded read-back/restore and stale-backup alert exercise |
| public template/manifest; DNS provisioning | Resolve verified hostname -> tenant; dynamic branding/manifest/SEO; one template and wildcard sites, domain ownership/TLS lifecycle. Cloudflare custom hostname routing is not a free rename of the Render alias logic | Host/header/cookie/cache isolation and real apex/www ownership/cert checks |
| native iOS client boundary | Maintain stable versioned JSON and tenant memberships, Keychain tokens and APNs contract; transport uses HTTPS without provider-specific D1/R2 exposure | Native models/UI can progress independently; archive/device acceptance still required |

D1 does not supply PostgreSQL RLS. Tenant filters, compound FKs, membership checks, host routing and regression tests remain essential. Every background job and recovery/export route needs the same tenant boundaries. Complimentary Joseph entitlement remains separate from subscription records; no billing activation is needed for this migration.

For scheduling, do not read availability, await unrelated work and then blindly update. A safe implementation may combine versioned tenant scheduling state with guarded SQL batches or tenant-serialized Durable Object operations with all writes following the same path. Durable Objects are not included as a mandatory purchase: prove SQL guards first. Read replication/session bookmarks cannot replace write conflict guards.

## Local feasibility actually executed

scripts/cloudflare-local-probe.mjs uses an explicitly supplied installed Miniflare module, with local in-memory D1/R2 bindings and synthetic data:
1. Existing scrypt and timingSafeEqual execute inside workerd.
2. Two competing guarded D1 batches produce exactly one confirmed appointment and one associated history/outbox.
3. A failed foreign-key write rolls back the whole D1 batch.
4. Private R2 binding returns the exact original bytes.

All four checks passed. The probe deliberately has no remote resources/account calls. Installed tooling was read from DocInvoices' dependency directory without changing that project; DocDetailing should pin its own dev tooling when implementing the adapter. The probe is not a production repository or full scheduling implementation. Its narrow overlap guard does not implement hours, capacity, buffers, rescheduling or settings races.

Usage: node scripts/cloudflare-local-probe.mjs ABSOLUTE_PATH_TO_INSTALLED_MINIFLARE_MODULE. Tested with Miniflare 5 alpha and its documented V4 options converter. Do not claim native Images decoding or real delivery is validated by local substitutes. No live API calls, data copy or migration occurred.

Current npm.cmd test: 47 passing (all original 46 plus a regression proving gallery failure does not stop booking controls). No pricing decision is required to keep website development moving.

## Decision checkpoint and fallback

Do the cloud work in reversible local commits: Fetch/D1 adapter and full transactional booking proof; private Images/R2 HEIC proof; outbox/auth/provider tests; independent recovery proof; then tenant/template/domain tests. These are several concrete implementation areas, not an instant deployment switch. The main effort is asynchronous persistence and concurrency, not a mandatory visual rebuild.

No evidence currently establishes that Cloudflare is disproportionately expensive to implement. Do not buy Render merely because its template exists. If the full transaction or image proof fails, compare remaining engineering effort with a measured $7-class pilot's memory/disk limits; the prepared $25 instance is over budget.

Cloudflare launch blockers: full adapter implementation, verified account allowances, image/HEIC and private preview tests, tenant isolation before another business, sender approval/quota, encrypted independent restore, domain routing that preserves current mail/Netlify, and Joseph's physical iPhone acceptance. Account setup, paid activation, remote provider testing, DNS/deployment and external communications remain separately controlled.

## Native development remains independent

Website UI and a storage-neutral native API contract can progress without a hosting purchase. Record provider-neutral booking/membership/media models and explicit unsupported finance/payment endpoints; do not fabricate a working native app, archive or TestFlight build. Backend/device acceptance remains necessary before production-connected native acceptance. See native-ios-api-contract.md for the next implementation boundary.

Sources: [D1 atomic batch semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/), [Node crypto support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/), [Images private binding](https://developers.cloudflare.com/images/optimization/binding/), [HEIC input](https://developers.cloudflare.com/images/get-started/limits/), [D1 exports and blocking limitation](https://developers.cloudflare.com/d1/best-practices/import-export-data/).
