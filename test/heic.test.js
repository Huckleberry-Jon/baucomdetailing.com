import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { preparePhotos, listPhotos, mediaRecord } from "../src/media.js";
import { fixture, requestInput } from "./helpers.js";
import { isHeic } from "../src/heic.js";
test("real HEIC bytes decode to JPEG while exact private original remains preserved", async () => {
  const bytes = readFileSync(
    new URL("./fixtures/heic/rainbow.heic", import.meta.url),
  );
  assert.equal(isHeic(bytes), true);
  const photos = await preparePhotos([
      { name: "iPhone.HEIC", base64: bytes.toString("base64") },
    ]),
    meta = await sharp(photos[0].preview).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width, 451);
  assert.equal(meta.height, 461);
  assert.equal(meta.exif, undefined);
  assert.equal(photos[0].mime, "image/heic");
  const { db, s } = fixture(),
    b = s.create(requestInput(), "heic", photos),
    stored = mediaRecord(db, listPhotos(db, b.id)[0].id);
  assert.deepEqual(Buffer.from(stored.original), bytes);
  db.close();
});
test("truncated HEIC is rejected without a partial booking", async () => {
  const bytes = readFileSync(
    new URL("./fixtures/heic/rainbow.heic", import.meta.url),
  );
  await assert.rejects(
    preparePhotos([
      { name: "bad.heic", base64: bytes.subarray(0, 32).toString("base64") },
    ]),
    /HEIC/,
  );
});
