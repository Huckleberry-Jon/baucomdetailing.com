# Native notification implementation — 2026-10-29

Implemented: encrypted tenant-bound APNs device tokens in D1; owner/session association; token renewal; refresh migration; logout/all-device revocation; generic notification payloads; stable collapse/event IDs; durable retry and invalid-token expiry; persistent paginated inbox and unread state; one-hour appointment reminders; iOS permission/settings, token callbacks, foreground presentation and authenticated booking navigation.

All outbound communication flags remain disabled. No APNs key has been configured or created. No Apple upload has occurred. APNs provider acceptance does not establish delivery to a phone. Network ambiguity can cause a repeated provider request; stable event/collapse IDs and inbox/tap deduplication reduce repeats without claiming exactly-once transport.

The local integration fixture uses an in-process provider Worker and reserved .invalid URL. Main outbound requests are confined to that provider; the provider has no application network calls. Tests generate only synthetic signing keys. Worker Request redirect mode must be manual; error mode is unsupported.

Migration 0005 must be applied before deploying this Worker. Backups include encrypted native registrations; recovery disables registrations and revokes sessions. An offline logout clears local private access, but cannot revoke the server until a request succeeds; generic alerts contain no customer details. Use owner-wide session revocation on another connected device when necessary.

The DocDetailing Runner now declares production aps-environment. Existing certificate and profile references are unchanged. A controlled macOS archive must validate that the existing profile permits that entitlement. Do not replace or regenerate any signing asset to work around a failure.

Required external validation: backend APNs auth key/Key ID and topic/environment; explicitly approved test owner IDs; controlled archive and strict entitlement verification; install on a physical iPhone and verify foreground/background/cold-start delivery, denial/re-enable, token replacement, logout and tap routing. Live email and push remain blocked pending approval.

