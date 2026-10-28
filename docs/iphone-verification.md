# Real-device notification acceptance — pending

Software/adapter tests are not evidence of an alert reaching Joseph’s iPhone. This checklist must be executed with Joseph and controlled test customer contact details before Phase 1 acceptance.

Follow [device-test-environment.md](device-test-environment.md) for the now-prepared isolated configuration and staged approvals. It supersedes the earlier generic connection prerequisites. No tunnel or live messages have been enabled.

## Prerequisites

1. Authorize an HTTPS **development** origin reachable from the iPhone. The current loopback-only preview cannot serve a remote phone. Any tunnel, TLS proxy, network binding, firewall change or staging deployment needs separate authorization; nothing has been exposed by this development pass.
2. Generate development VAPID keys with the installed `web-push` library and configure VAPID subject/key environment variables. Use the same keys across restarts; rotating keys requires subscription refresh.
3. Configure development Resend access, a verified sender, controlled customer recipient, optional owner fallback email and webhook signing secret. Configure the signed receipt URL on the approved development origin. Do not send production credentials in chat.
4. Provision Joseph’s owner account locally and confirm working hours, service area, durations and actual contact/review information. Preserve synthetic QA data separately.

## Device cases to execute

- Install the owner dashboard on iPhone Home Screen, open the installed app, sign in and tap Enable / refresh phone alerts.
- Test permission default → granted and denied. Denied permissions should show instructions rather than repeated prompts. Verify inbox availability when permission is denied.
- Submit a controlled customer booking with an add-on/photo. Record booking ID, notification event ID, delivery attempts and provider response. Close/background the web app and verify the actual alert appears.
- Tap the alert, verify it opens that exact booking, and repeat with an expired/logged-out session: sign-in must preserve the booking deep link.
- Confirm the request. Verify protected appointment status, duration/travel buffer and customer email reception. Verify the signed receipt status separately from mailbox reading.
- Propose a different time/price. Open the customer’s private email link, accept, verify event/history and a new owner phone alert.
- Test customer cancellation and owner fallback email with push denied/unsubscribed/expired or provider failure. Booking/inbox must remain durable regardless of channel failure.
- Refresh/renew the subscription, revoke/regrant permission and test expired owner sessions. Verify no historical notification storm after renewal.
- Verify notification tag behavior when retrying the same event, and correct read/unread counts after tapping an alert.
- Exercise actual iPhone photo selection and the implemented server-side HEIC/HEIF-to-JPEG preview conversion, including preservation and private download of the original. Upload/preview/original download must remain private.

Apple’s platform requirements: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers

Resend raw-body signature verification: https://resend.com/docs/webhooks/verify-webhooks-requests

Record device model, iOS version, origin, timestamps, event/booking IDs, actual receipt result and failure cases. Do not mark acceptance complete until the device result is observed.
