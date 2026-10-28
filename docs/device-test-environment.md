# Device acceptance environment — prepared, not exposed

## Current preparation update

The authorized local-only environment and Joseph’s test owner are now provisioned and verified. Read [local-device-readiness.md](local-device-readiness.md) for current status and exact remaining approvals. Public tunnel activation, push/email and external backup storage remain unauthorized. The sections below describe the later HTTPS path; they do not authorize executing it.

`DEV_CONNECTION_MODE=local-only` uses `http://localhost:4324` and prohibits outbound push/email. Switch to `DEV_CONNECTION_MODE=https-tunnel` with the approved HTTPS origin only after the account/URL/testers/window approval. Local preflight can now succeed without pretending a public URL has been selected. Owner credentials and the gate code are private files in the isolated device directory, never in Git.

## Inspected architecture

The existing Node 24 ESM HTTP server, shared SQLite WAL database, migrations, buildless website, authenticated owner dashboard, notification worker and private SQLite photo storage are retained. No hosting manifest, remote deployment configuration, DNS change or alternate backend was found. The Git remote remains `Huckleberry-Jon/baucomdetailing.com`; no fetch/push/deployment was performed in this pass. The existing normal preview binds only to `127.0.0.1:4317`.

## Selected development approach

Use a **stable account-assigned ngrok HTTPS development URL** pointing to a dedicated local instance on `127.0.0.1:4324`. This is the smallest change for the current server/SQLite architecture: no framework conversion, data migration, business-domain DNS, inbound firewall opening or Netlify change. The Windows computer must remain awake with both processes running. This is an acceptance-test environment, not durable hosting.

Alternatives considered: a random quick-tunnel URL would change the web-push origin and require reinstallation/resubscription; Cloudflare Access with a custom business subdomain adds account/DNS work; remote staging introduces database hosting and deployment work not needed for the short device test. Revisit durable hosting separately after acceptance.

ngrok terminates HTTPS and carries requests over its agent tunnel to the local loopback server. Authorization therefore includes using ngrok to carry **development test data**. Use synthetic customer records and only approved test recipients. The agent has not been installed or started by this pass. The final account-assigned URL, account token, plan availability/limits and any browser interstitial remain external prerequisites. Keep the same URL throughout testing. No custom business domain is needed.

Primary references:

- https://ngrok.com/docs/gateway/agent/cli (HTTPS forwarding, stable `--url`, `--inspect=false`)
- https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers (iPhone Home Screen web push)
- https://resend.com/docs/webhooks/verify-webhooks-requests (raw-body signed receipts)

## Prepared local separation

| Purpose                       | Path / behavior                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------- |
| Existing development database | `data/docdetailing.sqlite`, normal port 4317                                     |
| Device acceptance database    | `data/device-test/docdetailing.sqlite`, fixed port 4324                          |
| Device secrets                | `data/device-test/secrets.json` (separate VAPID pair, gate hash and signing key) |
| Tester access code            | `data/device-test/access-code.txt`, not printed or committed                     |
| Device configuration          | ignored `.env.device-test`, initially contains safe placeholders                 |
| Tracked variable names        | `.env.device-test.example`                                                       |
| Tunnel reference template     | `config/ngrok.device-test.example.yml`, not an active deployment                 |

`npm.cmd run device:prepare` was executed locally. It generates development-only secrets once, creates/migrates the separate database and never rotates existing keys or seeds a default owner. Windows ACLs restrict the device directory/files to the current owning user; Unix preparation uses private modes. Secrets, access codes, device databases and actual environment files are Git-ignored. Do not run the preparation script under a different account than the intended app owner.

The device profile reads **only** `DEV_*` provider configuration. Existing `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`, `DATABASE_PATH` or `PORT` cannot silently point this profile at another environment. Production mode is intentionally not configured in this development task. Do not copy production credentials, customer records or production backups into this environment.

## Access control and traffic behavior

- A 32-character random development code gates the entire website and app APIs. The code is stored as a scrypt hash in the server secret file; the original local code file is owner-readable only.
- Successful entry creates a signed, Secure, HttpOnly, SameSite=Lax cookie expiring after 48 hours. Owner login remains a separate requirement for every private route.
- The gate is served at the originally requested URL, preserving private booking fragments and owner deep links. It blocks unauthenticated large POST bodies before reading them. Do not share private booking links outside the controlled test group.
- The only application exception is the exact email-webhook POST route, which requires a configured, valid provider signature. It cannot be used to submit bookings or access owner data.
- Host and Origin checks remain strict; ngrok must preserve the incoming development Host header. Forwarded headers are not trusted for authorization. Rate limits currently share the loopback proxy address for this small two-person test; do not weaken them based on untrusted headers.
- No service-worker response caching; no private image directory exposure. Device responses carry no-store, noindex and HTTPS security headers.
- Push/email are **off even when credentials are present**, until their separate flags are explicitly enabled. Email also requires an exact recipient allowlist. Blocked/failing channels leave bookings and inbox/history durable.

## Configuration to fill locally

Edit the ignored `.env.device-test`; never paste secrets into chat or commit them.

