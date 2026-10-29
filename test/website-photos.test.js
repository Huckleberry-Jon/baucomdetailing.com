import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { fixture } from "./helpers.js";
import { preparePhotos } from "../src/media.js";
import {
  websiteSlots,
  saveWebsitePhoto,
  publishWebsitePhoto,
  publicWebsitePhotos,
  websitePhoto,
} from "../src/website-photos.js";
import { BUSINESS } from "../src/catalog.js";
test("website photographs stay private drafts until explicit permission and revoke publication on replacement", async () => {
  const { db } = fixture(),
    owner = { id: "website-owner" };
  db.prepare("INSERT INTO owners VALUES(?,?,?,?)").run(
    owner.id,
    BUSINESS,
    "test@example.invalid",
    "synthetic",
  );
  const photo = (
      await preparePhotos([
        {
          name: "synthetic.png",
          base64: (
            await sharp({
              create: {
                width: 20,
                height: 20,
                channels: 3,
                background: "green",
              },
            })
              .png()
              .toBuffer()
          ).toString("base64"),
        },
      ])
    )[0],
    input = {
      slot: "hero",
      alt: "Synthetic test image",
      caption: "Test only",
      rightsNote: "Synthetic fixture generated for automated tests",
    };
  saveWebsitePhoto(db, input, photo, owner);
  assert.equal(publicWebsitePhotos(db).length, 0);
  const row = db.prepare("SELECT * FROM website_photos").get();
  assert.throws(() => websitePhoto(db, row.id), /not found/);
  assert.deepEqual(
    Buffer.from(websitePhoto(db, row.id, true).original),
    photo.original,
  );
  assert.throws(
    () =>
      publishWebsitePhoto(
        db,
        { slot: "hero", publish: true, confirmPermission: false },
        owner,
      ),
    /permission/,
  );
  publishWebsitePhoto(
    db,
    { slot: "hero", publish: true, confirmPermission: true },
    owner,
  );
  assert.equal(publicWebsitePhotos(db)[0].rights_note, undefined);
  assert.equal(websitePhoto(db, row.id).status, "published");
  saveWebsitePhoto(db, input, photo, owner);
  assert.equal(publicWebsitePhotos(db).length, 0);
  assert.equal(db.prepare("SELECT count(*) n FROM audit_events").get().n, 3);
  assert.equal(websiteSlots.length, 12);
  db.close();
});
test("website slots cover every supplied package plus distinct action, gallery and branding locations", () => {
  for (const slot of [
    "hero",
    "package-route66",
    "package-dustoff",
    "package-finalmile",
    "action-1",
    "action-2",
    "branding-logo",
    "gallery-1-before",
    "gallery-1-after",
  ])
    assert.ok(websiteSlots.some((s) => s.slot === slot));
  const { db } = fixture();
  assert.throws(
    () =>
      saveWebsitePhoto(db, { slot: "private-customer-photo" }, null, {
        id: "x",
      }),
    /location/,
  );
  db.close();
});
