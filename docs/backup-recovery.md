# Backup and recovery runbook

Backups include the entire SQLite snapshot: bookings, customers, vehicles, shared settings/catalog, jobs, original photos and optimized previews, reviews/moderation, notification events/attempts/receipts, owner password hashes and the private customer-link signing key. Provider secrets in process environment and source code are deliberately not bundled. Keep a separate secure record of provider configuration and the exact Git commit used.

## Create

From `C:\DocDetailing`, set `BACKUP_PASSPHRASE` privately in your terminal session (at least 20 characters; use a password manager). Do not put the passphrase in shell history, command arguments, tracked files or chat.

```powershell
npm.cmd run backup -- create data/docdetailing.sqlite data/backup-2026-10-28
```

The output directory must be new and its parent must exist. The SQLite backup API creates a consistent live database snapshot, including committed WAL data. The command verifies SQLite integrity and foreign keys, encrypts using AES-256-GCM with a random salt/nonce and scrypt-derived key, and writes `database.enc` plus `manifest.json`. It removes its temporary plaintext snapshot during normal completion/failure; use a directory with restricted filesystem access because an interrupted process could leave the temporary snapshot. Clear the environment variable afterward.

Keep both files together. Copies on the same disk are useful for local testing but are not disaster recovery. Before live use, choose and authorize a separate encrypted/off-machine destination, retention schedule and recovery owner. No external backup upload or recurring task has been configured.

## Restore without overwriting live data

Stop any server you intend to switch, preserve the current database, and restore into a **new** directory:

```powershell
npm.cmd run backup -- restore data/backup-2026-10-28 data/recovery-check
```

The command rejects existing target directories, checks ciphertext checksum, authenticates/decrypts the backup, runs integrity/foreign-key checks, then publishes `data/recovery-check/docdetailing.sqlite`. Wrong passphrases and tampered files fail. Failed attempts may leave an empty target directory; select a fresh directory for another attempt. Never copy a database over a running process or restore into an existing data directory.

Owner password hashes and private customer-link keys are preserved. Owner sessions are revoked, push subscriptions disabled, unfinished deliveries placed on `recovery_hold`, and automatic outbound processing paused. This prevents restored data from silently replaying customer messages.

For isolated recovery verification:

```powershell
$env:DATABASE_PATH='data/recovery-check/docdetailing.sqlite'
$env:PORT='4323'
$env:APP_ORIGIN='http://localhost:4323'
npm.cmd start
```

Sign in using the restored owner account. Check bookings, calendar, customers/vehicles, service settings, reviews, history, original photos and previews. Reconcile the recovered timestamp with any later external payment/notification activity. Review held deliveries individually. Use **Resume new-event delivery after recovery review** to enable new events; old unprocessed deliveries remain held until individually retried. Renew phone subscriptions from the actual installed device. Reconfigure provider environment variables separately. Do not run two servers against the same recovery workflow while switching data.

## Tested restoration

`test/backups.test.js` creates an on-disk source database with customer/vehicle records, confirmed booking, original/preview photo bytes, settings, notification history, owner session and subscription, review and moderation record. It creates an encrypted snapshot, restores into a fresh database, compares records/settings and exact media bytes, verifies private links still validate, verifies old sessions/subscriptions are disabled and outbound sending is paused, and rejects overwrite, wrong-password and tampered-backup attempts. All test files are isolated and cleaned up.
