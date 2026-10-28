# Acceptance checklist — remaining work

October 28, 2026. The next milestone is a gated online website preview, not a production launch or TestFlight claim.

## Website release gates

- Approve Cloudflare account, resource ownership/quotas, exact HTTPS staging origin, verified owner identity, authorized testers and test window.
- Approve the new private staging deployment only. Keep production DNS and channels off.
- Verify actual managed-Images HEIC/HEIF with Joseph's photographs. Local JPEG EXIF rotation/metadata stripping passes; local HEIC emulator remains a known failure. Original files stay private.
- Verify iPhone website usability, Home Screen gate/session behavior, exact-booking taps and push permission/renewal after separate test-channel approval.
- Provide final contact details, service area, business hours, capacity, durations, Google review URL and all 11 photo assets/rights/captions.
- Approve final privacy/booking policies, privacy contact and retention schedule. Current pages clearly identify prelaunch review status.
- Choose whether any existing local records need a rehearsed import or production starts empty; never assume they are disposable.
- Approve independent encrypted backup account/runner/key escrow, no-delete permissions, retained capacity and a recovery drill. Current uploader copies the full referenced media set for every snapshot; retention is not automatically pruned. Model growing storage accordingly.
- Run actual external upload/read-back/download/fresh restore and record RPO/RTO. Configure independent backup-age and failure alerts before launch; backup_runs ingestion is not yet wired to the external runner.
- Approve the exact Porkbun/Cloudflare DNS diff and final production deployment separately, preserving mail and Netlify.

## Native release gates

Native APNs device registration and provider delivery, secure persistent credentials, signed macOS/iOS build, real backend/device testing, comprehensive calendar month/block controls, pagination, financial corrections/refunds and invoice PDF/share UX remain unfinished. Native camera/library integration is implemented in source but not physically verified. Core seven-plus responsive widget checks are useful development evidence, not physical acceptance.

## Future commercial work (must not delay Joseph)

Automatic tenant provisioning; complete template-driven branding replacing remaining Joseph-specific HTML/copy; subscriber-selected subdomains; domain ownership/certificate lifecycle; commercial entitlement enforcement and billing after separate authorization; tenant onboarding/offboarding/export; load/abuse tests and financial reconciliation. Current tenant isolation and complimentary-access metadata are foundations, not completed subscription sales.

## Budget

Plan approximately $6–12/month initially, with a conservative roughly $11 allowance under the assumptions in minimum-production-budget.md. Workers base is $5/account/month; an existing paid allowance may reduce incremental cost only after account verification. R2/D1/Images depend on shared quotas, storage and transformation volume. Resend free limits are 3,000/month and 100/day; queue persistence does not guarantee prompt communication after quota exhaustion. B2 currently advertises $6.95/TB/month; the backup runner/independent alarms need a verified hosted allowance. No actual production bill exists because services have not been activated.

The target excludes domain renewal, Apple membership, paid Codemagic minutes, transaction-processing fees and taxes. Optional premium monitoring/redundancy is not included. No $110–150 commercial plan is recommended or authorized.

Sources checked October 28, 2026: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Resend](https://resend.com/pricing), [B2](https://www.backblaze.com/cloud-storage/pricing).
