# Minimum production budget — supersedes the Render commercial baseline
October 28, 2026. Doc Incorporated LLC / DocDetailing.

The proposed $110–150 initial plan is withdrawn. It was a conservative commercial target with paid workspace, managed Postgres, a separate worker, paid email and monitoring allowances, not the minimum required to launch Joseph. Those assumptions should have been separated before recommending purchases.

## Itemized reconciliation of the old estimate

| Old one-business component | Monthly | Essential at launch? | Revised treatment |
| --- | ---: | --- | --- |
| Render Pro workspace | $25 | No | No Render workspace on Cloudflare; premium team/governance is optional |
| Render web compute | $25 | Compute is essential; this SKU is not | Workers paid base $5, possibly already shared at account level |
| Separate worker/image server | $7 | No | Cron/outbox in same Worker; managed Images processing rather than a standing Node server |
| Managed Postgres | $19 | Durable database is essential; Postgres is not | D1, within included capacity initially |
| Database storage | $0 | Yes | Small indexed relational data in D1; no photo BLOBs |
| Custom hostname overage | $0 | Domains/TLS are essential | Joseph's two domains need a verified Cloudflare routing plan, not a premium plan by assumption |
| Media/recovery storage | $0.02 | Yes | R2 plus separately credentialed, encrypted off-provider recovery storage |
| Paid email allowance | $20 | Communications are essential; this plan is not | Existing Resend free allowance or usage-priced SES; no mandatory $20 floor |
| Paid monitoring reserve | $10 | Failure visibility is essential; paid vendor is not | Structured logs, backup-age alerts and an independent health check at low/free tiers |
| Outbound/operations overages | $0 | Usage dependent | Measure actual shared-account usage |
| Old modeled subtotal | $106.02 | Not the minimum | $110–150 included $3.98–43.98 unallocated contingency |

No paid redundancy was included in that one-business subtotal. The later 1,000-business HA reserve was an optional scaling assumption, not a Joseph requirement. No such service has been purchased.

## Cloudflare-first initial architecture

One distinct DocDetailing Worker with static assets, D1 metadata, private R2 originals/previews, Images binding for validated HEIC/JPEG previews, and a durable D1 outbox drained by a Cron Trigger. Keep owner authentication, delivery attempts and status history. No continuously running web or background server, managed Postgres, Kubernetes or separate Node image service is initially proposed.

DocDetailing needs its OWN Worker, D1 database, buckets, secrets and access policies. An existing Doc Incorporated Cloudflare account/paid Workers plan may be used only after checking quotas and authorization; do not bind DocDetailing to DocInvoices' production database, storage, auth application or provider secrets. Sharing the account does not imply sharing tenant data or budget limits.

## Minimum viable production budget

Assume one initial business, about 100 bookings/month, 400 total owner/customer transactional emails, <=100 MB D1 data, <=2.2 GB active original/preview/public-derivative storage, <=2,000 image transformations/month, <1 million dynamic requests and indexed queries well below D1 included row quotas. Budget up to 100 GB independent encrypted recovery storage, accounting for retained versions/exports rather than treating an extra live bucket as a backup.

| Required capability | Expected initial monthly charge | Conservative budget allowance |
| --- | ---: | ---: |
| Workers paid plan + static assets/Cron | $5 total base; incremental base may be $0 if already paid | $5 |
| D1 durable relational data + Time Travel | $0 within available included quotas | $0.25 |
| R2 originals/previews/operations | $0 within available included quotas | $0.25 |
| Images binding, including HEIC conversion | $0 up to available 5,000 transformations; account/plan eligibility to verify | $1.00 |
| Transactional email | SES à la carte ~$0.04 for 400 sends, plus small data/event charges | $1.00 |
| Off-provider encrypted backups | B2 first 10 GB free, then $6.95/TB/month; ~100 GB retained is about $0.63 beyond free storage | $1.50 |
| Backup runner / independent checks | $0 if existing hosted CI allowance is available | $2.00 |
| Built-in logs/health checks/status alerts | $0 within included/free limits | $0 |
| Planning allowance total | Around $5–7 at this usage | $11.00 |

**Target operating envelope: $6–12/month before tax, under $15 if these assumptions and remaining acceptance gates hold.** This is a feasibility budget, not a validated production bill or a hard spending cap. Keep $3–4 headroom rather than purchasing capacity preemptively. Shared-account included allowances are applied once, not once per project. If they are consumed by DocInvoices, measure the incremental charges before committing. Do not count expiring promotional credits as the foundation.

