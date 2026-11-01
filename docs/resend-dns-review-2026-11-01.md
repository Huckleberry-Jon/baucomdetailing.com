# Baucom sender DNS review — November 1, 2026

Authenticated Porkbun DNS review completed for baucomdetailing.com. The drawer lists exactly seven existing records: root ALIAS and wildcard CNAME to Porkbun parking, two root forwarding MX records, root Porkbun SPF TXT, and two existing _acme-challenge TXT records. A complete private before-change snapshot is retained in ignored data/dns-change-review/before.json.

The three sender records in deployment/resend-dns-plan-2026-11-01.json have no exact-host conflicts:

| Type | Host relative to baucomdetailing.com | Value |
| --- | --- | --- |
| TXT | resend._domainkey.notify | Exact public DKIM value supplied by Resend in the plan |
| CNAME | rsend.notify | rsend.forge.rmta.net |
| CNAME | send.notify | send.forge.rmta.net |

TTL is 600 seconds for all three. These are additions only. Preserve all seven existing records, nameservers, website routing and existing mail forwarding. No root DMARC or root SPF changes are included. Exact sender hostnames will take precedence over the existing wildcard only at those sender names.

No records have been saved. The Porkbun Add Record form is open for baucomdetailing.com. Explicit approval to apply this sender-only change set is the remaining action gate.

After approval, add only these records, retain their new record identifiers, compare all original seven records against the snapshot, query the authoritative nameservers and Resend verification status, then update the approved staging sender configuration. Live customer communication remains a separate activation step; do not drain old blocked messages.
