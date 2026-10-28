Current execution update: see execution-report-2026-10-28.md for the expanded 27 Cloudflare / 47 Node / 8 Flutter checks and remaining release gates. The following is the earlier migration checkpoint.

# Cloudflare migration development report
October 28, 2026. Local development only; production is NOT deployed or approved.

## Delivered

- New Fetch Worker alongside the unchanged Node application: D1 booking intake/lifecycle/private links, calendar/availability/blocks/settings, owner authentication, reviews/moderation, private/public photo workflows and subscription/delivery APIs.
- Tenant-scoped host resolution and relationships. D1 revision-guarded batches revalidate concurrent mutations and commit booking/customer/history/outbox atomically. No mutable global business selector.
- Private immutable R2 originals/previews with checksums, bounded decoding and explicit website publication consent. Upload drafts remain private; original media never becomes a public gallery URL.
- Cron-ready notification cursor, retry leases/fenced claims, attempts/failure logs, exact-booking push payloads, owner-email fallback, Resend HTTP integration and signed/tenant-checked receipts. Both channels are disabled in prepared configurations.
- Authenticated encrypted independent backup coordinator and local full D1/R2 restoration. Fresh-target guards, revoked sessions, held delivery and detached production domains prevent replay/exposure.
- Separate loopback Wrangler profile on 4334 with private credentials, actual persisted D1/R2 and unconfirmed real business settings. Synthetic browser fixture on 4335 is separate.
- Production apex/www template, static preflight and inactive independent backup workflow. Render remains fallback-only.
- Independent Flutter iOS scaffold, demo dashboard, HTTPS transport/preview gate, versioned booking commands, tests and inactive Codemagic validation/unsigned build preparation. No signing or archive.

## Verification

- Existing Node suite: 47 passed, 0 failed. Preserved throughout; patched Svix dependency remains compatible.
- Local Cloudflare runtime suite: 22 tests, including the full migrated booking lifecycle/conflicts, stale versions, capacity/buffers/hours, proposal reservation/acceptance, customer authorization, reviews, tenant separation/FKs, actual Images JPEG previews/R2 bytes, full encrypted restore, secure preview cookies/assets, rollback, scheduling/settings races and DST, encrypted push retry/renewal, and signed/early receipt reconciliation and explicit tenant notification opt-in.
- Persistent Wrangler profile: tester gate and separate owner authentication passed; two test bookings saved, confirmation conflict rejected, history persisted; original settings restored and synthetic bookings cancelled. Actual process restart preserved the booking/status.
- Browser QA: tester gate -> website form -> pending request -> owner login -> confirmed booking and inbox. Outbound logs remained blocked. Saved screenshot shows only synthetic data.
- Flutter: clean analysis and 3 tests passed. No iOS build on this Windows host.
- npm audit: zero vulnerabilities, including development dependencies, after pinning current Wrangler/Miniflare and patched Svix.
- cloud:build produced the production-only bundle. cloud:preflight intentionally fails until approved account/D1 IDs replace placeholders; no network calls or deployment.
- Real HEIC fixture through local Cloudflare Images returned 400 with zero partial bookings. Node HEIC tests still pass. Managed-provider HEIC acceptance is an explicit release blocker, not counted as a successful cloud photo acceptance test.

## Remaining limitations

Remote Cloudflare resource ownership/quotas, domain zone/certificates/routing, actual Images HEIC/metadata behavior, real iPhone permission/renewal/deep links, email sender/receipts and independent B2/runner restore still require approved external verification. A running local instance is not proof of hosted availability.

Backup runner monitoring/status reporting, retention/capacity and a timed off-provider drill must be configured before unattended production. Old Node data has not been imported or removed. General commercial self-service provisioning, subscriptions, invoices, payments/finances and full native feature set remain pending; Joseph is not a paid subscription record.

## Exact next step

Review docs/cloudflare-publish-runbook.md and the production template. Supply/verify the approved account/resource identities and domain-routing approach, then rerun static preflight. Approve the specific private HTTPS preview deployment only after that configuration review. External communications, independent storage activation, DNS/public launch and iOS build/upload remain separate approvals.

No purchases, paid features, external backup uploads, Git pushes, DNS changes, Netlify changes, production data migrations/deployments, iOS archives or TestFlight submissions occurred.

Browser proof (synthetic data): C:/Users/Huckl/.codex/visualizations/2026/10/28/01a18424-61f7-72e2-9159-18dbe7721e1d/cloudflare-booking-proof.png
