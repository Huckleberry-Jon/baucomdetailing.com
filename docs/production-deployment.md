# Production preparation — October 28, 2026

> CURRENT DECISION: The Render-first $110–150 initial hosting recommendation is withdrawn. Follow minimum-production-budget.md and cloudflare-migration-plan.md. Earlier cost/scaling figures below are historical planning scenarios, not purchase recommendations.

Preparation only: no push, hosted deployment, purchase, DNS change, customer communication or native build.

Commercial review: this is a single-business pilot template only. Do not provision additional businesses with it. See docs/commercial-architecture-review.md and docs/commercial-operating-costs.md before any purchase or deployment.

Use one Render Docker service, plan 1c-2g (1 CPU/2 GB), with a 10 GB persistent disk at /var/data/docdetailing. This retains Node 24, SQLite and private image BLOBs. Budget $25/month compute plus separately quoted disk, backup and email usage; approve the current dashboard quote and region first. A single persistent-disk instance has redeployment downtime and is not highly available. Cloudflare Workers currently stub node:sqlite; moving this backend would require migration. No nameserver migration is proposed.

Review the inactive deployment/render.production.example.yaml, deployment/production.env.example and Dockerfile. Docker is unavailable here: Linux image startup, mount ownership and memory limits remain unverified. Build on Linux, pin a verified Node image digest, and run all container checks before hosting.

## Approval and activation sequence

1. Approve Render account, region, quoted plan/disk expense and PRIVATE prelaunch deployment. Separately authorize the source push. Preserve Netlify and Porkbun nameservers.
2. Provision the single service/disk, disable automatic deploys and obtain the actual onrender.com hostname. Set PROD_ORIGIN to that HTTPS origin, PROD_SITE_OPEN=false, PROD_COMMUNICATIONS_MODE=disabled and both send flags false.
3. Install separate production secrets in the provider secret manager. Offline candidates are in ignored, owner-only data/production-preparation. Never reuse device secrets or put values in Git/logs. Escrow the backup passphrase separately. Provider credentials have not been provisioned.
4. Verify Linux image tests, persistent-mount enforcement, HTTPS certificate, minimal /healthz, preview gate, owner authentication, unknown Host rejection and private media access. The Node port stays internal behind provider HTTPS.
5. Verify Joseph's owner email directly. The proposed josephhuffman01@gmail.com remains unverified; do not message/invite it yet. Use an interactive hosted shell and a unique privately set OWNER_PASSWORD with npm run owner:setup. Never copy the device-test owner.
6. Confirm actual hours, service area, durations, contact and image permissions. Run node scripts/production-preflight.js inside the mounted service. Prove persistence across restart/redeploy and concurrent conflict protection using synthetic bookings.
7. Separately approve exact test recipients/devices and communications. Install production VAPID and verified sender credentials, select test-only mode and an explicit email allowlist. Preserve all forwarding DNS; approve sender-domain DNS separately. Joseph installs the private HTTPS dashboard on his iPhone Home Screen and proves alert -> exact booking -> confirmation/proposal -> customer test receipt. Test denied permission, renewal, expired session and delivery failures. Provider acceptance is not physical delivery.
8. Separately approve encrypted off-machine storage, credentials, retention and billing. Enable backup flags only afterward. Download an actual uploaded backup and restore to a NEW isolated directory following backup-recovery.md and off-machine-backups.md. Compare bookings/customers/settings/photo bytes, integrity, revoked sessions and paused delivery. Mock adapter tests do not prove real remote recovery.
9. Resolve retention/monitoring before unattended operation. The scheduler stops after two local copies, low space or a failed/interrupted run; it deletes nothing. Owner dashboard reports status but does not page an operator. Approve operator review, failure recovery and capacity policy before launch.
10. After hosted/device acceptance, separately approve exact DNS and public launch. Configure both domains/certificates, update canonical PROD_ORIGIN and approved aliases, then open the site at the approved window. Live messaging remains separately controlled. Changing origins requires new browser push enrollment and login.

SQLite includes original media, so disk growth needs monitoring. Host snapshots supplement, rather than replace, encrypted off-machine restoration. Restore with sending paused and reauthorize channels before resuming. Payments, estimates/invoice issuance and finance are not implemented; payment-record integrity cannot be certified.

Sources: https://render.com/docs/disks ; https://render.com/docs/compute-plans ; https://render.com/docs/blueprint-spec ; https://developers.cloudflare.com/workers/configuration/compatibility-flags/