This budget includes required backup storage and customer communications. The $2 runner allowance must be confirmed against a reliable hosted scheduler; do not depend on Huck's PC remaining on. A dedicated high-frequency CI runner, premium support/monitoring, multiple regions or paid HA are optional and could exceed this budget.

Worker CPU overages, image decoding limits and provider availability need real measurement. Preserve security limits and backup integrity; do not weaken password hashing, drop media validation or replace backup restoration with file-existence checks to meet the price.

## Customer communications choices

Recommended dependable low-volume paid option: SES à la carte HTTP API. No monthly email-plan minimum; verify sender, obtain production sending access/quota, store separate least-privilege credentials, add bounce/complaint receipts and suppression handling. SES sandbox restrictions mean it is not ready merely because the send API exists. The current DocDetailing sender is Resend; SES is a small NEW adapter, not already implemented.

Lowest-change option: keep Resend's free 3,000/month and 100/day while verified sender/quota fit. A peak day can exhaust the daily allowance: preserve queued messages and alert before the cap. Do not describe next-day delayed confirmations as dependable real-time delivery. If this ceiling is plausible, approve SES or another usage-priced provider before launch rather than automatically buying $20/month.

Cloudflare now documents outbound Email Sending Beta on Workers Paid: 3,000/account/month included, then $0.35/1,000. This differs from older verified-recipient-only routing. Account access, sender/domain requirements, beta suitability and receipts must be verified; do not rely on it for launch without acceptance. Existing Porkbun forwarding/MX remain untouched.

Web Push/APNs require credentials and device acceptance, not an assumed per-notification hosting charge. Use durable attempts/retries and owner inbox plus email fallback. Provider acceptance is not iPhone display or customer read confirmation. No messaging was enabled in this review.

## Dependable recovery within the budget

D1 paid Time Travel provides a 30-day database recovery window, but does not back up R2 or protect against loss of access to the Cloudflare account. Require independent encrypted recovery copies.

Use a hosted daily job with separate DocDetailing-only credentials: export D1 SQL; capture referenced immutable object versions/checksums; copy changed original/preview media and the manifest; encrypt before writing to a separate provider/account such as B2; verify read-back and record backup age. Retain a reviewed set of daily exports and immutable media versions. Escrow the encryption key outside both accounts. An upload-only/no-delete recovery credential reduces accidental/ransomware damage; reviewed retention must not silently prune the only verified restore point.

D1 exports can block database requests; measure the small-database export window and schedule low traffic. Avoid copying every media byte every night. D1 data and immutable object manifests must agree before marking a backup successful.

Restore monthly into a NEW isolated D1/local database and private recovery bucket; compare record counts, relationships, checksums and booking histories; revoke sessions and disable sends; prove another tenant is unaffected. Target RPO <=24h and RTO <=4h until drills establish real results. Alert on stale/failed backups through an independent check, not only through the same failed Worker. Existing SQLite restoration tests remain useful; they do NOT establish D1/R2/off-provider restoration.

No bucket/account, external upload, retention deletion or paid scheduler was created. Remote backup activation and its restore drill remain separately authorized work.

## Render fallback — only after a bounded Cloudflare implementation assessment

A $7 Render instance plus 1 GB disk ($0.25) has a nominal ~$7.25 compute/storage floor. With usage-priced email and a small independent backup it could fit under $15, but its 512 MB memory and tiny volume have NOT been proven adequate for this HEIC/Sharp workload. Low disk space would pause current backups; concurrent image decoding may exceed memory. Free sleeping/ephemeral hosting is not a durable production alternative.

The already prepared 2 GB/10 GB Render pilot is $27.50 before email/backups, so it fails the stated target. No Pro workspace, Postgres or separate worker should be added to a fallback pilot by default. Consider Render only if full D1 transaction/concurrency work or image/runtime compatibility proves disproportionate after local validation. The successful local probe and documented managed HEIC support currently favor continuing Cloudflare.

## Sources checked for this revision

[Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/), [R2](https://developers.cloudflare.com/r2/pricing/), [Images pricing](https://developers.cloudflare.com/images/pricing/), [HEIC support](https://developers.cloudflare.com/changelog/post/heic-support/), [SES](https://aws.amazon.com/ses/pricing/), [Resend](https://resend.com/pricing?volume=50000), [Cloudflare email](https://developers.cloudflare.com/email-service/platform/pricing/), [B2](https://www.backblaze.com/cloud-storage/pricing), [Render](https://render.com/pricing?trk=article-ssr-frontend-pulse_little-text-block).

See cloudflare-migration-plan.md for exact repository changes and the read-only DocInvoices comparison. No purchase, paid activation, deployment, push, DNS change or production migration occurred.
