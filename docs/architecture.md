# Architecture and phased data plan

## Inspected state, October 28, 2026

`C:\DocDetailing` existed and was empty; it had no Git metadata or project instructions. The connected GitHub API confirmed `Huckleberry-Jon/baucomdetailing.com` is public and empty. The development implementation is independent of DocInvoices and Joseph’s existing Netlify site. Nothing has been pushed or deployed.

## First-pass choice

Node 24 ESM server, built-in SQLite, buildless browser JavaScript and a pinned Web Push library. This provides a small, runnable local vertical slice with persistent shared business records and no dependency on another Doc Incorporated product. Future iOS clients should use versioned authenticated API contracts over this backend, not their own booking database. The existing `/api` routes are an initial contract; freeze/version them before native app integration.

SQLite WAL plus `BEGIN IMMEDIATE` serializes write transactions across processes. No asynchronous provider calls occur inside booking transactions. Outbound delivery is separate from booking persistence. This first pass supports one local server/notification worker; horizontal deployment requires atomic delivery claims, leases, and migration to an appropriate managed database or single-writer design. Do not place SQLite on a network share.

## Current tables

`businesses`: shared settings and business scope.
`services`: package/add-on content with monotonically increasing versions.
`customers`: customer intake; no automatic identity merge.
`vehicles`: customer association and vehicle intake.
`bookings`: customer/vehicle relationships, idempotency key and request hash, original service snapshot, scheduling interval/buffer, status/version, expiring access hash, revision proposal.
`history`: immutable booking events, actor and customer acknowledgments.
`notifications`: event identity, booking deep link and read state.
`subscriptions`: protected push endpoint and subscription keys.
`deliveries`: event/channel/target uniqueness, retries, error status. Provider acceptance is not device delivery.
`owners`, `sessions`: business-scoped authentication with hashed password/session tokens.
`rate_limits`: durable IP request counters. Production proxy handling must use a trusted proxy configuration rather than trusting forwarded headers.
`audit_events`: owner configuration/catalog mutation records.
`migrations`: applied SQL versions. Apply files in order inside transactions; never edit an applied migration. Add a migration for every schema change.

IDs are UUIDs except predefined catalog/business keys. Monetary catalog values are integer cents. Every tenant-facing query must constrain the authenticated business. Public multi-business provisioning is not implemented. Future composite business foreign keys and tenant-isolation tests must accompany adding another business; currently only Joseph is provisioned.

## State and delivery contracts

A request is pending until explicitly confirmed. Proposals enter awaiting_acceptance and require a bearer-authenticated customer acceptance. Confirmations/revisions check future appointment time, working days, closed dates, working hours, travel buffer and capacity. Concurrent or stale transitions fail. Original snapshots remain unchanged. Accepted proposals retain price/time and acceptance history. Requested times do not reserve availability; a proposed time is checked again upon acceptance. Existing confirmed times remain reserved while proposals are pending.

Each committed booking event creates an inbox notification in the same transaction. Notification processing creates unique channel/target deliveries, retries transient failures with backoff, disables expired push subscriptions and preserves the booking on provider failure. Push payloads contain no customer identity, phone or address. Stable event IDs are used as notification tags. Provider crash windows can still redeliver a push; at-least-once delivery is the honest contract. Customer email uses an idempotency key. Provider status webhooks and native-device routing/preference deduplication remain to be added before production/native rollout.

## Later migration groups (planned, not implemented)

- Media: private object records scoped to customer/vehicle/job, original/derived variants, before/after labels, publication permission and expiring authenticated download grants.
- Jobs and operations: confirmed-booking association, operations, condition notes, materials and photos. Preserve lifecycle/audit corrections.
- Materials: purchased quantity/unit/cost, normalized unit conversions, usage allocations, markup and sale amounts. Use fixed decimal quantities and integer monetary amounts with explicit rounding. A purchase is a cash expense; job allocation is a profitability attribution, not a second cash expense.
- Estimates/invoices: immutable issued versions, sequential unique invoice numbers within a business, service/material/labor/travel/discount/tax lines, accepted estimate versions, photo selections, review links and correction transactions.
- Payments: provider transaction IDs, signed webhook receipts, idempotency keys, payment allocations, refunds and reconciliation. Hosted Square interfaces only. Never infer paid status from browser redirects.
- Finance: purchase/operating expenses, receipt attachments, tips, tax liabilities, payment cash ledger and reporting projections. Separate invoiced sales, collected cash, taxes, tips, material allocations and labor estimates. Financial calculations and period-boundary tests are mandatory before shipping these features.
- Reviews: verifiable submissions, moderation reasons, explicit public-display/photo consent and abuse controls without suppressing legitimate negative feedback.

Native app lives in a separate repository and reuses booking/customer/vehicle/event IDs. No separate app database of record. Native push is another delivery adapter, with preferred-device/channel rules to avoid cross-channel duplicate alerts.

## Security/release boundaries

Loopback HTTP is for local development. Production or real-phone tests require an authorized secure origin, correct APP_ORIGIN, reverse proxy/TLS, secrets management, backups, owner recovery and session hardening. Never cache private API responses in a service worker. Never publish database files or private media. Unknown contact information, hours, photos and testimonials remain explicitly pending.

No Square integration, payment handling, production deployment, DNS edits or native app release has been performed. Preserve these boundaries until separately authorized.
