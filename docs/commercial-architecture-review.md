# DocDetailing commercial architecture review

> CURRENT DECISION: The Render-first $110–150 initial hosting recommendation is withdrawn. Follow minimum-production-budget.md and cloudflare-migration-plan.md. Earlier cost/scaling figures below are historical planning scenarios, not purchase recommendations.
October 28, 2026. Owner: Doc Incorporated LLC. Decision proposal, not deployment authorization.

## Decision

Preserve the Node application and configurable website work. Use Render for the application initially. Joseph is tenant one and receives complimentary testing access; he does not define the commercial product.

The existing Render/SQLite/disk template is suitable only for an approved, limited Joseph pilot after its existing acceptance gates. It is NOT a multi-business production blueprint. Do not scale it by deploying one service per customer or by inserting a second business into the current database.

Commercial target: one versioned Node application, managed PostgreSQL, a durable database-backed notification/job outbox, private S3-compatible object storage (R2 recommended), and one website template driven by tenant configuration. Start with Render-managed custom domains and wildcard subdomains; consider Cloudflare for SaaS later if automated domain operations justify another edge component. No Kubernetes, per-customer builds, Redis or microservices are required initially.

Joseph's launch need not wait for every commercial module or a speculative 1,000-customer migration. Complete his single-tenant acceptance first; make the tenant abstraction the next code milestone, then prove two-tenant isolation before onboarding business two. Require an approved, reversible PostgreSQL/media migration before general paid availability and horizontal scaling. This is a staged recommendation, not a finding that SQLite cannot serve multiple businesses in principle.

## Evidence from this repository

| Area | Current implementation | Commercial consequence |
| --- | --- | --- |
| Identity | src/catalog.js exports BUSINESS = "baucom"; BookingService accepts only db | No request-scoped business context |
| Provisioning | src/db.js seeds Baucom on every open; setup-owner.js refuses any existing owner | Cannot create a second independent business |
| Schema | Many business_id columns exist; services.id is globally primary; relationship FKs reference IDs alone | Reusing package IDs collides; cross-business relationships are not prevented by composite FKs |
| Authorization | src/server.js owner query is filtered by the constant business | Existing owner checks are useful but not tenant membership authorization |
| Background work | notifications.js enqueue uses BUSINESS, but tick claims deliveries globally with one process config | Simply replacing BUSINESS could send tenant B events with tenant A credentials/destination |
| Branding/template | catalog.js, index/owner/booking HTML, manifest, icons, website-photos.js and notifications.js contain Baucom/Joseph/package names | Tenant settings must drive all rendered branding and communication content |
| Time | calendar.js, bookings.js, notifications.js, public app/calendar/owner JS use America/Chicago; settings validation enforces it | Multi-timezone businesses need validated IANA zones and DST tests |
| Domains | production-config.js/server.js allow one origin plus redirect-only aliases; DNS script fixes Baucom domain | Aliases currently do not resolve tenants; no verified domain registry |
| Secrets | One environment-level owner email/VAPID/sender/webhook config; global private_keys/recovery hold | Must separate tenant preferences and scoped secrets from platform transport configuration |
| Media | Original and preview BLOBs in SQLite; website photo slots fix three package IDs | Disk/copy growth; package photo slots should use tenant service IDs |
| Recovery | Whole SQLite database backup/restore; one global production backup prefix | Shared-tenant recovery requires isolated tenant export/import and complete media manifests |
| Commercial modules | Booking/photo/review contracts exist; invoices, payments, finance, subscriptions do not | These requirements are planned, not implemented or verified |

Existing business_id filters, optimistic versions, atomic bookings/history/outbox, media validation, consent publication and encrypted restore tests should be retained. No claim of existing data leakage is made: a second tenant is not currently supported. No runtime or schema changes were made in this review.

## Hosting comparison

