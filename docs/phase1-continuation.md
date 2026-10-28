# Phase 1 continuation — October 28, 2026

## Result

Continued the existing architecture in `C:\DocDetailing`; did not rebuild the first-pass booking backend. Notifications, calendar, private photos, reviews and encrypted backup/recovery now have working local implementations. **Real iPhone and configured provider acceptance are still pending**, so Phase 1 is not declared fully accepted.

## Functionality delivered

- Notifications: customer emails contain scoped expiring private links; push events retain exact booking/event identity; subscription registration/renewal timestamps prevent historical replay; permission/expiry/key-change handling; durable conditional claims/leases, attempt/error history, expired endpoint handling; configurable owner email fallback; signed/idempotent Resend receipts distinguish provider acceptance from mail-server delivery; visible blocked/retry/recovery states and owner retry controls.
- Calendar: confirmed/pending/proposed appointments, working days/hours, closed dates, interval blocks/personal time off, service durations, travel buffers and daily capacity; customer availability candidates; atomic conflict prevention on confirmation/acceptance; existing confirmed slots remain reserved while revisions await acceptance. Settings cannot silently close a day containing a confirmed appointment.
- Photos: optional customer upload in the booking form; server decoding, format/byte/pixel limits; original preservation and optimized stripped previews; atomic booking/media storage; private authenticated viewing/download; customer/vehicle/job associations; before/after labels and future invoice selection manifest.
- Reviews: public submission, display consent, spam/rate protections and idempotency; audited moderation with content-policy reasons; one-star review publication using the same approval controls; configurable official Google review URL and shared future invoice review links.
- Backups: consistent online SQLite snapshots including original/preview media, AES-256-GCM encryption and scrypt key derivation, checksum/integrity/foreign-key verification, restore to a new directory only. Restores preserve data/private link keys, revoke sessions, disable device subscriptions and pause outbound messages until reviewed.

## Tests run

`npm.cmd test`: **30 passed, 0 failed** on Node 24.21.0.

- Booking persistence, idempotency, price snapshots, lifecycle and private links.
- Two independent database connections confirming overlapping requests: exactly one succeeds.
- Notification failure/retry, leases/two-worker claims, owner fallback, correct deep link, subscription replacement/no historic replay, signed email receipt validation/deduplication, read state and delivery status honesty.
- Calendar block conflicts, capacity/travel buffers, closed-date protection, date validation, Central-time DST day boundaries and unknown durations.
- Real raster decode/resize, original byte preservation, limits/SVG rejection, photo deduplication, job/invoice associations and complete rollback on failed media insertion.
- HTTP booking/photo upload, owner login/session controls, unauthenticated private photo rejection, authenticated JPEG retrieval, confirmation/calendar access, review submission/moderation and forged webhook rejection.
- Encrypted snapshot restored into a fresh on-disk database; customer/vehicle/booking/settings/history/review/moderation records and exact original/preview bytes compared; customer links remain valid; old sessions/subscriptions disabled and outbound messages held; wrong password, tampering and overwrite rejected.

Formatting: Prettier check passed for all source, public JS/HTML/CSS/JSON, scripts, tests and Markdown documentation. Browser JavaScript syntax was also checked with Node.

An expanded test run initially exposed a SQLite-open locking race. Busy timeout initialization was moved ahead of WAL initialization and migration application now rechecks inside the transaction. The full suite passed after the fix.

## Browser verification

Used an isolated synthetic database/server on loopback port 4321; no provider credentials and no real customer contact data.

- Signed into the actual owner form.
- Changed calendar month and confirmed the pending synthetic booking. Verified both the request and calendar showed confirmed status with the 90-minute interval (synthetic fixture duration only).
- Opened the exact-booking deep link and verified it scrolled to the correct confirmed request.
- Verified missing push keys/customer email/owner fallback are shown honestly rather than as successful deliveries.
- Opened private-photo and invoice-selection controls. Upload/preview access itself was verified through the HTTP tests; actual iPhone file-picker behavior remains pending.
- Submitted a one-star review through the public form with explicit consent, approved it in owner review management, then verified public display retained the one-star rating.
- Refreshed the main port-4317 preview and verified availability, photograph intake and review controls are present.

Screenshots are in this chat’s visualization directory: `phase1-owner-browser-test.png` and `phase1-review-browser-test.png`. They show synthetic test records only. The isolated QA server is stopped after verification; the normal loopback preview remains running.

## Remaining blockers and limits

- Joseph’s iPhone is not connected to this session. Actual Home Screen installation, permission grant/denial, background push arrival, notification tap through expired owner login, renewal/revocation and customer acceptance alerts are **not verified on a physical device**.
- No reachable HTTPS development origin, VAPID environment keys, Resend test credentials/verified sender, owner fallback recipient or signed live webhook configuration is present. No real outbound messages were sent. Live provider retries/receipts and customer mailbox receipt remain to be exercised.
- JPEG/PNG/WebP are supported. HEIC conversion is not implemented; real iPhone selection/conversion needs verification. Public gallery publication/consent workflow is not included, and no private photo is published automatically.
- Joseph’s confirmed business details/hours/durations/assets and official Google review URL remain pending. QA fixture hours/durations are synthetic and isolated from the normal development database.
- Backups were restored/tested locally. Off-machine destination/retention/operational recovery ownership still need selection; no external backup upload or recurring automation was created.
- Invoice photo/review integration is prepared as shared data/functions; invoice PDFs, payments, finance and native app work remain later phases.

## Exact next step

Authorize a secure **development-only** origin reachable by Joseph’s iPhone, configure development VAPID/Resend settings without sharing secrets in chat, and execute `docs/iphone-verification.md` with Joseph and a controlled customer recipient. Record the actual iPhone alert, exact booking opened, owner confirmation/proposal, customer receipt and persisted delivery/history IDs. Do not mark Phase 1 accepted until that controlled device workflow passes.

No remote push, deployment, DNS change, Netlify change, native app work, release build or other Doc Incorporated product modification occurred.

## All files changed in this continuation

- `.env.example`
- `docs/architecture.md`
- `docs/backup-recovery.md`
- `docs/iphone-verification.md`
- `docs/phase1-continuation.md`
- `migrations/003-notification-reliability.sql`
- `migrations/004-calendar.sql`
- `migrations/005-private-photos.sql`
- `migrations/006-reviews.sql`
- `package-lock.json`
- `package.json`
- `public/app.js`
- `public/calendar.js`
- `public/index.html`
- `public/owner.html`
- `public/owner.js`
- `public/photos.js`
- `public/reviews.js`
- `public/style.css`
- `public/sw.js`
- `README.md`
- `scripts/backup.js`
- `src/backups.js`
- `src/bookings.js`
- `src/calendar.js`
- `src/customer-links.js`
- `src/db.js`
- `src/media.js`
- `src/notifications.js`
- `src/reviews.js`
- `src/server.js`
- `test/backups.test.js`
- `test/helpers.js`
- `test/http-phase1.test.js`
- `test/media.test.js`
- `test/phase1.test.js`
- `test/reviews.test.js`
- `test/serve-browser-fixture.js`