```dotenv
APP_ENV=device-test
DEV_ORIGIN=https://YOUR-ASSIGNED-STABLE-NGROK-DOMAIN
DEV_SECRETS_FILE=data/device-test/secrets.json
DEV_VAPID_SUBJECT=mailto:YOUR-APPROVED-DEVELOPMENT-CONTACT
DEV_ALLOW_PUSH_SEND=false
DEV_ALLOW_EMAIL_SEND=false
DEV_TEST_EMAIL_RECIPIENTS=YOUR-CONTROLLED-CUSTOMER-EMAIL,JOSEPH-APPROVED-EMAIL
DEV_RESEND_API_KEY=DEVELOPMENT-ONLY-KEY
DEV_EMAIL_FROM=APPROVED-VERIFIED-DEVELOPMENT-SENDER
DEV_OWNER_NOTIFICATION_EMAIL=JOSEPH-APPROVED-EMAIL
DEV_RESEND_WEBHOOK_SECRET=DEVELOPMENT-ENDPOINT-SIGNING-SECRET
```

The actual VAPID private/public keys are already generated in the private device secret file. Do not substitute production keys. A verified email sender must already exist on a development/test provider setup; do not alter business DNS to verify one without separate approval. If no sender is available under existing arrangements, leave email off and report that prerequisite.

Provision Joseph’s **device-test** owner account, with the new environment selected:

```powershell
node --env-file=.env.device-test scripts/setup-owner.js
```

Set `OWNER_PASSWORD` privately before invoking it, enter the owner email, then remove the variable. The script now respects the isolated device profile. It refuses to overwrite an existing owner. Do not reuse a production password. Before appointment acceptance, configure Joseph’s confirmed hours, service area, durations, buffers and capacity through the owner UI.

## Exact approval and activation sequence

These are **future actions requiring approval**, not commands already executed:

1. Approve ngrok as the development transport, the account-assigned stable URL, the two testers, and the test window. Install the official agent if needed. Load `NGROK_AUTHTOKEN` privately from your credential manager; never put it in source, CLI arguments, screenshots or chat.
2. Fill the local configuration above and run the no-network check:
   ```powershell
   npm.cmd run device:preflight
   ```
   In local-only mode this check reports local readiness while explicitly keeping iPhone readiness false. The HTTPS mode requires the real approved URL; it rejects placeholders. Once filled, it prints configuration/owner/scheduling readiness and communication flags without secrets. It never starts exposure. Do not treat a successful check as phone-delivery verification.
3. Approve opening the **gated** development URL while push and email flags remain false. Start the app and tunnel in separate terminals:
   ```powershell
   npm.cmd run device:start
   ```
   ```powershell
   $deviceOrigin='https://YOUR-ASSIGNED-STABLE-NGROK-DOMAIN'
   ngrok http http://127.0.0.1:4324 --url $deviceOrigin --inspect=false
   ```
   Keep the app Host header unchanged. Disable provider traffic/body inspection and check ngrok’s account logging settings. The CLI template is optional documentation; the command above is the selected path. No firewall/DNS modifications are needed. Stop if a URL mismatch or TLS warning appears; do not bypass a browser certificate warning.
4. Verify an unauthenticated visit shows only the tester gate and direct API calls fail. Share the development code privately with Joseph. Open in Safari, enter the gate, install the owner page on Home Screen, reopen there, enter the gate if iOS uses separate storage, then sign in as owner. Any ngrok service interstitial must be completed through its normal page; it is distinct from TLS certificate validation.
5. Separately approve **development push** to Joseph’s test device, set `DEV_ALLOW_PUSH_SEND=true`, restart only the device app, and let Joseph explicitly grant permission in the installed web app. Test a synthetic booking while the app is backgrounded and verify tap-to-correct-booking, including expired owner login. Keep email false at this stage.
6. Separately approve the exact test sender, allowed recipient addresses and test messages. Configure the signed Resend webhook at `DEV_ORIGIN/api/webhooks/email`; use that endpoint’s development signing secret. Set `DEV_ALLOW_EMAIL_SEND=true` only after this approval, restart the device app and run confirmation/proposal/customer-acceptance/fallback tests. Recipients outside `DEV_TEST_EMAIL_RECIPIENTS` remain blocked regardless of booking input. Do not approve or contact live customers.
7. Record device/iOS version, URL, booking/event IDs, actual alert display/tap, customer mailbox receipt and signed delivery states using `iphone-verification.md`. Test HEIC selection and denied/revoked permission. Stop the tunnel and device server after the test window; return both flags to false. Cookie lifetime does not replace stopping exposure.

No native app work should begin until this physical-device acceptance passes.

## Off-machine encrypted backup preparation

See `off-machine-backups.md` for the dedicated private S3 bucket configuration, scoped credentials, upload approval, encrypted read-back and full restore verification. The adapter was tested with an in-memory S3 stand-in, not a real bucket. No cloud storage was provisioned or contacted. Do not interpret the adapter test as an off-machine recovery result.

## Verification and current state

38 automated tests pass, including all previous 30. New tests cover device-secret isolation, default-off channels, recipient allowlists, signed gate cookies and API blocking; real HEIC conversion/corruption rejection; simulated encrypted remote upload/download plus fresh restoration; and booking/history survival after push/email/worker failures followed by database restart. No regressions remain in that suite.

Device preparation was run twice successfully to check it preserves existing keys. File-level Windows ACL handling was corrected during preparation; the owning user can now reopen the database while other accounts are excluded. The subsequent preparation update added a strict local-only mode; preflight now succeeds locally while public connection and physical-device readiness remain pending. No tunnel, deployment, push, DNS change, cloud upload or customer communication was enabled.
