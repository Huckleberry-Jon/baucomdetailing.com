# Baucom sender DNS review — November 1, 2026

Authenticated Porkbun DNS review completed for baucomdetailing.com. The drawer lists exactly seven existing records: root ALIAS and wildcard CNAME to Porkbun parking, two root forwarding MX records, root Porkbun SPF TXT, and two existing _acme-challenge TXT records. A complete private before-change snapshot is retained in ignored data/dns-change-review/before.json.

The three sender records in deployment/resend-dns-plan-2026-11-01.json have no exact-host conflicts:

| Type | Host relative to baucomdetailing.com | Value |
| --- | --- | --- |
| TXT | resend._domainkey.notify | Exact public DKIM value supplied by Resend in the plan |
| CNAME | rsend.notify | rsend.forge.rmta.net |
| CNAME | send.notify | send.forge.rmta.net |

TTL is 600 seconds for all three. These are additions only. Preserve all seven existing records, nameservers, website routing and existing mail forwarding. No root DMARC or root SPF changes are included. Exact sender hostnames will take precedence over the existing wildcard only at those sender names.

The user approved this exact sender-only change set. All three records were saved on November 1, 2026. The authenticated drawer then showed ten records; all seven original records retained their exact type, host, value, priority where applicable, and TTL. Provider record IDs were not exposed in the drawer. No root/www routing, nameserver, forwarding, SPF or DMARC change was made.

All twelve exact-value checks passed across the four Porkbun authoritative nameservers (three records per nameserver). Evidence is retained privately in data/dns-change-review/authoritative-verification.json. Resend now reports Verified for the domain and all three records; its domain timeline shows DNS verified at 9:04 AM and domain verified at 9:06 AM on November 1.

Customer delivery and push remain disabled. No further email was sent. Next: narrow the existing sending key to the verified domain, configure an approved sender address, then run a separately authorized acceptance test limited to named testers. Do not drain historical blocked deliveries.
