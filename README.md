# DocDetailing — Phase 1 local development

Doc Incorporated LLC’s shared detailing platform, initially provisioned only for Baucom’s Mobile Detailing. Website and owner dashboard share one durable backend. No native app or production deployment is included.

## Run

Node 24+ is required. From `C:\DocDetailing`:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd start
```

Open http://localhost:4317 or http://localhost:4317/owner. The server binds to loopback. Configure environment variables in your terminal or use `node --env-file=.env src/server.js` with an ignored local environment file. `.env.example` lists supported variables without secrets.

## Owner setup and scheduling

No default owner is seeded. Set `OWNER_PASSWORD` privately in your terminal session (minimum 14 characters), run `npm.cmd run owner:setup`, enter the owner email, then clear the variable. Passwords are scrypt hashes and sessions expire after 12 hours.

Use owner Settings to configure Joseph’s actual service area, working days/hours, closed dates, daily capacity, travel buffers and service durations. Initial business data remains unconfirmed. The calendar shows pending requests, confirmed appointments, proposed times and blocked intervals in America/Chicago. Closing at 00:00 means midnight at the end of the working day. Pending/proposed times do not reserve capacity. A confirmed appointment’s original slot stays reserved while its proposed replacement awaits acceptance. Confirmations use atomic server-side checks and optimistic booking versions; availability is advisory and rechecked at confirmation.

## Notifications and fallback

Set development `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` using keys generated with `web-push`. The owner enables notifications from an explicit button press. The dashboard checks denied/default/granted permission states, missing/expiring subscriptions and VAPID changes; service-worker renewal attempts use the authenticated owner session. Renew again after owner session expiry. New subscriptions do not replay historical events.

For iPhone, use a separately authorized HTTPS development origin, install the owner dashboard on the Home Screen, sign in, and enable notifications there. Loopback browser tests do not prove iPhone delivery. No HTTPS tunnel, public exposure or device connection has been configured.

Customer confirmation/proposal/cancellation emails use `RESEND_API_KEY` and a verified `EMAIL_FROM`. Set `OWNER_NOTIFICATION_EMAIL` for owner email fallback. When configured, owner email accompanies customer-originated booking events, so successful push-provider acceptance is not the only alert channel. Missing providers create visible `blocked` delivery records. Inbox and bookings remain available independent of delivery failures. There is no SMS adapter.

Customer messages contain scoped, expiring private booking links. `RESEND_WEBHOOK_SECRET` enables signed Resend receipts at `POST /api/webhooks/email`. Signature checking uses the exact raw body; receipts are idempotent and can arrive before the send response is saved. `accepted_by_provider` is distinct from `delivered_to_mail_server`, which still does not prove a customer read the message or an iPhone displayed an alert. Attempts, failures, leases, inbox read state and receipts persist. Explicit owner retry controls are available. Push remains at-least-once around process crashes; stable event tags reduce duplicate visible notifications.

## Photographs

Customers can attach up to 6 JPEG/PNG/WebP photos while submitting a booking, maximum 4 MB each/16 MB combined. Image decoding/pixel limits run server-side before the atomic booking transaction. Originals are preserved privately; stripped, rotated previews are resized to 1600 pixels and JPEG-compressed. HEIC conversion is not implemented: export to JPEG first. Actual iPhone photo-picker behavior still needs a device test.

Owner booking records support private intake/before/after photos, a maximum of 24 per booking, authenticated preview/original download, stable customer/vehicle/job associations, and selection for future invoices. Job records are a minimal photo/booking association, not the native management application. Private originals and previews are SQLite BLOBs for this single-business local phase; they are included in the same consistent backup. No public media URLs or gallery publication controls are implemented.

## Reviews and invoice preparation

Public review submission requires display consent, validates ratings/content, uses rate limits/honeypot and idempotency keys, and starts pending moderation. Owner review management records every moderation action. All ratings can be approved; rejected content requires a policy reason rather than a low rating. An official HTTPS Google review URL is configurable. Public submissions are clearly customer-submitted; the backend also supports verified completed-booking submissions with an authorized booking link.

The shared review-link contract and invoice photo manifest prepare later invoice generation. PDF invoices and invoice issuance are not implemented in Phase 1. No photographs, final prices, testimonials, business hours or Google URLs have been fabricated.

## Backup and recovery

```powershell
npm.cmd run backup -- create data/docdetailing.sqlite data/backup-YYYY-MM-DD
npm.cmd run backup -- restore data/backup-YYYY-MM-DD data/new-recovery-directory
```

Set `BACKUP_PASSPHRASE` privately (20+ characters). Destinations must be new directories. Backups use consistent SQLite snapshots, integrity/foreign-key checks, AES-256-GCM and scrypt. Restores reject overwrite, wrong passwords and tampering, revoke owner sessions, disable subscriptions and pause delivery to avoid replaying old messages. See [the recovery runbook](docs/backup-recovery.md). Off-machine backup destination, retention schedule and production disaster recovery still require an operational decision; no external backup upload has occurred.

## Verification and remaining acceptance gates

The automated suite covers durable bookings, two-connection confirmation races, notification claims/retries/fallback/receipts, photos/limits/atomic rollback, private media authorization, reviews/moderation and real encrypted restore into a fresh database. Browser QA uses a separate synthetic database via `node test/serve-browser-fixture.js`; its fixture hours/durations/password are test-only and never used by `npm start`.

See [the continuation report](docs/phase1-continuation.md) for changed files and browser evidence. Phase 1 is **not fully accepted** until Joseph’s real iPhone receives a booking alert, opens the exact request, completes owner confirmation/proposal and verifies receipt of a real customer message through the configured channel. Device permission/renewal/expired-session paths must also be exercised. Joseph’s final business details/assets remain pending. Customer returning-identity verification, public authorized gallery publication and broader production hardening remain outside the completed work.

No push, deployment, DNS change, Netlify change, native app work, production credentials or other Doc Incorporated product changes have been performed.
