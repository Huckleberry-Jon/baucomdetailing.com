# Editable social links — private staging verification

October 28, 2026.

Preview: https://docdetailing-site-staging.huckleberryservices.workers.dev/
Staging Worker version: cf3a4e5b-c1e2-4257-8470-8460b5bd184d.

## Links configured

- Instagram: https://www.instagram.com/baucomdetailingllc/
- Facebook: https://www.facebook.com/share/1BRoekry1L/?mibextid=wwXIfr
- TikTok: https://www.tiktok.com/@baucomdetaling

The supplied TikTok spelling is preserved exactly. Instagram and TikTok displayed the matching Baucom business profiles during browser verification. Facebook's supplied share link resolved to Baucom detailing and presented a login prompt; no Facebook authentication was attempted. Joseph's old Netlify bio link was not followed or changed.

## Website and owner controls

Added recognizable inline SVG Instagram, Facebook and TikTok icons to the header, contact section and footer. Header icons are compact, while contact/footer links include visible platform names. All nine links have accessible labels, new-tab disclosure, target=_blank and rel=noopener noreferrer. No external icon CDN or social tracking embed is loaded.

At mobile widths, social icons share the branding row and navigation remains below. Tap targets are 44×44 pixels. At the smallest width the decorative badge is hidden to preserve space; the Baucom name remains visible.

Joseph can edit or remove any link in Owner dashboard → Settings → Social media links → Save social media links. Blank fields remove a platform. The form refreshes current settings before merging its values, preserving unrelated configuration.

Links are stored per business. Both Node and Cloudflare validate HTTPS, official platform hostnames, profile/page paths, credentials/port exclusion and known platform keys. Executable URLs and hostname lookalikes are rejected. New businesses receive no inherited Joseph-specific social defaults.

## Tests and verification

- Node suite: 48 passed, zero failed.
- Cloudflare runtime suite: 29 passed, zero failed.
- New tests cover URL validation/removal and actual D1 owner-only authorization, tenant separation, persistence, invalid update rollback and preservation of scheduling/notification settings.
- Existing booking initialization regression exposed a window-global assumption; optional rendering now uses globalThis, and the full Node suite passes.
- Real browser owner-dashboard save passed in the isolated synthetic fixture.
- Desktop DOM checks verified all nine destinations, icons, accessible labels and safe new-tab attributes.
- Actual child browser widths 320/390/430 pixels showed no horizontal overflow, three header links and 44px targets.
- Existing dark booking-notice background remains rgb(36,29,18); prior mobile contrast and native upload fixes are retained.
- External destinations were opened read-only and verified as described above.
- Live staging settings round-trip matched all three supplied links.
- Live HTML, CSS, social script, booking script and owner files matched reviewed source hashes.
- Eight approved website images remained present, including Joseph's featured sunset portrait.
- Existing booking rows and notification preferences were unchanged by the social settings save.
- Hosted synthetic booking/private JPEG upload, original-byte recovery, customer link and package price checks passed. Test request cancelled and owner signed out afterward.
- Flutter source unchanged; no native build/test/upload performed.

Visual browser review used the isolated loopback fixture; hosted API/file verification used the actual staging service. Screenshot: C:\Users\Huckl\.codex\visualizations\2026\10\28\01a18424-61f7-72e2-9159-18dbe7721e1d\baucom-social-mobile.png.

## Scope

This deployment includes the existing mobile contrast and photo-upload fixes. No pricing or appointment logic changed. SITE_OPEN remains false, communications disabled, and both email/push send flags remain false. No Porkbun DNS, production publication, billing activation, Netlify modification or other Doc project change occurred.

Files: src/social-links.js; src/bookings.js; src/server.js; cloudflare/domain.js; public/social-links.js; public/app.js; public/index.html; public/owner.html; public/owner.js; public/style.css; test/social-links.test.js; test-cloudflare/social-links.test.mjs; README.md; this report.
