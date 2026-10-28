import sharp from "sharp";
import { randomUUID, createHash } from "node:crypto";
import { BUSINESS } from "./catalog.js";
import { requireThat, Problem } from "./security.js";
import { transaction } from "./db.js";
export async function preparePhotos(photos = []) {
  requireThat(
    Array.isArray(photos) && photos.length <= 6,
    "Upload at most 6 photos",
  );
  let total = 0;
  const prepared = [];
  for (const photo of photos) {
    requireThat(
      photo &&
        typeof photo.base64 === "string" &&
        photo.base64.length <= 6 * 1024 * 1024 &&
        /^[A-Za-z0-9+/]*={0,2}$/.test(photo.base64),
      "Invalid photo encoding",
    );
    const bytes = Buffer.from(photo.base64, "base64");
    total += bytes.length;
    requireThat(
      bytes.length > 0 &&
        bytes.length <= 4 * 1024 * 1024 &&
        total <= 16 * 1024 * 1024,
      "Each photo must be at most 4 MB; total at most 16 MB",
    );
    let meta, preview;
    try {
      const image = sharp(bytes, {
        limitInputPixels: 40000000,
        failOn: "warning",
        animated: false,
      });
      meta = await image.metadata();
      requireThat(
        ["jpeg", "png", "webp"].includes(meta.format) && !(meta.pages > 1),
        "Use a single-frame JPEG, PNG or WebP photograph",
      );
      preview = await image
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch (e) {
      if (e.status) throw e;
      throw new Problem(
        400,
        "Photo could not be decoded. Use a JPEG, PNG or WebP image under 4 MB.",
      );
    }
    prepared.push({
      filename:
        typeof photo.name === "string"
          ? photo.name.replace(/[^\w. -]/g, "_").slice(0, 120)
          : "photo",
      mime: "image/" + (meta.format === "jpeg" ? "jpeg" : meta.format),
      original: bytes,
      preview,
      sha: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return prepared;
}
export function storePhotos(db, b, photos, kind = "intake") {
  const job = db
    .prepare("SELECT id FROM jobs WHERE booking_id=? AND business_id=?")
    .get(b.id, BUSINESS);
  if (kind !== "intake")
    requireThat(
      job,
      "Confirm the booking before attaching job before/after photographs",
      409,
    );
  const count = db
    .prepare(
      "SELECT count(*) n FROM media WHERE booking_id=? AND business_id=?",
    )
    .get(b.id, BUSINESS).n;
  requireThat(
    count +
      photos.filter(
        (p) =>
          !db
            .prepare(
              "SELECT 1 FROM media WHERE booking_id=? AND sha256=? AND kind=?",
            )
            .get(b.id, p.sha, kind),
      ).length <=
      24,
    "Maximum 24 photographs per booking",
  );
  for (const p of photos)
    db.prepare(
      "INSERT OR IGNORE INTO media(id,business_id,booking_id,customer_id,vehicle_id,job_id,kind,filename,original_mime,original,preview,sha256,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      randomUUID(),
      BUSINESS,
      b.id,
      b.customer_id,
      b.vehicle_id,
      job?.id ?? null,
      kind,
      p.filename,
      p.mime,
      p.original,
      p.preview,
      p.sha,
      Date.now(),
    );
  return listPhotos(db, b.id);
}
export function listPhotos(db, bookingId) {
  return db
    .prepare(
      "SELECT id,booking_id,job_id,kind,filename,length(original) original_bytes,length(preview) preview_bytes,include_on_invoice,created_at FROM media WHERE business_id=? AND booking_id=? ORDER BY created_at",
    )
    .all(BUSINESS, bookingId);
}
export function mediaRecord(db, id) {
  const p = db
    .prepare("SELECT * FROM media WHERE id=? AND business_id=?")
    .get(id, BUSINESS);
  requireThat(p, "Photo not found", 404);
  return p;
}
export function invoicePhotoManifest(db, bookingId) {
  return db
    .prepare(
      "SELECT id,job_id,kind,filename,'image/jpeg' mime,length(preview) bytes FROM media WHERE business_id=? AND booking_id=? AND include_on_invoice=1 ORDER BY kind,created_at",
    )
    .all(BUSINESS, bookingId);
}
export function selectInvoicePhoto(db, id, include) {
  requireThat(typeof include === "boolean", "Invalid invoice selection");
  transaction(db, () => {
    mediaRecord(db, id);
    db.prepare(
      "UPDATE media SET include_on_invoice=? WHERE id=? AND business_id=?",
    ).run(include ? 1 : 0, id, BUSINESS);
  });
}
