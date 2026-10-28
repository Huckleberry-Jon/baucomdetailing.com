import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { runtime, seed, login, call, input, origin } from "./helpers.mjs";
test("actual Images: JPEG EXIF orientation, metadata stripping, PNG conversion and private original integrity", async () => {
  const { mf, db } = await runtime();
  try {
    await seed(db);
    const cookie = await login(mf);
    const jpeg = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#227744" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const png = await sharp({
      create: { width: 30, height: 10, channels: 4, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    const created = await call(mf, "/api/bookings", {
      method: "POST",
      key: randomUUID(),
      body: input({
        photos: [
          { name: "oriented.jpg", base64: jpeg.toString("base64") },
          { name: "alpha.png", base64: png.toString("base64") },
        ],
      }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const photos = (
      await call(mf, "/api/owner/photos?booking=" + created.data.id, { cookie })
    ).data;
    for (const [filename, bytes, width, height] of [
      ["oriented.jpg", jpeg, 20, 40],
      ["alpha.png", png, 30, 10],
    ]) {
      const p = photos.find((p) => p.filename === filename);
      assert.ok(p);
      const preview = await mf.dispatchFetch(
        origin + "/api/owner/photo?id=" + p.id,
        { headers: { Cookie: cookie } },
      );
      assert.equal(preview.status, 200);
      const meta = await sharp(
        Buffer.from(await preview.arrayBuffer()),
      ).metadata();
      assert.equal(meta.format, "jpeg");
      assert.equal(meta.width, width);
      assert.equal(meta.height, height);
      assert.equal(meta.exif, undefined);
      assert.equal(meta.orientation, undefined);
      const original = await mf.dispatchFetch(
        origin + "/api/owner/photo?id=" + p.id + "&original=1",
        { headers: { Cookie: cookie } },
      );
      assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
    }
  } finally {
    await mf.dispose();
  }
});
