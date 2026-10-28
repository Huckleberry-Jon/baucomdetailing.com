# DocDetailing private HTTPS preview: exact approval and command sequence

October 28, 2026. Preparation only. No command below that creates resources, uploads secrets, deploys, or changes DNS has been executed.

## Approvals needed before remote actions

Approve the Cloudflare account ID, distinct staging D1/R2 resources, the exact workers.dev hostname, the verified owner email, authorized testers and a test window. Approve resource/Images eligibility and the initial cost ceiling separately. A gated preview deployment is still a deployment and is not authorized by the preparation handoff.

Use staging first: it avoids changing baucomdetailing.com, Porkbun nameservers or Netlify. Do not tunnel Wrangler: its local explorer/debug interfaces must stay on loopback. The existing Node private device profile on port 4324 remains a separate option; Cloudflare local validation uses 4334. Synthetic browser QA uses 4335 and is not Joseph's production account.

## Local verification commands (authorized, already run)

From C:\DocDetailing:

~~~powershell
npm.cmd test
npm.cmd run test:cloudflare
npm.cmd run cloud:build
npm.cmd run cloud:preflight
~~~

Preflight is specifically for the production template. It currently fails on the missing approved account ID and isolated production D1 ID. Staging candidate safety is tested separately by test-cloudflare/release-config.test.mjs. A static pass never authorizes deployment.

## Resource creation (only after specific authorization)

Authenticate using a DocDetailing-scoped Cloudflare token from an approved secret manager. Do not paste tokens into Git or shell command arguments. Confirm the account in the provider dashboard.

~~~powershell
$env:CLOUDFLARE_ACCOUNT_ID = '<approved account ID>'
npm.cmd exec -- wrangler d1 create docdetailing-staging
npm.cmd exec -- wrangler r2 bucket create docdetailing-staging-private
~~~

Record the returned D1 ID and verify the bucket remains private, with public r2.dev access off. Images binding eligibility must be checked in that account before deployment. No existing Doc application resource is reused.

## Offline candidate provisioning

The new script performs no network calls. It refuses to overwrite an existing candidate, generates separate owner/gate/link secrets, applies owner-only file protection, and leaves public access and communications off. An .invalid synthetic identity is used only by automated tests, never for Joseph's release account.

Populate the following only after the identity and exact hostname are approved:

~~~powershell
$env:DOCDETAILING_TARGET = 'staging'
$env:DOCDETAILING_ACCOUNT_ID = '<approved account ID>'
$env:DOCDETAILING_D1_ID = '<new staging D1 ID>'
$env:DOCDETAILING_OWNER_EMAIL = '<verified Joseph owner email>'
$env:DOCDETAILING_OWNER_EMAIL_VERIFIED = 'true'
$env:DOCDETAILING_ORIGIN = 'https://docdetailing-site-staging.<approved-account-subdomain>.workers.dev'
node scripts/prepare-cloudflare-release.mjs
npm.cmd run cloud:build
npm.cmd exec -- wrangler deploy --dry-run --config data/cloudflare-staging-candidate/wrangler.json
~~~

The script has NOT generated a real staging/production account because the approved values are unavailable. The candidate folder is ignored by Git. owner.json contains the generated owner password and tester code; preview-secrets.json contains only the gate hash/signing key to upload. Keep both private. seed.sql includes a password hash and business link key and must also stay private.

## Private preview activation (separate deployment approval required)

Review all four migrations and prove the target is the new empty staging database. Confirm the config binds only that staging database and bucket. Then:

~~~powershell
npm.cmd exec -- wrangler d1 migrations apply docdetailing-staging --remote --config data/cloudflare-staging-candidate/wrangler.json
npm.cmd exec -- wrangler d1 execute docdetailing-staging --remote --config data/cloudflare-staging-candidate/wrangler.json --file data/cloudflare-staging-candidate/seed.sql
npm.cmd exec -- wrangler secret bulk data/cloudflare-staging-candidate/preview-secrets.json --config data/cloudflare-staging-candidate/wrangler.json
npm.cmd exec -- wrangler deploy --config data/cloudflare-staging-candidate/wrangler.json
~~~

Do not seed an existing database or rerun seed.sql blindly. Pause if any statement fails and inspect that isolated target. These remote commands have not been tested against a real account.

Verify the gate blocks root, assets, booking links and APIs before owner authentication. Test owner login/logout, cross-origin refusal, exact customer link, persistence across a Worker update, conflicts, photos, reviews and errors using approved synthetic data. SITE_OPEN stays false; COMMUNICATIONS_MODE stays disabled; both ALLOW_*_SEND flags stay false. A successful response/booking is not proof of phone notification delivery.

## Joseph's iPhone acceptance

On the approved HTTPS origin, unlock the tester gate, sign in as the isolated owner, and add the owner dashboard to the Home Screen. Initially verify booking/dashboard/calendar/photo access with communications disabled. Test session expiry and logout, private customer links, cellular access and 390px layout on the actual phone.

Then obtain separate approval for exact devices, recipient allowlist, verified sender/provider secrets, web-push keys and test-only sending. Test permission denied/default/granted, renewal, device reconnect, exact booking deep link, provider failure/retry, owner fallback, customer proposal/confirmation and signed delivery receipts. Record display/tap/customer receipt separately from provider acceptance. Native APNs requires a separate native adapter and signed app; web-push acceptance does not prove native APNs.

## Production and Porkbun

After preview acceptance and separate publication approval, repeat offline preparation with DOCDETAILING_TARGET=production, a different D1 ID/bucket, and DOCDETAILING_ORIGIN=https://baucomdetailing.com. Run production preflight against data/cloudflare-production-candidate/wrangler.json. New secrets are generated; do not copy preview owner/gate credentials.

The prepared direct Workers Custom Domains architecture requires a Cloudflare DNS zone. Cloudflare creates DNS records/certificates for attached custom domains. There is no approved fixed apex A-record IP to enter at Porkbun.

| Item | Required change after approval | Exact value still needed |
| --- | --- | --- |
| Porkbun nameservers, if direct Cloudflare zone is chosen | Replace only with the two nameservers assigned to this exact Cloudflare zone after zone reconciliation/DNSSEC review | Provider-assigned values; cannot be invented |
| baucomdetailing.com | Attach production Worker Custom Domain and canonical tenant mapping | Already named in production candidate; account/zone verification pending |
| www.baucomdetailing.com | Attach the same Worker, redirect GET to canonical apex | Already named in production candidate; certificate verification pending |
| MX/SPF/DKIM/DMARC/other records | Preserve from complete registrar export; compare before and after | Owner/account export unavailable |
| Netlify site | No project changes | Leave existing site intact |

If Porkbun remains authoritative, this direct Custom Domains template cannot be published unchanged. A separately verified Cloudflare for SaaS/apex routing plan is required; never substitute the abandoned Render IP. DNS approval must name the selected approach and exact exported diff.

Sources: [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
