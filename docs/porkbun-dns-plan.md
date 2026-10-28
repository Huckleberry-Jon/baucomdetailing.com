# Porkbun DNS — review only

No records changed. deployment/dns-observed-2026-10-28.json contains public observations, not a complete authenticated zone export.

Observed root A: 207.207.210.36, 207.207.210.50, 207.207.210.23. www CNAME: uixie.porkbun.com. MX: priority 10 fwd1.porkbun.com and 20 fwd2.porkbun.com. TXT: v=spf1 include:_spf.porkbun.com ~all. NS: fortaleza/salvador/curitiba/maceio.ns.porkbun.com. AAAA/CAA queries returned no answer. _dmarc returned parking CNAME uixie.porkbun.com, possibly wildcard; do not treat this as an established DMARC policy.

After private acceptance and explicit DNS approval:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A | @ | 216.24.57.1 | 600 |
| CNAME | www | actual assigned service hostname ending .onrender.com | 600 |

No service exists yet, so the exact www target is pending. Run node scripts/prepare-dns-plan.js ACTUAL-HOST.onrender.com after provisioning to generate a reviewable local plan; this never changes DNS.

First export the complete Porkbun zone, including unknown DKIM selectors and all forwarding/verification records. Replace only approved root parking A and www parking CNAME records. Preserve ALL MX, SPF, DKIM, DMARC, TXT, NS and unrelated records. Reconcile any actual conflicting AAAA only within the approved change. Configure both Render custom domains and certificates, verify HTTPS/canonical redirects and forwarding, and roll back from the registrar export if necessary. No Cloudflare nameserver migration or Netlify edits.

Sources: https://render.com/docs/configure-namecheap-dns ; https://render.com/docs/custom-domains ; https://kb.porkbun.com/article/10-how-to-set-up-email-forwarding-service

