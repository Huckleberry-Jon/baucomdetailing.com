# Native iOS contract preparation — independent of hosting cost
October 28, 2026. Contract design, not an implemented native API or compiled application.

The commercial owner app must use stable HTTPS JSON, not direct D1/R2 access. Native screens and models should depend on repository protocols and synthetic fixtures until the backend is accepted. Provider choice must not appear in customer-facing app flows.

Existing web routes remain unchanged. A future /api/v1 native boundary should expose:
- Authenticated identity and active business memberships, explicit business selection and role permissions.
- Booking list/detail containing stable id, business ID, status, requested/confirmed/proposed times, integer-cent price/currency snapshots, version and permitted actions.
- Confirm/propose/cancel commands with expected version and idempotency key; HTTP 409 maps to refresh/review, never silent overwrite.
- Calendar with timezone/business hours/blocks and advisory availability; confirmation always rechecks server-side.
- Private job/media metadata and expiring authenticated upload/download grants, plus processing state and invoice-selection flag. Device UI must not assume JPEG originals or a publicly readable bucket.
- Durable notification inbox, exact booking deep link and APNs device registration tied to identity/business, independently revocable.
- Review moderation and business settings with version checks.
- Invoice/payment/finance capabilities only after implementation; unavailable features are explicit, not empty fabricated balances.

Authentication design still to implement: independent mobile session/token lifecycle with Keychain persistence, refresh/revocation and membership checks on every request; no embedded shared secret, web owner password in preferences, or unrestricted admin token. Web cookie sessions continue separately. Deep links identify a booking but never authorize access.

Prepare a transport-independent OwnerAPI protocol and mock fixtures for pending, confirmed, proposed, conflicting, expired-session and media-pending states. Keep Joseph's complimentary entitlement as a returned capability, not a native email/name bypass. Native APNs requires its own server adapter; website Web Push is not APNs support.

API acceptance should run the same business rules for web/native routes. Native development does not require Render or paid infrastructure. Actual iOS project/signing/archive/TestFlight work remains separate from this contract and must report its build/device verification honestly.
