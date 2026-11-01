# DocDetailing launch progress — October 31, 2026

## Verified external recovery

A real encrypted backup was uploaded to the dedicated private Backblaze B2 staging bucket. The archive was downloaded and restored into both a new in-memory database/media set and a new protected local directory using the documented restore-local command. All 5 bookings and 44 referenced media objects were restored; record counts matched; authenticated encryption, media checksums, database integrity and relationships passed. Restored sessions are revoked, domains detached, device registrations disabled and outbound delivery held. No live application records were changed.

B2 rejected the S3 conditional-write header used in the earlier adapter. The corrected B2 adapter records exact provider version IDs and ciphertext hashes, and only reads those pinned versions. Missing receipts, duplicate writes in a run, absent version IDs and altered bytes fail closed. The exact-version receipt must be escrowed independently alongside the separately held decryption key. This has been proven against actual B2 storage, not just mocks.

## Notification preparation

Apple production topic-specific key M9896AHWYN for com.docincorporated.docdetailing, Team UDDPKPR3CJ, is secured locally and configured only on isolated staging. Local signing validation passed. A provider probe with an intentionally invalid all-zero device token returned HTTP 400 BadDeviceToken. Zero real device notifications were sent. This response does not prove physical iPhone delivery or tap routing. Email, browser push and native push flags remain disabled.

## Remaining launch gates

- Resend is still at signup and requires the owner's initial password and email verification. No email API key, verified sender domain, webhook or real email delivery acceptance is configured.
- The B2 console's Write Only key includes deleteFiles and bucket-administration permissions. It was used for the explicitly authorized manual drill only. The unattended create command now checks provider-reported permissions and refuses that key. A custom bucket-only writer with writeFiles and minimal read/list permissions is required; no master key was generated or replaced. One unused read-only key from the initial capture attempt should be revoked during owner cleanup.
- Escrow the backup passphrase, exact-version receipt and APNs key independently of this PC and B2. They remain only in protected ignored local storage so far; losing those files can prevent recovery.
- Provision scoped source D1 export/R2 read credentials, retain version receipts, configure a hosted daily runner and independent backup-age/failure alerts. The workflow example stays inactive; no unattended backup schedule is enabled.
- Perform the physical iPhone notification/booking acceptance test with approved allowlisted recipients, then enable communications deliberately after reviewing old blocked test deliveries.
- Prepare isolated production resources and transfer reviewed business settings/branding. Review the Cloudflare zone/DNS cutover and preservation of Porkbun mail records before publishing the domain. No DNS or Netlify changes were made.

## Files and evidence

Protected local evidence is in data/launch-recovery-drill/verification.json, version-receipt.json, restore-command.log and the new restored directory under data/recovery/. API credentials, passphrases, raw exports, private media and key downloads are ignored by Git and access restricted. Do not paste their contents into chat or commit them.

Current implementation changes: scripts/b2-versioned-storage.mjs, scripts/b2-access.mjs, scripts/cloud-backup.mjs, deployment/cloud-backup.env.example, the corresponding Node regression tests, and the Cloudflare launch checklist. All provider changes were confined to DocDetailing.

Vendor references: [B2 version retrieval](https://www.backblaze.com/apidocs/s3-get-object), [B2 custom key capabilities](https://www.backblaze.com/apidocs/b2-create-key).

## Final verification

61 Node tests, 54 actual local Cloudflare runtime tests and 76 Flutter tests pass (191 total); Flutter analysis is clean. The external version-pinned archive contains 47 encrypted/verification objects totaling 10,971,333 bytes, including 44 media objects. Hosted authentication, closed-day availability and financial reconciliation checks remained passing, with communications still disabled. No public website or App Store release, DNS change, paid-plan activation or live customer communication occurred.
