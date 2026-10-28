# Secured local device instance — prepared and verified

This update follows the authorization to prepare the device environment and Joseph’s isolated owner account, while leaving public exposure and push/email off.

## Current state

- Application runs only on `127.0.0.1:4324`, with local browser origin `http://localhost:4324`.
- `.env.device-test` has `DEV_CONNECTION_MODE=local-only` and both send flags false. Local-only mode refuses non-loopback origins and refuses enabling either outbound channel.
- Existing test access gate remains enabled. A separate owner login is required for private records. Gate and owner cookies are HttpOnly; the HTTPS tunnel mode retains Secure cookies. Local HTTP cookies are only for the strict loopback preparation mode.
- Owner login alias: `joseph@device-test.invalid`. This is a reserved **test-only login identifier**, not Joseph’s actual email and not an email destination.
- A unique generated owner password is held only in the owner-readable, ignored `data/device-test/joseph-test-owner.json`. The gate code remains in `data/device-test/access-code.txt`. No credentials were printed or committed; both files have the existing owner-only filesystem permissions.
- Account provisioning is idempotent: rerunning `npm.cmd run device:owner` verifies the existing account/credential match without resetting it.
- Database: `data/device-test/docdetailing.sqlite`. The normal development database, existing website, DNS and other products were not changed.
- ngrok configuration/launch instructions are prepared but no tunnel agent is activated. No live messages, cloud uploads, deployment, Git push or native app work occurred.

## Commands executed and checks

`npm.cmd run device:owner`: provisioned the isolated account; a second run verified the account with unchanged credentials.

`npm.cmd run device:preflight`: succeeded, reporting `localReady: true`, `iphoneReady: false`, database integrity true, access gate configured, owner provisioned and outbound push/email false. Actual hours/service area/provider configuration remain pending; local readiness is not iPhone acceptance.

`npm.cmd run device:verify-local`: **17 checks passed against the real running port-4324 server**:

- Unauthenticated APIs rejected; invalid gate code rejected; valid private gate code accepted.
- Gate access alone cannot access owner records; invalid owner password rejected; Joseph’s isolated test owner authenticated and opened the dashboard.
- Temporary, explicitly synthetic scheduling settings applied only in the isolated database.
- Two synthetic requests saved; first confirmed; overlapping confirmation rejected; confirmed booking shown in calendar.
- An independent read-only database connection saw the persisted confirmed state and request/confirmation history.
- No notification was accepted by any provider.
- Both synthetic requests cancelled, retaining audit history; original unconfirmed business settings restored.
- Logout revoked the verification session.

The private local run report is `data/device-test/local-verification.json`; it contains check results and test record IDs, not passwords. Synthetic cancelled requests remain visible for traceability. No real business hours or service-area claims were invented.

Full automated suite: **40 passed, 0 failed**. Added coverage verifies local-only origin/channel restrictions and Secure cookies under the future HTTPS mode. Source syntax/format checks passed. No real-device or public-tunnel claim is inferred from these checks.

## Exact steps remaining before real iPhone connection testing

1. Supply and approve all four connection details: **ngrok account, stable account-assigned HTTPS URL, named authorized testers, and test window with timezone/end time**. Supply the agent token privately on this computer; do not paste it into chat or source. Confirm the official ngrok agent is installed before activation.
2. After those details and public activation are approved, stop only this device instance and edit the ignored `.env.device-test`:
   ```dotenv
   DEV_CONNECTION_MODE=https-tunnel
   DEV_ORIGIN=https://THE-APPROVED-STABLE-NGROK-DOMAIN
   DEV_ALLOW_PUSH_SEND=false
   DEV_ALLOW_EMAIL_SEND=false
   ```
   Keep the isolated database/secrets unchanged. Do not use the purchased domain or modify Netlify/DNS. Rerun preflight, then restart with `npm.cmd run device:start`.
3. Only after explicit activation approval, start the prepared tunnel:
   ```powershell
   $deviceOrigin='https://THE-APPROVED-STABLE-NGROK-DOMAIN'
   ngrok http http://127.0.0.1:4324 --url $deviceOrigin --inspect=false
   ```
   Preserve the original Host header and disable request-body inspection. No tunnel was started by this update.
4. Privately share the tester gate code and isolated owner credentials with Joseph. On his iPhone verify the gate, separate owner sign-in, logout, pending booking intake/private photos and scheduling with controlled test data. Reopen through the Home Screen web app and check login/deep-link behavior. Confirm his actual hours, service area, durations and buffers before real scheduling acceptance. The local verification restored those fields to unconfirmed.
5. Record the secured connection result and stop exposure at the approved end time. **Leave both send flags false.** Push/email activation requires the separately promised authorization, including exact test device, sender/recipients and messages. External backup bucket/storage activation likewise remains separately pending. Do not begin the native app until full Phase 1 acceptance passes.

Broader configuration/security details: `device-test-environment.md`.
Phone notification acceptance after later messaging authorization: `iphone-verification.md`.

## Changed files

- `.env.device-test.example` — safe local-only defaults (actual `.env.device-test` is ignored).
- `src/runtime-config.js` — explicit local-only versus HTTPS tunnel modes and channel restrictions.
- `src/dev-access.js` — transport-appropriate cookie behavior; HTTPS remains Secure.
- `src/server.js` — HSTS only on the HTTPS development origin.
- `scripts/provision-device-owner.js` — private generated isolated-owner provisioning without resets.
- `scripts/device-preflight.js` — distinct local readiness and pending physical-device connection.
- `scripts/verify-device-local.js` — real port-4324 checks with synthetic cancellation/settings restoration.
- `test/device-environment.test.js` — local-mode and HTTPS-cookie regression tests.
- `package.json` — `device:owner` and `device:verify-local` commands.
- `docs/local-device-readiness.md`, `docs/device-test-environment.md`, `README.md` — current state and exact remaining approval steps.
