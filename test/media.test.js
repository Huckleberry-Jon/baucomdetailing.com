import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { fixture, requestInput } from "./helpers.js";
import {
  preparePhotos,
  storePhotos,
  listPhotos,
  mediaRecord,
  selectInvoicePhoto,
  invoicePhotoManifest,
} from "../src/media.js";
export const syntheticPhoto = async () => ({
  name: "synthetic.png",
  base64: (
    await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: "#638768" },
    })
      .png()
      .toBuffer()
  ).toString("base64"),
});
test("booking and photos commit atomically, preserve originals, resize previews, and deduplicate", async () => {
  const { db, s } = fixture(),
    input = { ...requestInput(), photos: [await syntheticPhoto()] },
    photos = await preparePhotos(input.photos),
    b = s.create(input, "photos", photos);
  assert.equal(listPhotos(db, b.id).length, 1);
  const p = mediaRecord(db, listPhotos(db, b.id)[0].id);
  assert.deepEqual(
    Buffer.from(p.original),
    Buffer.from(input.photos[0].base64, "base64"),
  );
  assert.equal((await sharp(Buffer.from(p.preview)).metadata()).width, 1600);
  s.create(input, "photos", photos);
  assert.equal(listPhotos(db, b.id).length, 1);
  assert.throws(
    () => storePhotos(db, s.get(b.id), photos, "before"),
    /Confirm/,
  );
  s.transition(b.id, "confirm", { version: 1, durationMinutes: 60 });
  storePhotos(db, s.get(b.id), photos, "before");
  storePhotos(db, s.get(b.id), photos, "after");
  assert.equal(listPhotos(db, b.id).length, 3);
  assert.ok(listPhotos(db, b.id).every((p) => p.job_id));
  selectInvoicePhoto(db, listPhotos(db, b.id)[1].id, true);
  assert.equal(invoicePhotoManifest(db, b.id).length, 1);
  db.close();
});
test("image validation rejects non-images, SVG, oversized files and excessive file counts", async () => {
  await assert.rejects(
    preparePhotos([
      {
        name: "fake.jpg",
        base64: Buffer.from("not an image").toString("base64"),
      },
    ]),
    /decoded/,
  );
  await assert.rejects(
    preparePhotos([
      {
        name: "vector.svg",
        base64: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>',
        ).toString("base64"),
      },
    ]),
    /JPEG/,
  );
  await assert.rejects(
    preparePhotos(new Array(7).fill({ base64: "" })),
    /at most 6/,
  );
  await assert.rejects(
    preparePhotos([
      { base64: Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64") },
    ]),
    /4 MB/,
  );
});
test("failed media write rolls back booking, customer, vehicle and notification records", () => {
  const { db, s } = fixture();
  db.exec(
    "CREATE TRIGGER test_media_failure BEFORE INSERT ON media BEGIN SELECT RAISE(ABORT,'test storage failure'); END;",
  );
  assert.throws(
    () =>
      s.create(requestInput(), "rollback", [
        {
          filename: "test",
          mime: "image/jpeg",
          original: Buffer.from("x"),
          preview: Buffer.from("x"),
          sha: "test",
        },
      ]),
    /storage failure/,
  );
  for (const table of ["bookings", "customers", "vehicles", "notifications"])
    assert.equal(db.prepare("SELECT count(*) n FROM " + table).get().n, 0);
  db.close();
});
