# Off-machine encrypted development backups — prepared only

## Proposed storage and approval boundary

Use a dedicated **private AWS S3 development bucket**, separate from production storage/credentials, with the fixed key prefix `docdetailing/device-test/`. No bucket, account role, external backup or scheduled upload has been created. Bucket/account/region, costs, retention and transfer of the encrypted data must be approved before provisioning or uploading.

After approval, configure the bucket through the owning account:

1. Enable all four S3 Block Public Access controls using `config/backup-public-access-block.example.json`. Use Bucket owner enforced Object Ownership (ACLs disabled).
2. Keep default server-side encryption enabled; the uploader also requests SSE-S3 AES256. Application-level AES-256-GCM encryption remains independent of the provider.
3. Enable versioning. Select a development retention policy before adding lifecycle expiration; no deletion policy is applied by these templates.
4. Apply the TLS-only bucket policy template after replacing `REPLACE-PRIVATE-DEV-BUCKET` in both resource ARNs. Keep public access blocked.
5. Issue separate development credentials scoped to only PutObject/GetObject under the development prefix, using `config/backup-iam-policy.example.json`. No delete, bucket administration, account-wide listing or production prefix permission is required by this adapter. Prefer short-lived credentials and set `DEV_BACKUP_SESSION_TOKEN` where applicable.

Official security reference: https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html

## Local configuration

Fill these only in ignored `.env.device-test` or the current private terminal session:

```dotenv
DEV_BACKUP_BUCKET=YOUR-DEDICATED-PRIVATE-DEV-BUCKET
DEV_BACKUP_REGION=YOUR-APPROVED-AWS-REGION
DEV_BACKUP_ACCESS_KEY_ID=DEVELOPMENT-SCOPED-KEY
DEV_BACKUP_SECRET_ACCESS_KEY=DEVELOPMENT-SCOPED-SECRET
DEV_BACKUP_SESSION_TOKEN=
ALLOW_OFF_MACHINE_BACKUP_UPLOAD=false
```

The adapter ignores global `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`; it will not silently use another project’s credentials. `BACKUP_PASSPHRASE` must be loaded privately (20+ characters) and kept independently in a password manager. It must never be uploaded beside the encrypted backup or stored in command arguments/history. Runtime ngrok/VAPID/email/gate secrets are intentionally excluded from database backups; manage their recovery separately. Recreate/re-enroll device push if those keys are unavailable after a loss.

## Create and upload only after explicit approval

Create a backup of the isolated device database (the destination must be new):

```powershell
npm.cmd run backup -- create data/device-test/docdetailing.sqlite data/device-backup-YYYYMMDD-HHMMSS
```

This existing command uses the online SQLite snapshot API, includes all original/preview photos and application records, verifies integrity/foreign keys, and produces `database.enc` plus `manifest.json`. Its temporary snapshot must be on protected local storage; see `backup-recovery.md`.

After approving the actual bucket/prefix and this upload, set `ALLOW_OFF_MACHINE_BACKUP_UPLOAD=true` for the operation, and run:

```powershell
node --env-file=.env.device-test scripts/backup-remote.js upload data/device-backup-YYYYMMDD-HHMMSS acceptance-YYYYMMDD-HHMMSS
```

Only `database.enc` and `manifest.json` are addressed—never raw SQLite, photos, `.env` files, the local access code or VAPID/email keys. The adapter checks the format/ciphertext checksum, requests server-side encryption, sets object checksums and refuses overwrites using conditional writes. The manifest is uploaded last so a failed first upload does not look complete. A provider error can leave an incomplete encrypted prefix; do not delete or overwrite it automatically. Use a new unique backup ID for a new attempt and reconcile the earlier prefix manually through the approved retention process. Return the upload flag to false afterward.

## Verify actual off-machine recovery

A successful PUT is not a recovery test. Retrieve the backup from S3 into a **new local download directory** and restore into another **new directory**:

```powershell
node --env-file=.env.device-test scripts/backup-remote.js verify acceptance-YYYYMMDD-HHMMSS data/remote-download-YYYYMMDD-HHMMSS data/remote-restored-YYYYMMDD-HHMMSS
```

The command reads from S3, streams the returned ciphertext to disk, authenticates/decrypts with the independently held passphrase, validates SQLite integrity and foreign keys, and performs the established safe restore. It revokes sessions, disables device subscriptions and holds outbound delivery. It does not overwrite the current device-test or normal development database.

Reopen the restored database/server locally with outbound sending off. Compare booking/customer/vehicle counts and known IDs, status/audit/notification history, business settings/catalog, reviews/moderation and original/preview media SHA-256 values against the source snapshot. Exercise owner login and private photo retrieval. Record bucket, prefix, backup ID, source commit, UTC backup/retrieval/restoration times and comparison result; do not include secrets. Do not resume message delivery from a restored verification database. Follow `backup-recovery.md` for a later deliberate operational cutover.

## Evidence and remaining work

`test/backup-remote.test.js` uses an in-memory S3 stand-in to assert that uploads are off by default, only the two encrypted backup artifacts are transmitted with the protected development prefix/no-overwrite/encryption settings, and downloaded bytes restore a fresh database with the booking preserved and messages paused. It also rejects reliance on global/production credential variables. Existing recovery tests verify exact original/preview photo bytes, settings, reviews, history, wrong passwords, tampering and overwrite rejection.

This is **adapter and recovery preparation**, not actual off-machine storage verification. A real approved bucket round trip, credential scope, provider checksums/versioning, off-machine availability, recovery ownership and retention remain to be verified after authorization. No recurring automation or external upload was enabled.
