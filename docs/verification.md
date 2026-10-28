# First development pass verification — October 28, 2026

- Automated: `npm.cmd test`, **16 passed / 0 failed** on Node 24.21.0.
- Persistence: temporary on-disk database closed/reopened; request, customer, vehicle, history, notification and snapshot retained.
- Concurrency: two worker threads with independent database connections attempted overlapping confirmation; exactly one succeeded and one received a conflict.
- Security: unauthenticated private API rejection, cross-origin mutation rejection, owner login/logout, HttpOnly session cookie, protected customer access and untrusted push endpoints.
- Notifications: injected provider tests verified failure retry/error recording, deduplication, correct booking deep links, read/unread state and configured customer email adapter behavior. No live provider/device delivery was performed.
- Browser: local in-app browser at a mobile-sized viewport rendered the website and package catalog. A synthetic customer completed the actual booking form with an add-on; the page displayed `Request saved. Status: pending. This appointment is not confirmed.` and an expiring private booking link. The synthetic request remains in the ignored development database.
- Real iPhone install/push, customer email inbox receipt, desktop-specific visual QA, private media, reviews, calendar UX, backup recovery and production acceptance remain unverified or unimplemented as identified in README.
- Owner account is intentionally not pre-created. Provision it using `npm.cmd run owner:setup`; no password has been supplied or stored in tracked source.
- Initial local commit: `f348244` on `codex/website-foundation`. A follow-up commit formats source and records verification.
- No remote push, production deployment, DNS change, Netlify alteration, app release or other Doc Incorporated product changes.

Changed files: `src/` backend/auth/catalog/notification modules; `migrations/` database schema; `public/` customer website/booking links/owner PWA; `scripts/setup-owner.js`; `test/core.test.js`; npm manifest/lockfile; ignored-secret template; README, architecture and the original handoff.
