# Commercial operating cost model
October 28, 2026. USD/month; planning estimates, not provider quotes or authorization.

## Recommended staged architecture

Joseph pilot: existing Node/SQLite template, one 2 GB instance and 10 GB disk. Compute $25 + disk $2.50 = $27.50 infrastructure floor. A Pro workspace adds $25, proposed email reserve $20 and basic monitoring $10: about $82.50 before backup storage/transfer and tax. A private test on a single-user Hobby workspace may cost less; do not assume Hobby's governance/features match the commercial service. Existing 10 GB capacity and backup guard require operator review as photos grow.

The table below models the COMMERCIAL TARGET (Render + managed Postgres + R2), including at one business. It intentionally costs more than the unchanged SQLite pilot. None of this target infrastructure has been provisioned; do not buy Postgres solely because this table contains it.

Assumptions:
- One shared application, not a deployment per business. Pro workspace budget at every size; shared code and notification/image workers.
- 100 bookings, 400 transactional emails and 20,000 dynamic requests per business/month. These are planning inputs, not measured customer behavior.
- 5 GB retained originals/previews per business, plus 5 GB independent media recovery copy and fourteen retained daily 0.1 GB database exports: 11.4 GB/biz total object storage. This models a steady retained corpus, not unlimited lifetime uploads. Enforce and review quotas/retention.
- Relational database size 0.1 GB/biz; size includes an assumed index budget but must be measured.
- Render outbound allowance: 4 GB/biz/month including daily full logical exports (~3 GB/biz/month), object-store uploads and dynamic responses. Public photo downloads come from R2. Provider backup traffic exemptions are NOT assumed. Uploading encrypted SQLite full media snapshots every day would cost substantially more than this commercial metadata-only export model.
- 2 custom names per business (apex + www), plus 2 platform names. Apply 15 included Render names for Pro; no assumption that apex/www count as one. Confirm wildcard/domain counting in the actual account quote.
- R2: 2,000 Class A and 20,000 Class B operations/biz/month; aggregate free allowances applied once per account. Extra retained versions, attacks or download authorization traffic can increase this.
- One platform-owned verified sending domain and tenant-specific display name/verified reply-to. Fully white-labeled sending domains per customer require additional provider/domain administration and are excluded.
- No free email tier reliance. Use $20/50,000 and $0.90/1,000 overage as a model, subject to the provider's current high-volume quote. At 1,000 businesses: 400,000 messages -> $335 by that formula.
- Monitoring is an explicit budget reserve, not a quoted vendor SKU. No SMS, paid analytics or marketing emails.

| Monthly component | 1 business | 10 businesses | 100 businesses | 1,000 businesses |
| --- | ---: | ---: | ---: | ---: |
| Workspace | $25.00 | $25.00 | $25.00 | $25.00 |
| Web compute | $25.00 | $25.00 | $85.00 | $170.00 |
| Background/image processing | $7.00 | $7.00 | $25.00 | $50.00 |
| Managed Postgres compute | $19.00 | $19.00 | $55.00 | $200.00 |
| Database storage | $0.00 | $0.00 | $2.70 | $29.70 |
| Direct custom domains | $0.00 | $1.75 | $46.75 | $496.75 |
| R2 media + recovery storage | $0.02 | $1.56 | $16.95 | $170.85 |
| Transactional email | $20.00 | $20.00 | $20.00 | $335.00 |
| Monitoring reserve | $10.00 | $10.00 | $25.00 | $75.00 |
| Render outbound transfer | $0.00 | $2.25 | $56.25 | $596.25 |
| R2 operations | $0.00 | $0.00 | $0.00 | $8.10 |
| Modeled subtotal | $106.02 | $111.56 | $357.65 | $2156.65 |

Suggested operating envelopes: **$110–150; $115–175; $360–550; $2,400–3,000**, respectively. The 1,000-business envelope adds a provisional $200/month HA database reserve plus contingency above the $2,156.65 modeled subtotal. Actual HA plan eligibility/replica/storage charges must be quoted; this is not a guarantee of availability at that price. Lower-scale rows are single-primary and not an HA promise. Minimum database plans are not capacity guarantees.

