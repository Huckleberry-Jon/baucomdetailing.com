# Resend connection verification — November 1, 2026

The new Resend account is connected to DocDetailing private staging. No paid plan was activated.

## Verified

- Created DocDetailing staging send only with Sending access, not Full access. Captured and stored the key privately, then installed RESEND_API_KEY, EMAIL_FROM and RESEND_WEBHOOK_SECRET only on docdetailing-site-staging.
- Created the signed webhook at the existing /api/webhooks/email endpoint, subscribed to email.sent, email.delivered, email.bounced, email.complained and email.failed.
- Hosted endpoint rejected an unsigned callback with HTTP 401.
- Sent exactly one approved diagnostic through onboarding@resend.dev to huckleberryservices@yahoo.com, subject DocDetailing email connection test. Used a stable idempotency key and tenant metadata; no booking/customer content was included.
- Resend reports Delivered. Actual D1 webhook_receipts contains one email.sent and one email.delivered event for the diagnostic provider ID. No historical delivery queue was drained.
- Owner authentication, private access gate and financial reconciliation checks passed after installing the secrets. Native push remains disabled. The owner subsequently confirmed inbox receipt with a screenshot of the diagnostic email.

## Sender domain and DNS

Registered sender: notify.baucomdetailing.com, North Virginia (us-east-1), domain ID 96a252fe-8c9f-4b58-9772-ebea22663c97. The three explicitly approved sender records are now applied; Resend reports the domain and all three records Verified. The exact provider-supplied records are in deployment/resend-dns-plan-2026-11-01.json: one DKIM TXT plus rsend.notify and send.notify CNAMEs. Do not substitute older Amazon SES MX/TXT examples. The optional root DMARC suggestion is excluded.

The authenticated Porkbun comparison preserved all seven original records, and all twelve exact-value checks across four authoritative nameservers passed. Root/www routing, nameservers, forwarding MX/SPF, existing verification records and Netlify were preserved. The existing sending key was edited in place and its saved domain restriction verified as notify.baucomdetailing.com. Sending access remains unchanged; no key was replaced or revealed.

## Activation still off

COMMUNICATIONS_MODE=disabled, ALLOW_EMAIL_SEND=false, ALLOW_PUSH_SEND=false and ALLOW_NATIVE_PUSH_SEND=false remain in effect. The diagnostic used a single direct provider call; it did not activate booking emails. No customer email or physical-device notification was sent, The only DNS changes were the three approved additive sender records.

After sender verification, review historical blocked deliveries before activating allowlisted fresh owner/customer acceptance tests. Confirm actual inbox receipt, signed receipts, bounce handling and physical iPhone push/tap behavior before live customer activation.

The exact connection state is recorded in deployment/resend-connection-plan-2026-11-01.json. Private credentials and diagnostic evidence remain under ignored, access-restricted data/resend-private/; do not paste their contents or commit them.

Regression verification: 21 tests passed across test-cloudflare/security.test.mjs and test-cloudflare/integration.test.mjs, covering signed receipts, tenant boundaries, retries and booking persistence. No application source code changed in this connection step.

A single sender acceptance email is prepared in deployment/resend-connection-plan-2026-11-01.json, from Baucom's Mobile Detailing <bookings@notify.baucomdetailing.com> to the project owner at huckleberryservices@yahoo.com. Its subject is Baucom sender verification test. The user explicitly approved this new send. Exactly one email was sent; Resend reports Delivered, and staging D1 has one signed email.sent and one signed email.delivered receipt for provider ID 01a197ab-8f42-72ca-88e5-21e6f645bda9. Actual inbox confirmation remains pending. It did not enable booking alerts or drain historical messages. The Worker From secret is still onboarding@resend.dev and must be updated to the approved domain address before any future queue activation.

## Authorized two-tester booking acceptance

On November 1 the owner confirmed receipt, marked the sender test Not spam, and authorized test-only booking email for the project owner and Joseph. Staging now uses COMMUNICATIONS_MODE=test-only, ALLOW_EMAIL_SEND=true and TEST_EMAIL_RECIPIENTS=huckleberryservices@yahoo.com,josephhuffman01@gmail.com. EMAIL_FROM is Baucom's Mobile Detailing <bookings@notify.baucomdetailing.com>. Business email preference is enabled with Joseph as owner recipient. Both push channels remain disabled and SITE_OPEN remains false. This supersedes the disabled-mode preparation notes above; unrestricted customer delivery is still disabled.

Before activation, the business was held, all 23 pending historical deliveries moved to recovery_hold, and previously unenqueued notifications marked enqueued without sending. Existing booking/history/inbox records were preserved. An audit event records this preparation. The business hold was released after the restricted Worker deployment. No old outbox was drained.

A bulk-secret attempt for existing plain-text vars was rejected by Cloudflare for a duplicate binding; it did not activate delivery. The correction updated only the From secret and deployed the allowlist vars normally. Current staging Worker version is f51b648f-2387-48c4-ab3a-6c35a45d7a83. Twenty-one actual local Cloudflare security/integration tests passed; ten read-only hosted authentication/finance checks passed with no records changed.

Manual acceptance now pending: use the private staging website with huckleberryservices@yahoo.com as customer email, select an available future slot, submit, verify Joseph receives the request alert, approve in the app, and verify the Yahoo confirmation. Check signed provider receipts for both events and spam placement. Other recipient addresses remain blocked. No new synthetic booking was created during activation.
