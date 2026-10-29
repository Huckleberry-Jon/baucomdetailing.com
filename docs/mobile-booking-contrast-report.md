# Mobile booking contrast corrections — October 28, 2026

## Deployed result

Private staging: https://docdetailing-site-staging.huckleberryservices.workers.dev/#book

Worker version: a23ff79e-af37-4ad3-a49d-d05db654ccf7.

The black-and-gold design is preserved. No appointment backend, database migration, catalog/pricing calculation, DNS, public-booking switch or communication setting changed.

## Root cause and changes

The pricing notice was a bare aside with the legacy nearly-white aside background. The dark theme's .notice rule did not match it, so pale inherited text appeared on that light background.

Added an explicit booking-notice class and scoped foreground/background rules for its title, paragraphs, estimate and consent label. The card is now dark brown with light cream text and a gold border.

The booking form now explicitly specifies readable field text/backgrounds, fully opaque placeholders, labels/helper text/legends, checkbox boundaries, focus outlines, disabled buttons, and success/error/status surfaces. Text inputs use 16px type. Checkbox labels remain fully clickable and have a 44px minimum row height.

The customer photo input remains the original native input type=file, with the same accept/multiple attributes and FileReader/upload behavior. Gold native file-selector button styling includes WebKit's selector. No replacement picker, forced camera access or hidden custom input was introduced.

Error messages include explanatory text such as Request not sent, rather than relying only on color. Client presentation adds state attributes; request payloads, booking API paths, validation rules, service calculations and scheduling logic are unchanged.

## Contrast verification

WCAG AA requires at least 4.5:1 for normal text and 3:1 for applicable non-text control boundaries. Placeholder text is included. Sources: [W3C contrast minimum](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum/), [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Computed rendered form colors were measured in actual 320px, 390px and 430px child browser viewports:

| Element | Contrast |
| --- | ---: |
| Notice title/body, estimate and consent label | 13.38:1 |
| General labels/helper text against booking background | 14.72:1 |
| Text/select/textarea values against light fields | 16.80:1 |
| Placeholder text | 6.80:1 |
| Upload filename against dark upload surface | 13.38:1 |
| Native file-selector button / submit button text | 8.96:1 |
| Error text against its error surface | 10.50:1 |
| Checkbox gold outline against notice | 8.02:1 |
| Field border against field background | 4.06:1 |
| Focus outline against booking background | 11.99:1 |

The error foreground/background were observed during the invalid-date browser test; the ratio was calculated from those observed colors. Border/focus ratios were calculated from authored colors. This is a targeted booking-form check, not a claim of complete site-wide WCAG certification.

All three widths used a single-column form. Reported document scroll widths were 305, 375 and 415px respectively, with no horizontal overflow.

## Browser/mobile flow tests

The browser's advertised top-level viewport override did not apply. Used same-origin frames with real child widths of 320/390/430 CSS pixels so the browser evaluated the actual media queries. Frame support is restricted to the synthetic loopback fixture; it is not in the deployed Worker. The test fixture uses synthetic credentials and no real customer records.

At 390px, real UI interaction verified:
- Package selection and full customer/vehicle/location intake.
- Invalid past date returns readable Request not sent feedback.
- Consent can be selected with keyboard input.
- Native file chooser accepts a synthetic JPEG.
- Corrected request submits successfully and supplies a private customer link.
- Owner sign-in and confirmation.
- Private photo panel shows the uploaded JPEG.
- Customer private link reflects confirmed status; that page was verified outside the narrow frame.
- Customer cancellation cleans up the synthetic request.

The earlier invalid-date attempt did not create an accepted booking. Test data remained isolated. Screenshots show the corrected notice/checkbox and upload field. This browser test does not replace a physical iPhone Safari/picker spot-check.

Screenshot: C:\Users\Huckl\.codex\visualizations\2026\10\28\01a18424-61f7-72e2-9159-18dbe7721e1d\mobile-booking-contrast.png
Measured widths/colors: same directory, mobile-booking-readability.json.

## Regression and live staging checks

- npm.cmd test: 47 passed, zero failed.
- npm.cmd run test:cloudflare: 28 passed, zero failed.
- Production-only Worker bundle excludes /__fixture/ and /__responsive.
- Actual staging HTML/CSS/JS hashes match the verified local files.
- Staging root still presents the tester gate.
- X-Frame-Options DENY and CSP frame-ancestors none remain unchanged on staging.
- Test-only responsive URL returns 404 after unlocking staging.
- Hosted owner login, synthetic request with JPEG upload, private original byte integrity, owner dashboard record, private customer link and approved package pricing passed.
- Hosted test request cancelled afterward; owner signed out.
- No accepted/sent/delivered outbound records observed.
- No native app changes or Flutter test rerun.

## Source changes

public/style.css; public/index.html; public/app.js; scripts/cloudflare-browser-fixture.mjs; test-cloudflare/entry.js; this report and README.md.

Only the first three are website presentation assets. Synthetic fixture changes never enter the deployed production Worker bundle. No secret or environment file is committed.
