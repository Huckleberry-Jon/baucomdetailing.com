# Device testing preparation verification — October 28, 2026

The existing architecture was retained. This pass prepared an isolated access-controlled device-test profile, added HEIC/HEIF conversion and prepared private off-machine encrypted backup transfer/recovery. No remote exposure, deployment, Git push, DNS change, cloud bucket creation/upload or live customer communication occurred. Native app work has not started.

## Verified locally

- `npm.cmd test`: **38 passed / 0 failed**, including all prior 30 tests.
- Original booking/calendar/review/photo/backup tests still pass.
- New HEIC tests decode a real small upstream synthetic HEIC file to JPEG, check dimensions/metadata, preserve exact original bytes and reject corrupted input.
- New device tests confirm no global/local/production credential/database inheritance; default-off email/push and recipient allowlists; signed expiring tester cookies; website/API gate enforcement with separate owner authorization and signed webhook checks.
- New failure durability test simulates push/email provider failures plus worker outage, closes/reopens an on-disk database and verifies confirmed booking, history, notifications and retries persist.
- New remote adapter test uses an in-memory S3 stand-in: no upload by default, ciphertext/manifest only, scoped prefix/encryption/no-overwrite settings and actual fresh restoration from downloaded test bytes. No real bucket was used.
- `npm.cmd run device:prepare`: succeeded twice idempotently after correcting file-level Windows ACL handling; existing development keys were preserved. Gate access-code/hash consistency was checked without displaying secrets. Device data/keys/access-code files are owner-only and Git-ignored.
- `npm.cmd run device:preflight`: intentionally exits nonzero while DEV_ORIGIN is the invalid placeholder. It reports `exposure: NOT STARTED`; this is a configuration prerequisite, not an automated-test regression.
- Source syntax and formatting checks completed; no browser/device claims are inferred from these checks. The protected page/API was exercised by HTTP tests. No external HTTPS tunnel was opened for a browser test.

## Activation still requires approval/input

1. Choose and approve the stable assigned ngrok development URL, account, authorized testers and time window; install/authorize the official ngrok agent. Starting the gated tunnel is a distinct exposure action requiring approval. No business DNS is needed.
2. Configure development-only contact/sender/provider settings privately, provision the isolated owner and business schedule, run preflight, then start the device app and approved tunnel with communications off.
3. Approve test push to Joseph’s device and separately the exact email sender/allowlisted recipients/messages before changing send flags. Complete Home Screen/background-alert/deep-link/confirmation/customer-mailbox/renewal/HEIC testing on his actual iPhone.
4. Choose/approve a dedicated private S3 development bucket, region, limited credentials and retention. Separately authorize an encrypted upload and read-back restore. The remote adapter test is not actual off-machine storage acceptance.

Exact configuration/commands: `device-test-environment.md`.
Off-machine bucket/credentials/upload/retrieval/recovery: `off-machine-backups.md`.

## Files changed

- `.env.device-test.example`
- `.env.example`
- `.gitignore`
- `config/backup-bucket-policy.example.json`
- `config/backup-iam-policy.example.json`
- `config/backup-public-access-block.example.json`
- `config/ngrok.device-test.example.yml`
- `docs/architecture.md`
- `docs/device-preparation-verification.md`
- `docs/device-test-environment.md`
- `docs/iphone-verification.md`
- `docs/off-machine-backups.md`
- `package-lock.json`
- `package.json`
- `public/dev-access.html`
- `public/dev-access.js`
- `public/index.html`
- `public/photos.js`
- `README.md`
- `scripts/backup-remote.js`
- `scripts/device-preflight.js`
- `scripts/prepare-device-test.js`
- `scripts/setup-owner.js`
- `src/backup-remote.js`
- `src/dev-access.js`
- `src/heic-worker.js`
- `src/heic.js`
- `src/media.js`
- `src/notifications.js`
- `src/private-files.js`
- `src/runtime-config.js`
- `src/server.js`
- `test/backup-remote.test.js`
- `test/device-environment.test.js`
- `test/fixtures/heic/COPYING`
- `test/fixtures/heic/rainbow.heic`
- `test/fixtures/heic/README.md`
- `test/heic.test.js`
- `test/notification-durability.test.js`