| Criterion | Render Node + managed database | Cloudflare Workers + D1/R2 |
| --- | --- | --- |
| Existing code | Keeps Node/native image stack; PostgreSQL adapter is a bounded but real change | node:sqlite and worker_threads compatibility include stubs; HTTP, transactions and image execution need adaptation |
| Persistence | Pilot disk stays single-instance; commercial database is external to stateless web instances | D1 managed SQL and R2 objects; not a drop-in DatabaseSync filesystem |
| Photo hosting | Use R2 for private originals and consented public derivatives; Node retains HEIC/Sharp processing | R2 attractive; image processing must be validated/replaced or sent to a separate Node processor |
| Backup | Managed database PITR plus independently encrypted exports/media copies and restore drills | D1 Time Travel plus export and media recovery; still needs independent recovery/operator process |
| Deployment | One Node image; web + worker + managed database; familiar debug/build workflow | Fewer always-on compute resources, but greater initial rewrite and compatibility validation |
| Scaling | Stateless web replicas and worker queues after database/media extraction; managed DB sized by measured load | Strong request scaling; D1 has per-database limits and serialized write constraints; sharding/tenant databases increase orchestration |
| Customer domains | Managed TLS and wildcard; API-driven domain setup can be added | SaaS hostname lifecycle is attractive, but apex support has eligibility/cost caveats |
| Operating cost | Higher baseline; low-maintenance fit for existing code | Lower light-traffic infrastructure floor; engineering/processing/domain costs prevent a fair "$5 total" claim |

D1 currently limits a database to 10 GB and a row/BLOB to 2 MB. Existing accepted 4 MB image originals cannot be moved there unchanged. R2 is useful independently of Workers. Workers + D1 is a possible later product implementation, not the lowest-maintenance launch migration.

