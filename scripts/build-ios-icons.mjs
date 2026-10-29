import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
const root = "apps/docdetailing_owner";
const svg = fs.readFileSync(
  path.join(root, "assets/branding/docdetailing-icon.svg"),
);
const dir = path.join(root, "ios/Runner/Assets.xcassets/AppIcon.appiconset");
const catalog = JSON.parse(
  fs.readFileSync(path.join(dir, "Contents.json"), "utf8"),
);
const done = new Set();
for (const item of catalog.images) {
  if (done.has(item.filename)) continue;
  done.add(item.filename);
  const pixels =
    Number(item.size.split("x")[0]) * Number(item.scale.slice(0, -1));
  await sharp(svg)
    .resize(pixels, pixels)
    .flatten({ background: "#173f35" })
    .removeAlpha()
    .png()
    .toFile(path.join(dir, item.filename));
}
console.log(
  "Generated " +
    done.size +
    " opaque app icons from the DocDetailing vector source.",
);
