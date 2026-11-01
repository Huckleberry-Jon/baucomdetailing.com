# DocDetailing independent production recovery

Updated November 1, 2026. Applies only to Baucom / DocDetailing.

## Architecture and controls

The GitHub workflow `.github/workflows/production-backup.yml` runs daily at 07:30 UTC and can be dispatched manually. Activation requires repository variable `DOCDETAILING_BACKUP_APPROVED=true`. Concurrency prevents overlapping runs. Credentials are encrypted Actions secrets; no credentials or recovery passphrase belong in Git or artifacts.

The Worker provides a separately authenticated, read-only `/api/recovery/snapshot` endpoint restricted to the configured business. One D1 batch reads its records consistently. Review moderation is scoped through reviews; global transient rate limits are omitted. The runner does not need D1 Write permission. R2 credentials read only the production media bucket, and only referenced media is archived.

The destination is private Backblaze B2 bucket `docinc-docdetailing-production-recovery` in us-east-005. Object Lock enforces 30-day COMPLIANCE retention. Each upload also requests COMPLIANCE retention, and its exact returned version is checked before recording success. The bucket-scoped console writer has delete/admin capabilities; immutable retention, rather than a no-delete credential, protects retained versions. Existing buckets and master keys are unchanged. No automatic pruning is configured; review storage growth monthly before approving a lifecycle policy.

Every database manifest and photo is encrypted with AES-256-GCM and a scrypt-derived key. Version receipts contain ciphertext hashes, sizes and exact version IDs; they contain no customer records or decryption key. Receipts are preserved in GitHub artifacts for 90 days, outside B2. Preserve selected receipts independently for longer recovery history.

Each run downloads exact archived versions using a separate bucket-scoped reader, authenticates/decrypts everything, restores a fresh SQLite database, and verifies database integrity, foreign keys and media checksums. Sessions are revoked, domains detached and outbound deliveries held in recovery. Only after restoration and artifact upload does the runner send an authenticated heartbeat to the Worker. An hourly independent Worker check alerts the project owner if no verified backup has reported within 36 hours; accepted alerts are deduplicated daily. A stopped GitHub schedule therefore does not silently remain healthy while the Worker and email provider operate.

## Independent recovery key custody

The protected local recovery kit is under ignored `data/backup-key-escrow/`. Save its recovery passphrase and B2 reader details in a phone password manager, with a sealed paper passphrase copy stored separately. Confirm the password-manager entry can be opened without this PC. GitHub Actions secrets cannot be read back and are not a substitute for recoverable custody. Never send the passphrase in chat, email, logs or an issue. B2 credentials expire November 1, 2027; arrange renewal before expiry without replacing unrelated keys.

## Recovery procedure

1. From a trusted replacement machine, obtain the intended source revision from the DocDetailing repository. Install Node 24 and run `npm ci --ignore-scripts`.
2. Download a successful run's `recovery-version-receipt` artifact. Select its exact backup ID. Get the independently held passphrase and B2 read-only credentials from the recovery kit/password manager.
3. In a private process environment, set `BACKUP_PASSPHRASE`, `RECOVERY_ENDPOINT=https://s3.us-east-005.backblazeb2.com`, `RECOVERY_REGION=us-east-005`, `RECOVERY_BUCKET=docinc-docdetailing-production-recovery`, `RECOVERY_ACCESS_KEY_ID` and `RECOVERY_SECRET_ACCESS_KEY` to the reader, and `RECOVERY_VERSION_RECEIPT` to the receipt path. Never put secret values in command arguments or shell history.
4. Run `node scripts/cloud-backup.mjs restore-local BACKUP_ID data/recovery/NEW_UNIQUE_DIRECTORY`. The target must be new. Restoring locally never overwrites production.
5. Verify counts, financial records, settings, reviews, booking history and original/preview photos. Keep domains detached and communications off. Only a separately approved cutover may reconnect recovered data to production.
6. Retain the receipt, source revision, timestamp and verification report without customer data or keys. Repeat an independent-machine drill after key custody is confirmed and after material schema changes.

Initial actual round trip on November 1: backup `a78f81e6-f537-4947-8852-36b32339e3d4`, 7 bookings and 48 media objects; full restoration passed. See the deployment verification report for the hosted runner and monitoring activation evidence. RPO is approximately 24 hours when daily runs succeed; overdue alert threshold is 36 hours. A four-hour operational recovery target remains provisional until an independent-machine timed cutover drill proves it.
