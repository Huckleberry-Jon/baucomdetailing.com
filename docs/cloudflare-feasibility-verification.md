# Cloudflare feasibility verification — October 28, 2026

- npm.cmd test: 47 passed, 0 failed, 0 skipped. All previous 46 tests retained.
- Added regression: optional gallery failure cannot stop package selection/booking initialization. Normal website layout unchanged.
- Local Miniflare/workerd probe: scrypt/timingSafeEqual, concurrent guarded D1 batches with one conflict winner/history/outbox, transactional rollback on FK failure, and exact private R2 byte round-trip all passed.
- The probe borrowed only installed tooling read-only from DocInvoices. No DocInvoices source, bindings, records, certificates, credentials or billing were changed.
- No remote bindings, Cloudflare account API requests, bucket uploads, email/push sends, deployments, migrations, service activation, purchases, pushes or DNS changes were performed.
- Provider documentation verifies an available managed HEIC path; native Cloudflare Images decoding, metadata removal, large-image handling and private preview behavior remain UNTESTED.
- The D1 probe is a primitive concurrency proof, not the full schedule/capacity/hours/rescheduling/settings implementation or proof of complete tenant isolation.
- Account billing and remaining shared allowances were not inspected; the $6–12/month target is a feasibility envelope, not a confirmed bill.
- Real D1/R2/off-provider restoration, stale-backup alarms, sender access and physical iPhone notification delivery remain release acceptance gates.
- Native preparation continued with a provider-neutral API/membership/media contract; no native app project, compiled build, signing change or TestFlight archive is claimed.
- git diff --check passed.

Next implementation milestone: Fetch/D1 repository adapter with the full existing booking/authorization tests running against isolated local D1, followed by Images/R2 and independent recovery parity. This needs no hosting purchase; production activation remains separately controlled.