The 1,000-business domain charge alone is about $497; off-machine exports drive about $596 of modeled transfer. These costs should not be hidden under a $25 server estimate. At this workload, compute is not the sole cost driver. Optimize backup frequency/incremental exports only after recovery objectives are agreed and verified.

## Cloudflare alternative and sensitivity

Workers pricing starts at $5/month with included request/CPU allowances. At 20 million dynamic requests and 7 ms average CPU, its compute model is about $10.20/month. This excludes image processing and does not benchmark this application.

For a rewritten Cloudflare implementation at the same retained dataset, D1 paid storage is approximately $0, $0, $3.75 and $71.25 after its shared 5 GB allowance. Assume indexed reads/writes fit included quotas; count every row read/written, including indexes and retries. A single D1 database cannot hold the 100/1,000-business modeled corpus safely within its 10 GB ceiling; tenant databases/shards and routing/migration orchestration would be necessary.

Cloudflare SaaS names at 2N hostnames would be $0/$0/$10/$190 after the first 100. This does NOT include restricted/costed generic apex proxying. Root-domain compatibility or a customer-approved www/root alternative must be verified. A comparison that silently excludes apex support does not satisfy the commercial requirements.

Allow roughly $90–150 / $90–170 / $150–300 / $1,100–1,800 for an experimental Workers/D1/R2 stack with email, recovery objects, monitoring and a separate small Node image processor/its workspace. These are engineering budget ranges, not equivalent deployment quotes: apex-proxy fees are UNKNOWN and additional, image throughput is unbenchmarked, D1 routing is unimplemented, and rewrite costs are excluded. Do not purchase based on these ranges. A truly Workers-only HEIC path has not been proven.

R2 is recommended without moving the application runtime. Compared with Render disk BLOBs, object storage separates public serving, private grants and recoverable media from the database. Its low storage price does not eliminate object consistency, backup or authorization work.

At 1,000 businesses, a tested Cloudflare SaaS edge might reduce hostname costs by roughly $307/month compared with the direct Render estimate, before apex/origin/Worker costs. An edge proxy does not automatically eliminate Render origin transfer charges. Add it only when total savings/automation exceed its maintenance burden.

Sensitivity:
- Each extra 1 GB live media plus a same-size recovery copy per business adds about $0.03/biz/month in R2 storage; network upload and operation counts are separate.
- Each extra 1 GB/biz of chargeable Render outbound adds $0.15/biz/month above the workspace allowance.
- One custom hostname instead of apex+www can roughly halve excess domain costs, but changes the product promise.
- 4x email volume changes the 1,000-business model from 400,000 to 1.6 million messages; re-quote the plan instead of assuming this budget holds.
- Capacity depends on request bursts, image decode peaks and write contention. Load tests must choose actual plans.

Excluded: taxes, customer domain registration, development labor/migration, support staff, subscription/payment processor transaction fees/chargebacks, merchant onboarding, commercial legal work, full-time staging (budget another small environment), Apple membership/Codemagic/TestFlight costs, and enterprise SLAs or extra data regions. These are not zero; commercial pricing must cover them separately. Joseph owes no subscription fee under complimentary testing access; Doc Incorporated still pays his infrastructure costs.

## Verified primary pricing references

- [Render compute/disk pricing](https://render.com/pricing?trk=article-ssr-frontend-pulse_little-text-block): web compute and disk rates.
- [Render Postgres prices](https://render.com/pricing?trk=public_profile__reactions-text): database compute examples; dashboard quote required.
- [Render workspace changes](https://render.com/docs/new-workspace-plans): Pro workspace, included transfer and overages.
- [Render custom domains](https://render.com/docs/custom-domains): included names and excess name pricing.
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/): storage/operations/free allowances and egress.
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/): request/CPU model.
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [limits](https://developers.cloudflare.com/d1/platform/limits/).
- [Cloudflare SaaS pricing](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/) and [apex caveat](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/apex-proxying/).
- [Resend pricing](https://resend.com/pricing?volume=50000): modeled transactional email plan.

Figures were researched for this review; provider pricing and plan availability may change. No subscription or cloud resource was created.