Sources: [Workers compatibility](https://developers.cloudflare.com/workers/configuration/compatibility-flags/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Render disk restrictions](https://render.com/docs/disks).

## Tenant security design — required before business two

Resolve a normalized, verified hostname to an immutable tenant ID using a domain registry. Reject unknown/suspended domains; never fall back to Baucom. Strip untrusted forwarded headers at the ingress boundary and do not accept a browser-supplied business_id as authority. A domain selects the public tenant; an authenticated owner must additionally hold an active membership for that tenant. Public booking links remain scoped to their tenant and expiration.

Pass an explicit TenantContext to service/repository methods, image access, reviews, calendar and all jobs. Do not mutate a global BUSINESS variable between requests. Retain immutable tenant IDs even when slugs/domains change. Use users + tenant_memberships with roles, supporting one owner in multiple businesses without duplicate identities. Host-only Secure/HttpOnly cookies, CSRF/origin checks, separate gate cookies and no parent-domain session cookie. A central owner/API hostname may simplify native login later, but requires an explicit authorization contract.

Use tenant_id NOT NULL throughout tenant-owned records. Add UNIQUE(tenant_id,id), composite relationship FKs, and tenant-scoped service keys, idempotency keys, invoice numbers, processor references and indexes. Every join/update/export must preserve tenant boundaries. PostgreSQL row-level security supplies defense in depth with a non-owner/non-BYPASSRLS runtime role, FORCE RLS where appropriate, fail-closed policies and transaction-local tenant context cleared by transaction/pool boundaries. Privileged migration/support roles remain separate and audited. RLS is not a substitute for application authorization. [PostgreSQL policy behavior](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

Preserve scheduling atomicity when moving from SQLite BEGIN IMMEDIATE: lock the tenant's scheduling/configuration row while checking capacity, buffers, hours and confirmation, with consistent lock ordering and retries. Re-run conflict tests against independent PostgreSQL connections; multiple resource calendars require resource-aware constraints. Do not replace this with advisory browser availability.

Jobs contain tenant_id and are claimed with leases and tenant-aware joins. Resolve the tenant's preferences, channel flags, verified sender/reply-to, recipient and credentials at send time; event payloads capture the correct tenant/version/origin. Bound per-tenant concurrency and retry quotas. Signed provider callbacks map through stored delivery/processor records, never a client-selected tenant. Keep global test-mode allowlists and emergency send kill switches. A shared VAPID transport key may be platform-managed, but subscriptions must be tenant + owner + origin scoped; APNs device memberships require the same isolation. Per-tenant keys may be added if required rather than generating a provider account per business.

Private media keys: environment/tenant/opaque-media-id/version. Prefixes organize objects; authorization and short-lived grants enforce access. Separate public consented derivatives from private originals; no public intake URLs. Validate upload size/type/ownership, strip metadata on previews, record checksum and processing status. Object store and SQL are not one transaction: staged uploads, durable metadata/outbox, promotion and safe orphan reconciliation must preserve booking durability if storage fails. No deletion policy activates without approval.

Cache keys include hostname + tenant + publication version. Cache public content only; never owner responses or signed media. Logs, analytics, support tooling, rate limits, exports and abuse quotas are tenant-aware. Operator access is least-privilege, explicitly audited and never implicit impersonation.

Required new acceptance tests: two tenants with identical service slugs, customer emails and idempotency keys; forged tenant IDs; cross-tenant sessions/booking links/media/reviews/exports; foreign-key mismatches; background delivery/provider callback isolation; same-time appointments in independent businesses; independent settings/timezones; pooled DB context leakage; domain ownership/takeover; public cache separation; tenant restore without modifying another tenant. Retain all existing 46 tests and add these rather than rewriting assertions to conceal regressions.

## One template and automatic websites

Proposed records (design only): tenants; users/memberships; tenant_settings; services; website_config(template_version, theme, content, assets, publication_state); tenant_domains(hostname UNIQUE, tenant_id, kind, canonical, verification/TLS state); entitlement_grants; subscription_accounts; provisioning_jobs. Existing booking/calendar/media/review data remains tenant-owned. Slug uniqueness is platform-wide; reserve admin/api/www/support/billing and prevent Unicode/confusable hostname abuse.

Onboarding is an idempotent state machine: request -> validate business/slug -> create tenant and owner membership -> seed configurable service defaults -> create draft website_config -> reserve slug -> attach domain record -> readiness review -> publish. Retry individual failed jobs; never create duplicate businesses, subscriptions or sites. Domain-provider operations are asynchronous and must not block a database transaction. No new Git repository, deployment or code copy for each customer.

Use <slug>.<approved-platform-domain> from wildcard DNS/TLS. No platform domain is selected or purchased in this review. Render wildcard setup requires the platform apex to route appropriately; choose a dedicated product domain/subdomain arrangement after reviewing Render's requirements. Tenant content includes names, contact, hours/timezone, packages/pricing, colors/logo, hero/gallery, policies, Google review URL and notification preferences. Use safe structured fields, not arbitrary customer scripts/HTML. Store template versions so platform releases can roll out safely without overwriting tenant content.

Baucom's existing text/packages/photos become its tenant configuration. New businesses start with generic editable drafts; no invented testimonials, hours or work photographs. The single template renders tenant-specific SEO, manifest/icons and mobile layout.

## Customer-owned domains and Joseph first

Owner buys and retains control of their domain. An authenticated tenant owner requests a hostname; issue a fresh TXT ownership challenge, reject duplicate/previous ownership claims, verify DNS, attach hostname through the provider API, wait for certificate readiness, then activate mapping. DNS alone is not owner authorization. Revalidate failed/removed mappings, disable access on detach and clean certificates/routes to prevent dangling-domain takeover. No registrar password is required.

For Joseph's first approved custom-domain deployment, retain the existing direct Render plan: baucomdetailing.com apex A 216.24.57.1 and www CNAME to the actual assigned onrender.com host. Preserve Porkbun forwarding, MX/TXT/SPF/DKIM/DMARC and Netlify. The previously documented DNS plan remains review-only; actual provider verification records and ownership proof must be recorded before changes. Render TLS must be ready before canonical routing. Decide canonical host, use safe redirects and re-enroll origin-bound web push after domain changes.

At scale, Render can automate customer domain attachment with its API; each apex/www name must be costed. Cloudflare for SaaS offers 100 included hostnames, then $0.10 per additional hostname, but two names per business consume two hostnames. Generic apex A routing is not included by assumption: Cloudflare documents restricted/costed apex proxying. Otherwise a customer needs supported flattening/ALIAS or a www-first approach with an approved root redirect; do not promise universal apex support for free. Do not change customer nameservers merely to simplify onboarding. Keep Render direct domains as the baseline until a tested edge/origin trust design and actual apex quote justify a switch.

Sources: [Render custom domains](https://render.com/docs/custom-domains), [Cloudflare SaaS plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/), [apex restrictions](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/apex-proxying/).

## Independent business records and subscription boundary

Customers/vehicles, calendars, job photos, invoices, payment records, refunds, finance reports, review links and notification settings belong to one tenant; no matching customers across businesses by email/phone without an explicit future policy.

Keep two financial domains distinct:
- Platform subscriptions: Doc Incorporated sells access; subscription_accounts and provider webhooks determine versioned entitlement grants.
- Detailing payments: each business bills its own customers using its separately authorized merchant/connected account. Amount/currency/tenant/processor identifiers are checked server-side. Do not commingle settlement funds or store raw card data.

Invoices need immutable numbered snapshots and exact currency amounts; payment/refund events need idempotent, append-only auditable records and reconciliation. Finance reports derive from scoped records. These modules do not exist yet; future tests must verify amounts, processor account boundaries and replay handling.

Joseph receives an explicit complimentary_testing entitlement grant with scope, approver, reason and revocation/review policy, independent of any subscription account. No fake paid subscription, zero-dollar charge, fabricated customer invoice or permanent email-based bypass. Subscription cancellation must not erase historical business records. Billing activation, provider choice, commercial pricing and grace-period/read-only policy require a later product decision. No billing adapter/account/charge was activated here.

## Backup and scale plan

Pilot: retain tested encrypted SQLite restore and private data volume. Existing two-copy guard pauses rather than deleting; approve an operator retention/monitoring policy before unattended production. The 10 GB draft volume is not an unlimited photo/backup allowance.

Commercial: managed database PITR plus encrypted logical exports to a separately credentialed recovery bucket/account; media copies/version manifests with independent retention. Store encryption keys outside the backup destination. Restore all-tenant backups only into an isolated environment with sending disabled. Recover a single tenant through a validated export/import pipeline, remapping/verifying relationships and object checksums, never overwriting the live shared database. Test another tenant's invariance, revoke affected sessions and hold replayed deliveries. Provisional objectives: RPO <=24 hours and RTO <=4 hours; these are targets, not proven guarantees. Improve database RPO via PITR without assuming that protects media.

At 10 businesses, measure query latency, DB lock waits, memory and image queues; keep one deployable codebase. At 100, load-test worker fairness and multi-instance app behavior before adding replicas. At 1,000, plan connection pooling, stateless replicas, bounded image workers, spend/abuse limits and an HA database if the promised availability requires it. Tenant count is not a benchmark; rates and photo volume drive sizing. No database shard/per-tenant deployment until measurements or contractual isolation require it.

## Sequencing and release blockers

1. Complete Joseph's private hosted HTTPS, restart persistence, physical iPhone notifications/HEIC, real approved email and remote restore acceptance. Verify his actual business settings/assets. Purchase/deploy/DNS/communication approvals remain separate.
2. Begin the independently identified native iOS foundation AFTER shared backend/device acceptance. Use an explicit business membership in the native API contract; do not hardcode Baucom into the app. Keep native source/signing/TestFlight approvals as previously documented.
3. Extract tenant context and configurable template with legacy Baucom behavior preserved. Prove two-tenant isolation and domain lifecycle. Prepare approved reversible database/media migration: rehearsal on a fresh copy, record/byte reconciliation, stopped-write cutover, backups, rollback window and no dual-write improvisation.
4. General paid release requires completed isolation/provisioning, approved migration, restore drills/alerts/quotas, privacy/retention/support terms, financial/payment integrity tests and independently reviewed subscription entitlements. These are commercial blockers, not reasons to rebuild Joseph's accepted website.

Verification for this review: npm.cmd test — 46 passed, 0 failed, 0 skipped. No application/schema behavior changed. Cost details and explicit assumptions: commercial-operating-costs.md. No purchases, deployment, Git push, DNS, billing or data migrations performed.
