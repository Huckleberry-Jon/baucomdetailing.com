Superseded status: R2 was subsequently enabled by the owner and the private preview is now deployed. See cloudflare-hosted-preview-report.md for current hosted results. The following preserves the earlier provisioning checkpoint.

# Cloudflare staging provisioning — October 28, 2026

## Current result

The intended GitHub repository was verified as Huckleberry-Jon/baucomdetailing.com, empty with main as its intended default branch and authorized push access. Verified source commit 08d8e45a3040847d87ec97625755d9b917d5584c was pushed to main. No force push or production pipeline was run. This report is committed and pushed separately.

The existing connected Cloudflare OAuth account was used. No other Doc project resources or Netlify configuration were changed.

The private preview is NOT deployed. The exact planned URL is:
https://docdetailing-site-staging.huckleberryservices.workers.dev/

The account workers.dev subdomain was verified through the Cloudflare API. A direct GET to the planned URL currently returns 404; that is not a successful gated-preview test.

## Created and prepared

- Created isolated D1 database docdetailing-staging in WNAM.
- Applied all four migrations successfully to that newly created remote database.
- Seeded one test business, ten service catalog entries, one complimentary testing entitlement and one isolated project-owner test account using the authenticated account identity.
- Joseph's account has NOT been provisioned; his verified login email is still needed.
- Generated separate staging owner/gate/link credentials under owner-protected ignored data/cloudflare-staging-candidate. No passwords, gate codes, signing keys or seed files were pushed.
- Prepared staging Worker config with no custom-domain routes, staging-only D1/R2 names, run_worker_first=true, SITE_OPEN=false, COMMUNICATIONS_MODE=disabled and both sending flags=false.
- Production-only bundle and Wrangler deploy --dry-run passed: approximately 740.90 KiB raw / 108.96 KiB gzip and 22 static assets. Dry-run is not provider execution or binding acceptance.

## Blocking R2 subscription

Creating docdetailing-staging-private failed with Cloudflare error 10042: Please enable R2 through the Cloudflare Dashboard.

Cloudflare documents an R2 subscription as a prerequisite. Activating that subscription is account billing setup. The current authorization explicitly excludes activating billing, so no activation, payment-method change or subscription purchase was performed.

The app requires its real private R2 binding for secure photographs. No substitute filesystem storage, public bucket, disabled photo workflow or partial preview was deployed to bypass this requirement.

The current OAuth token cannot read account subscriptions (403). Therefore the existing Workers/Images paid-plan eligibility and account-wide bill could not be confirmed through this connection. No plan change was made.

Source: https://developers.cloudflare.com/r2/get-started/
Billing distinction: https://developers.cloudflare.com/billing/understand/faq/

## Actual resource usage observed

Remote D1:
- Exact database size from query metadata: 413,696 bytes (Wrangler display approximately 414 kB).
- 30 application tables reported by Wrangler.
- Four migration records, one business, one test owner, ten services, one complimentary entitlement.
- Zero bookings, customers, media records and sessions.
- Foreign-key check returned no violations.
- The seed import reported 14 queries and 30 rows written; the later integrity queries reported 17 + 35 rows read and zero writes.
- Wrangler's 24-hour aggregate usage counters still displayed zero immediately afterward; they lag the observed operations and are not a zero-usage claim.

R2: no bucket created, no objects uploaded.
Worker: no application deployment, invocation measurements or hosted application traffic.
Images: no remote transformations tested.
Email/push: no sends and no provider credentials uploaded.
No new subscription was activated. An actual account invoice or final incremental cost is unavailable; do not describe this as a verified zero-dollar bill. The previous $6–12 initial planning target remains conditional on actual existing plan eligibility and low usage.

## Verification performed

- Full reachable Git history scan before push: 32 commits / 352 unique blobs; no recognizable private keys/provider token patterns or non-example environment/owner credential files found.
- Correct intended repository, public visibility, push permission and empty branch state verified.
- Remote main SHA matched the pushed source.
- All four remote D1 migrations applied.
- Remote seed counts/persistence and foreign keys verified.
- Worker bundle and no-upload deployment dry-run passed.
- Separate staging credentials/resources/publication/sending settings reviewed.
- Hosted customer booking, confirmation, photos, calendar, reviews and real iPhone behavior NOT tested because the Worker/R2 preview is not available.

The accepted baseline remains 82 passing local tests (47 Node / 27 Cloudflare / 8 Flutter). No implementation code changed during this provisioning pass; those suites were not needlessly rerun. Remote D1 checks are additional provider verification, not replacements for hosted workflow tests.

## Exact remaining steps

1. The account owner must review/complete R2 subscription setup in the existing Cloudflare account, or explicitly authorize that billing activation. Do not enable an unrelated plan. Confirm Workers and Images eligibility without exceeding the approved low-cost envelope.
2. Once R2 is enabled, create ONLY docdetailing-staging-private and verify public r2.dev/custom-domain access remains disabled.
3. Reuse the existing staged D1 and seed. Do not recreate or reseed the database. Existing private candidate files must be preserved, not regenerated/overwritten.
4. Upload only the staging preview gate secrets, deploy the approved staging Worker, and verify gate protection before giving out its credentials. Any unexpected paid-plan requirement remains subject to the billing restriction.
5. Provide Joseph's verified login email, provision his separate isolated account, and securely hand credentials only to Joseph/project owner.
6. Run hosted synthetic booking/confirmation/conflicts/photo/review/calendar tests, reload/persistence checks, private-media/tenant/security boundaries and actual HEIC acceptance. Keep channels and public bookings disabled.
7. Record actual Worker/D1/R2/Images usage and verify iPhone access. Separately approve sending only after the secured connection is accepted.

Production blockers remain domain/DNS authorization, final business facts/assets/policies, real iPhone notification acceptance, independent external recovery, production credentials/resources and final production publication approval. Apple/TestFlight and public billing remain outside this authorization.
