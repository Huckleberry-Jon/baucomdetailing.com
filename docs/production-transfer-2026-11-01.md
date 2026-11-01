# Production transfer rehearsal - November 1, 2026

A current protected D1 staging export was transformed into a production snapshot and verified in a fresh local database before import. The empty-target guard prevents rerunning the import over an existing business. Staging records were not modified.

Production D1 27bad655-e13c-41e5-9f1d-01f2802d4ade now contains five bookings, five customers and two authorized owner accounts. Twenty-seven included table counts match the prepared copy. The Apple review account, active sessions, native devices, subscriptions, transient rate limits and staging hostname were excluded. Business delivery is held, preferences are disabled, old deliveries remain held, and previously unenqueued events cannot replay. The reviewed settings, services, schedule blocks, job/invoice/payment/inventory records and audit history were retained. Owner login password hashes were preserved deliberately for account continuity; independent production access-gate signing secrets were generated and installed.

Forty-four referenced original and preview objects, including website photos, job media, branding and receipts, were copied into the private production bucket under production/baucom/. Every destination object was downloaded and compared with its source SHA-256. The bucket public access remains disabled.

Local full integrity and foreign-key checks passed. Remote exact table counts, PRAGMA foreign_key_check and PRAGMA quick_check passed. Remote integrity_check is unsupported by this D1 interface; it is not claimed as passed. Private evidence and customer data remain under access-restricted ignored data/production-transfer/.

Production static preflight passed. There are no public Worker routes, workers.dev endpoint or cron triggers. No production communications provider secrets or device tokens were installed. Porkbun nameservers remain unchanged; the Free Cloudflare domain onboarding has the mail and Resend records prepared.

The native production config points to https://baucomdetailing.com. Current archive scripts and TestFlight clients still target staging; adding this config does not change the installed app. No archive or Apple upload was started.

This is a snapshot rehearsal, not the final cutover. New staging activity can diverge. Before public bookings, coordinate a short handover, reconcile changes since export, verify production HTTPS and owner access, prepare the production client, and verify phone booking/email acceptance. Do not overwrite the populated production database with the initial-import script. Complete unattended backup credentials, key escrow and failure monitoring before unattended launch.

Native verification: Flutter analysis reported no issues; all 76 tests passed. Existing iOS source/signing configuration preflight passed. These checks do not constitute a production iOS archive or real-device acceptance.

## Domain connection completed

The owner explicitly approved the nameserver switch and deletion of only the four obsolete root/www parking entries. Porkbun now lists amanda.ns.cloudflare.com and christian.ns.cloudflare.com; public DNS confirms both. Cloudflare zone 406b2fa19d20df33ca5b6ba9e31683a3 is active on Free. Root/www are bound to production Worker version 622922c3-8f21-423b-9b29-bbfd792a5dc4. Valid HTTPS returns the private gate at the root and HTTP 308 from www to the root.

Both owner accounts independently passed ten hosted read-only authentication/finance checks. Three anonymous private API requests were denied with HTTP 401. Public forwarding MX priorities 10/20 and both Resend CNAME targets remain correct. No existing Netlify or other Doc project was modified.

Production remains SITE_OPEN=false with all communications disabled and delivery held. Domain connected does not mean public bookings open. Current iPhone clients still use staging; final data reconciliation and production client acceptance remain required. The business-card QR targets the correct stable domain but currently opens the gate, so cards are not approved for public distribution yet.
