import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { stripJpegMetadata } from "../cloudflare/jpeg.js";
test("JPEG privacy removes metadata/comments while preserving progressive pixels", async () => {
  const image = await sharp({
    create: { width: 20, height: 40, channels: 3, background: "#226644" },
  })
    .jpeg({ progressive: true })
    .withMetadata()
    .toBuffer();
  const comment = Buffer.from([255, 254, 0, 8, 112, 114, 105, 118, 97, 116]);
  const source = Buffer.concat([
    image.subarray(0, 2),
    comment,
    image.subarray(2),
    Buffer.from("trailing private data"),
  ]);
  const clean = stripJpegMetadata(source),
    m = await sharp(clean).metadata();
  assert.equal(m.width, 20);
  assert.equal(m.height, 40);
  assert.equal(m.exif, undefined);
  assert.equal(m.icc, undefined);
  assert.equal(m.xmp, undefined);
  assert.ok(!clean.includes(Buffer.from("trailing private data")));
  assert.deepEqual(
    await sharp(clean).raw().toBuffer(),
    await sharp(image).raw().toBuffer(),
  );
  for (const invalid of [
    Buffer.alloc(0),
    Buffer.from([255, 216, 255, 225, 0, 10, 0]),
    Buffer.from([255, 216, 0, 0]),
  ])
    assert.throws(() => stripJpegMetadata(invalid));
});
