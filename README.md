# DocDetailing — local development

Private development software owned by Doc Incorporated LLC. First business: Baucom’s Mobile Detailing. Public branding uses the business name; DocDetailing is only the internal identifier.

## Run

Requires Node 24+. From `C:\DocDetailing`:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd start
```

Open http://localhost:4317 or http://localhost:4317/owner. The server binds only to loopback. No deployment configuration or DNS changes are included.

## Owner setup

No default owner or password is seeded. Set `OWNER_PASSWORD` privately in your terminal session to a unique password of at least 14 characters, run `npm.cmd run owner:setup`, and enter the owner email. Remove the environment variable afterward. The script refuses to overwrite an existing owner. Passwords are scrypt hashes; sessions expire after 12 hours. Test fixtures use synthetic accounts in isolated databases.

Before confirming appointments, sign in and configure actual working days, opening/closing minutes, closed dates, daily capacity, and travel buffers under Settings. Confirm the service area. Initial durations and hours are intentionally unset.

## Configuration

`.env.example` lists names only. The server reads process environment variables; it does not automatically load `.env`. Node supports `node --env-file=.env src/server.js` for an ignored local file. Never commit secrets. Local customer data and database files live in ignored `data/`.

Generate development VAPID keys using the installed `web-push` library. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`. The owner can enable/refresh a browser subscription after an explicit button press. iPhone testing requires an approved HTTPS development origin, Home Screen installation, permission, and a real device. The current loopback preview does not prove iPhone delivery.

Optional customer email uses Resend with `RESEND_API_KEY` and `EMAIL_FROM` (verified sender). Use provider test credentials and controlled test recipients. Without configuration, customer delivery records remain `blocked`. Provider acceptance is labeled `accepted_by_provider`, never `delivered`. Delivery receipts/webhooks are not implemented. No SMS provider is implemented. The private booking link is shown once at submission and expires in 30 days; customers must save it. Emails refer customers to that saved link.

## Implemented first pass

- Supplied packages, complete inclusions, price ranges, quote-only add-ons, condition disclosures, shared owner catalog editing.
- Responsive website with working navigation and a booking form; authentic-photo/review placeholders.
- Durable SQLite database, ordered transactional migrations, foreign keys, scoped business IDs, booking price/version snapshots.
- Customer/vehicle intake; pending requests; owner confirm/reject, proposal, customer acceptance, cancellation, in-progress, completed and no-show transitions; optimistic versions and audit history.
- Expiring customer access links with hashed tokens. No returning-customer matching by unverified email/phone.
- Confirmations use `BEGIN IMMEDIATE` plus conflict, buffer, hours, closed date and capacity checks. Existing confirmed slots remain reserved during a proposal.
- Authenticated phone-accessible owner dashboard, request details/history, notifications, read/unread, delivery log, settings and catalog editors.
- Installable manifest, push service worker, subscription checks, persistent notification outbox, retries, provider error logs; configured customer emails.
- Booking/security/notification automated tests, including two independent database connections racing to confirm the same slot.

## Still required before Phase 1 acceptance

This is the first functional development pass, not Phase 1 completion or release readiness.

- Real iPhone install/push verification and configured customer email delivery verification.
- Private photo upload/storage, image processing and permission-based gallery publication.
- Customer review submission, moderation and verified Google review integration.
- Customer change-request workflow beyond cancellation, proposal acceptance and owner rescheduling; authenticated returning-customer verification.
- Calendar presentation and richer availability discovery. The current form accepts a preferred time; owner confirmation enforces configured availability.
- Settings/catalog currently use validated JSON editors. Replace with polished one-handed controls, complete per-field validation and comprehensive audit diffs.
- Business details/assets/hours/durations/service area from Joseph.
- Backup/restore commands and tested recovery; production authentication hardening and deployment architecture review.

Native app, jobs beyond booking lifecycle, materials, estimates, invoices/PDFs, Square payments, and financial reporting are later phases. See `docs/architecture.md` for the shared data plan. Do not deploy, modify DNS, change the existing Netlify site, or create release builds without approval.
