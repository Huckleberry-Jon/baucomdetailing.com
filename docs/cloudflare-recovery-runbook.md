# Independent D1 / R2 recovery
October 28, 2026. Implemented locally; external destination not activated.

cloudflare/recovery.mjs exports a consistent D1 batch snapshot and only referenced immutable R2 objects. Each original is checked against its stored checksum. Every file and the metadata manifest are encrypted with AES-256-GCM, fresh nonces and scrypt-derived keys. Authentication binds each ciphertext to its backup ID/path. Encrypted uploads are read back before the final completion marker. No clear customer data or passphrase is in the completion marker.

scripts/cloud-backup.mjs is a Node-side coordinator for a hosted runner, not a Worker request handler. It obtains a consistent D1 SQL export through the official polling export API and reads source R2 using separate read-only credentials. Destination credentials target an independent B2 account/bucket, append/read only without delete permission. Source and recovery credentials must be distinct; escrow the encryption key outside both accounts. D1 exports can briefly block requests; measure the window at Joseph's actual volume.

Run only after external upload approval:
- Set approved credentials privately using deployment/cloud-backup.env.example as the field list.
- Set ALLOW_EXTERNAL_BACKUP_UPLOAD=true and a meaningful BACKUP_APPROVAL_REF.
- Run node scripts/cloud-backup.mjs create. It prints only the backup ID/object/booking counts.
- Download/read-back and run node scripts/cloud-backup.mjs restore-local BACKUP_ID data/recovery/NEW_NAME with separately authorized read credentials.
- The target must be a NEW directory. Existing data is never overwritten.

The inactive workflow template has no daily schedule. Approve the destination, least-privilege keys, hosted runner, retention and operator before activation, then configure daily execution and an independent backup-age/failure alarm. The runner exits nonzero on failure; its completion must be monitored. Backup status is not yet reported automatically to the website's backup_runs dashboard; use the runner/independent monitor until that reporting integration is configured. Do not interpret an empty dashboard status as a successful backup.

Restoration authenticates all files before touching the fresh target. It revokes sessions, disables subscriptions, holds all deliveries, marks restored notifications as already enqueued and detaches production domains. Import is a single batch for the reviewed small initial data set; batches above 10,000 statements are refused and require a reviewed isolated bulk procedure. Recovered storage is quarantined and must never be served as production automatically. Media keys are rewritten to the selected local/staging namespace.

Local verification used independent encrypted files outside the Cloudflare runtime, then imported into NEW actual local D1/R2 instances. Booking/customer/vehicle/history/notification/job/settings counts and exact original photo bytes matched. Wrong passphrase/tampering failed without writing target records, and existing populated targets were refused.

Remote API permissions, B2 conditional writes, hosted scheduling, actual account-loss recovery and the production recovery-time objective are NOT yet verified. Do not claim the local drill establishes off-machine recovery. No retention deletion code is included; approve a policy before pruning anything. Keep RPO <=24h / RTO <=4h as provisional targets until a timed external drill proves them.
