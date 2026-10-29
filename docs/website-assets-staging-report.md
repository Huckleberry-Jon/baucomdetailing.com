# Baucom website assets — private staging update

Current featured Meet Joseph image: Joseph-approved sunset portrait; see the latest update at the end of this report. Earlier asset mapping is retained below as history.

October 28, 2026.

## Result

Updated private preview:
https://docdetailing-site-staging.huckleberryservices.workers.dev/

Staging Worker version: 143b8c64-a6e6-410e-8c3d-352b05e98d4e.
Public bookings and outbound email/push remain disabled. Production DNS, Netlify and other Doc projects were not changed.

The archive at the newly mentioned C:\DocDetailing\Baucom_Detailing_Assets_for_Dex.zip path was not present during inspection. Used the previously supplied C:\Users\Huckl\Downloads\Baucom_Detailing_Assets_for_Dex (1).zip instead. Its README and contents match the requested branding/portrait/truck set. No uploaded document instructions were used as independent authority; the project owner's explicit staging request authorized the selected use and restrictions.

## Applied images

| Website placement | Supplied source | Treatment |
| --- | --- | --- |
| Header/footer emblem | IMG_1748.jpeg | Tight crop around the gold truck emblem |
| Hero artwork | IMG_1752.jpeg | Black margins/phone overlay excluded; Route 66 artwork retained |
| Wide brand banner | Top banner of IMG_1757.jpeg | Pricing section excluded |
| Route 66 Revival | IMG_1754.jpeg | Cropped service artwork, no screenshot margins/phone overlay |
| The Dust Off | IMG_1753.jpeg | Cropped service artwork, no screenshot margins/phone overlay |
| The Final Mile | IMG_1755.jpeg | Cropped title/highway artwork excluding the phone overlay |
| Meet Joseph | IMG_1760.jpeg | Cowboy-hat portrait; owner identification/caption |
| Joseph's truck | IMG_1759.jpeg | Blurred screenshot padding removed; explicitly labelled owner truck |

The personal collage IMG_1758.jpeg was NOT uploaded or displayed. Full pricing posters were withheld because they conflict with the approved live catalog. Package names/descriptions and editable prices remain Route 66 Revival $79–119, Dust Off $119–169, Final Mile $169–229. No prices were inferred from old artwork.

Service graphics are described as artwork, not real detailing results. The truck is not presented as a before/after job. Four genuine before/after slots remain pending appropriate work photographs.

## Preservation, optimization and access

Original JPEG masters were extracted without modification into private ignored data/website-assets. The original ZIP remains unchanged in Downloads. Used-source SHA-256 hashes were verified before upload. Crops and hashes are recorded in the private data/website-assets/manifest.json.

Eight optimized JPEG derivatives total 634,846 bytes before managed preview re-encoding. No upscaling or AI reconstruction was used. Original masters were preserved locally; the website's R2 originals are the optimized crop files, not replacements for those masters.

Images were uploaded through the existing authenticated website-photo manager and consent/audit workflow. Publication status means displayed within the gated staging site; the permission record expressly limits this pass to private staging. R2 originals/previews remain private and no photo was added to public static assets or Git. All eight gallery endpoints still reject visitors without the tester gate.

Added one configurable banner slot (12 total slots), and changed old working/action labels to owner portrait/truck so the supplied pictures are accurately described. The existing owner image editor remains available.

Restored the black/gold Route 66 palette, contained service artwork without stretching it, and adapted owner/truck framing for their different source ratios. Added accurate staging footer text.

## Verification

- Node suite: 47 passing.
- Cloudflare runtime suite: 28 passing.
- All eight hosted website-photo uploads and gated JPEG downloads passed; preview EXIF removed.
- Anonymous catalog/gallery access blocked.
- Hosted package prices match the approved ranges exactly.
- Hosted synthetic booking, owner confirmation, conflicting confirmation rejection, calendar entry and private customer status passed after the image update.
- Original business settings restored; both synthetic requests cancelled; owner test session logged out.
- Final deployed stylesheet hash matches the reviewed local source.
- Browser visual review of the identical code and approved images ran in the isolated loopback fixture, avoiding exposure of hosted login secrets. Hero, package graphics/prices and Joseph/truck framing were inspected. This visual fixture is separate from the actual hosted API verification.
- Actual hosted preview tab still displays the tester access gate for unauthenticated visitors.

Screenshots:
C:\Users\Huckl\.codex\visualizations\2026\10\28\01a18424-61f7-72e2-9159-18dbe7721e1d\baucom-branded-preview.png
C:\Users\Huckl\.codex\visualizations\2026\10\28\01a18424-61f7-72e2-9159-18dbe7721e1d\baucom-owner-truck-preview.png

No native app files changed; the existing eight Flutter tests were not rerun for this website-only update. Physical iPhone acceptance, provider HEIC handling, external recovery and production approval remain the previously documented release gates.

## Files changed

.gitignore; cloudflare/media.js; src/website-photos.js; public/index.html; public/app.js; public/style.css; test/website-photos.test.js; README.md; docs/website-assets-staging-report.md.

Private originals, optimized images, manifests and upload proof are ignored under data/. Asset archives at project root are now explicitly ignored to prevent accidental Git publication of private photographs.

## Latest update — Joseph-approved sunset portrait

The project owner supplied Sunset Texas Mobile Detailing Portrait.png and confirmed Joseph's approval for featured use in Meet Joseph on private staging.

Replaced only the action-1 image through the existing authenticated photo/permission workflow. The image now spans the section at its original 3:2 aspect ratio; the separate truck photo remains secondary. The original desktop PNG is unchanged and a byte-identical private master is retained under ignored data/website-assets. The previous approved portrait/master remains preserved.

Original: 2,687,481 bytes; hosted JPEG preview: 302,787 bytes, 1536×1024, no EXIF. The full supplied composition is retained. No image or credentials were added to Git.

Hosted image download and anonymous-access rejection passed. Booking records before/after the update matched exactly, approved service pricing remained unchanged, and the existing private customer booking link still returned its saved status. No booking endpoint or code was changed. Only CSS and this report changed in source; the full regression suites were not repeated for this presentation-only change.

Current staging Worker version: 4eba3dc3-a689-42c0-b8b7-b1ae296395aa.
Visual inspection of the same layout/image was completed in the isolated loopback fixture. Screenshot: joseph-sunset-feature-preview.png in the task's private visualizations folder.

Public launch, DNS and outbound communication settings remain unchanged and disabled.
