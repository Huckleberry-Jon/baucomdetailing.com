# Resend preparation — November 1, 2026

The owner completed Resend signup and is signed into the new account. No paid plan was activated.

Registered sender: notify.baucomdetailing.com in North Virginia (us-east-1), domain ID 96a252fe-8c9f-4b58-9772-ebea22663c97. Resend reports Not Started because DNS remains unchanged. The exact three provider-supplied sender records are in deployment/resend-dns-plan-2026-11-01.json. They are one public DKIM TXT plus rsend.notify and send.notify CNAMEs; do not substitute the old Amazon SES MX/TXT examples. The optional root DMARC suggestion is excluded. No apex/www, nameserver, mail-forwarding or Netlify changes have been made.

A sending-only key form is prepared in Resend with name DocDetailing staging send only. No key exists yet. All-domains scope is temporary because the custom sender is unverified; the account currently has only the new Baucom sending domain. Restrict the key to that verified domain when available. Never use a Full access key in the Worker.

A webhook form is prepared with the existing private staging /api/webhooks/email endpoint. Subscribe only to sent/delivered/bounced/complained/failed events. Store the generated signing secret privately; the backend verifies Svix signatures and tenant ownership before storing receipts. No webhook has been created yet.

The exact connection proposal is in deployment/resend-connection-plan-2026-11-01.json. After credential-creation confirmation, capture secrets without printing them, install only in the DocDetailing staging Worker, and keep COMMUNICATIONS_MODE=disabled and all send flags false. Send one explicitly approved diagnostic email directly through Resend's test sender to the account owner only, with tenant metadata and a stable idempotency key; do not drain historical blocked messages. Verify the signed receipt in the staging backend. Provider acceptance or mail-server delivery is not proof of inbox receipt; ask the owner to confirm the test email arrived.

Sending from Baucom's own domain to Joseph or customers remains blocked until the exact sender DNS plan is reviewed/applied with authorization and Resend verifies it. No customer communication activation is implied by account signup or API-key setup.
