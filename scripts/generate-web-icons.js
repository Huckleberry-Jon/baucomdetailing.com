import sharp from "sharp";
import { writeFile } from "node:fs/promises";
for (const size of [192, 512, 180]) {
  const image = await sharp("public/icon.svg")
    .resize(size, size)
    .flatten({ background: "#192e29" })
    .png()
    .toBuffer();
  await writeFile(
    size === 180 ? "public/apple-touch-icon.png" : `public/icon-${size}.png`,
    image,
  );
}
console.log(
  "Provisional web icons generated from the existing vector mark; not native release assets.",
);
