# Phase 1 shared architecture

The original Node 24 ESM server, SQLite migrations, buildless customer website and phone-accessible authenticated owner dashboard are retained. The website and future native client use the same records and event IDs. No DocInvoices infrastructure dependency was introduced.

## Durable records and migrations

Migrations 001–006 define business configuration, versioned services, customers, vehicles, bookings, status history, notifications/subscriptions/deliveries, owner sessions, rate limits and audit records; then private link keys, subscription lifecycle metadata, delivery attempts/leases and webhook receipts; calendar blocks; job/photo records; and reviews/moderation history. Never edit an applied migration. Add the next numbered migration for schema changes.

All tenant-facing operations scope the fixed initial business ID. Multi-business onboarding is not exposed. Composite business foreign keys and tenant-isolation acceptance tests remain mandatory before provisioning a second business.

Money uses integer cents. Original service/price snapshots remain immutable per booking. Proposal price/time and customer acceptance history are retained. Future finance/payment/invoice code must preserve accounting transactions, avoid double-counting purchased materials versus job allocations, exclude tax liabilities from revenue, and use signed/idempotent provider webhooks.

## Booking/calendar consistency

`BEGIN IMMEDIATE` serializes confirmations across SQLite connections. Busy timeout is configured before WAL initialization. Confirmations/proposals check working days/hours, dates, interval blocks, service duration, daily capacity and travel buffers. Proposals are rechecked on customer acceptance. Confirmed slots are held while proposed replacements are pending. Public availability returns time candidates without customer data and does not reserve them. The calendar queries a bounded date range rather than relying on the dashboard’s recent-booking limit. Owner deep links can fetch a booking outside that recent list.

## Notification contracts

Booking transactions create immutable history and inbox events atomically. A worker materializes unique event/channel/target deliveries with captured message payloads. Conditional delivery claims and bounded leases coordinate workers; provider calls happen outside database transactions. Attempts and failures persist, while booking data stays authoritative.

New device subscriptions record registration time so old events do not get replayed. Expired endpoints deactivate, and owner email fallback is configurable. Permission/expiry/key-change checks are in the dashboard; service-worker subscription-change handling renews when the owner session permits. Otherwise the owner must sign in and renew.

Customer emails use idempotency keys and include scoped links signed by a private, database-stored key with the booking’s expiration. Legacy hashed random tokens continue to work. Links expire after 30 days; owner link reissuance/recovery remains a later controlled feature. Email status updates use Svix verification on the raw body, deduplicate provider event IDs and reconcile early receipts. Email provider acceptance, mail-server delivery and actual user/device receipt are separate states.

Push cannot offer exactly-once delivery across a provider/crash boundary. Stable event tags reduce visible duplicates. Production rollout still needs bounded worker backlog/retention, monitoring and provider/device verification; the current worker scans event history and is intended for this local single-business volume.

## Private media and invoice preparation

Originals/previews are private SQLite BLOBs, indexed by business/booking/job and associated with customer/vehicle IDs. No directory path or public object URL is exposed. Server decoding verifies supported raster formats and pixel/byte limits. Previews strip metadata, auto-orient, resize and compress; originals remain unchanged. Booking plus intake media commits or rolls back together. Before/after media requires the confirmed job association. Invoice selections reference optimized previews; later invoice rendering can read these authenticated records without exposing original storage.

The initial public gallery remains a clearly marked placeholder until Joseph supplies authorized work. No customer photos publish automatically.

## Reviews and future invoice links

Public form submissions are consented, spam-limited, idempotent and pending. Public APIs only return approved content without booking/customer identifiers. Moderation decisions preserve actor, previous/new status, content-policy reason and timestamp. One-star reviews can publish using the same approval controls. Official HTTPS Google URLs are validated by host. The shared review-link function returns website/Google links for the future invoice renderer.

## Recovery boundaries

The SQLite online backup API captures records and media in one consistent snapshot. Encryption uses AES-256-GCM and scrypt with fresh salts/nonces. Restoration verifies checksum, authentication, integrity and foreign keys into a fresh directory, then revokes sessions, disables subscriptions and pauses outbound processing. Recovered deliveries require explicit review and retry; new-event sending is resumed separately. See `backup-recovery.md` for commands and tested recovery behavior. Environment provider secrets are managed separately and excluded from backup/source.

Loopback remains local-only. Real iPhone verification requires separately authorized secure development connectivity and development providers. No hosting/DNS changes were performed. Native apps, invoices/PDFs, materials, Square payments and finances remain later phases using these shared IDs and data contracts.
