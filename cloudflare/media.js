import { stripJpegMetadata } from "./jpeg.js";
import { randomUUID } from "node:crypto";
import { hash, requireThat, Problem, text } from "../src/security.js";
export function slots(catalog) {
  return [
    { slot: "hero", label: "Homepage hero", ratio: "16:9" },
    ...catalog
      .filter((s) => s.kind === "package")
      .map((p) => ({
        slot: "package-" + p.id,
        label: p.name + " package",
        ratio: "3:2",
      })),
    { slot: "action-1", label: "Detailer working", ratio: "3:2" },
    { slot: "action-2", label: "Detailing in action", ratio: "3:2" },
    { slot: "branding-logo", label: "Business branding", ratio: "1:1" },
    ...["1", "2"].flatMap((n) =>
      ["before", "after"].map((kind) => ({
        slot: "gallery-" + n + "-" + kind,
        label: "Transformation " + n + " " + kind,
        ratio: "3:2",
      })),
    ),
  ];
}
function sniff(bytes) {
  if (bytes[0] === 255 && bytes[1] === 216) return "jpeg";
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  if (
    bytes.toString("ascii", 4, 8) === "ftyp" &&
    ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(
      bytes.toString("ascii", 8, 12),
    )
  )
    return "heic";
  throw new Problem(400, "Use JPEG, PNG, WebP or HEIC photographs");
}
export async function prepareMedia(env, tenant, photos = []) {
  requireThat(
    Array.isArray(photos) && photos.length <= 6,
    "Upload at most 6 photos",
  );
  let total = 0;
  const prepared = [];
  for (const p of photos) {
    requireThat(
      p &&
        typeof p.base64 === "string" &&
        p.base64.length <= 6 * 1024 * 1024 &&
        /^[A-Za-z0-9+/]*={0,2}$/.test(p.base64),
      "Invalid photo encoding",
    );
    const bytes = Buffer.from(p.base64, "base64");
    total += bytes.length;
    requireThat(
      bytes.length > 0 &&
        bytes.length <= 4 * 1024 * 1024 &&
        total <= 16 * 1024 * 1024,
      "Each photo must be at most 4 MB; total at most 16 MB",
    );
    const format = sniff(bytes);
    requireThat(env.IMAGES, "Image decoder is not configured", 503);
    let preview;
    try {
      const info = await env.IMAGES.info(new Blob([bytes]).stream());
      requireThat(
        info.width > 0 &&
          info.height > 0 &&
          info.width * info.height <= 40000000 &&
          !(info.frames > 1),
        "Use a single-frame photograph under 40 megapixels",
      );
      const result = await env.IMAGES.input(new Blob([bytes]).stream())
        .transform({
          width: 1600,
          height: 1600,
          fit: "scale-down",
          metadata: "none",
        })
        .output({ format: "image/jpeg", quality: 80 });
      const response = result.response();
      preview = stripJpegMetadata(Buffer.from(await response.arrayBuffer()));
      requireThat(
        preview.length > 0 && preview.length <= 4 * 1024 * 1024,
        "Invalid image preview",
      );
    } catch (e) {
      if (e.status) throw e;
      throw new Problem(
        400,
        "Photo could not be decoded. Retry a JPEG, PNG, WebP or HEIC under 4 MB.",
      );
    }
    const sha = hash(bytes),
      base = env.DATA_NAMESPACE + "/" + tenant + "/" + randomUUID(),
      original_key = base + "/original",
      preview_key = base + "/preview.jpg";
    // Originals and previews are private. Keys are immutable and never returned to browsers.
    await env.MEDIA.put(original_key, bytes, {
      sha256: sha,
      httpMetadata: { contentType: "image/" + format },
      customMetadata: { sha256: sha, business: tenant },
    });
    await env.MEDIA.put(preview_key, preview, {
      sha256: hash(preview),
      httpMetadata: { contentType: "image/jpeg" },
      customMetadata: { sha256: hash(preview), business: tenant },
    });
    prepared.push({
      filename:
        typeof p.name === "string"
          ? p.name.replace(/[^\w. -]/g, "_").slice(0, 120)
          : "photo",
      mime: "image/" + format,
      original_key,
      preview_key,
      sha,
      original_bytes: bytes.length,
      preview_bytes: preview.length,
    });
  }
  return prepared;
}
export async function mediaResponse(env, tenant, p, original = false) {
  const key = original ? p.original_key : p.preview_key;
  requireThat(
    key.startsWith(env.DATA_NAMESPACE + "/" + tenant + "/"),
    "Media ownership mismatch",
    403,
  );
  const object = await env.MEDIA.get(key);
  requireThat(object, "Photograph unavailable", 404);
  const bytes = await object.arrayBuffer();
  if (object.customMetadata?.sha256)
    requireThat(
      hash(Buffer.from(bytes)) === object.customMetadata.sha256,
      "Media integrity check failed",
      503,
    );
  if (original)
    requireThat(
      hash(Buffer.from(bytes)) === p.sha256,
      "Original integrity check failed",
      503,
    );
  return new Response(bytes, {
    headers: {
      "Content-Type": original ? p.original_mime : "image/jpeg",
      "Content-Disposition": original
        ? 'attachment; filename="original-photo"'
        : "inline",
      "Cache-Control": "no-store",
    },
  });
}
export async function addPhotos(service, body, photos, owner) {
  requireThat(
    ["intake", "before", "after"].includes(body.kind),
    "Invalid photo kind",
  );
  return service.atomic(async (business, commands) => {
    const b = await service.get(body.bookingId),
      count = await service.first(
        "SELECT count(*) n FROM media WHERE business_id=? AND booking_id=?",
        service.tenant,
        b.id,
      );
    const existing = await service.all(
        "SELECT sha256 FROM media WHERE business_id=? AND booking_id=? AND kind=?",
        service.tenant,
        b.id,
        body.kind,
      ),
      fresh = photos.filter((p) => !existing.some((e) => e.sha256 === p.sha));
    requireThat(
      count.n + fresh.length <= 24,
      "At most 24 photographs per booking",
    );
    const job = await service.first(
      "SELECT id FROM jobs WHERE business_id=? AND booking_id=?",
      service.tenant,
      b.id,
    );
    service.mediaCommands(commands, b, fresh, body.kind, job?.id ?? null);
    service.audit(commands, owner.id, "media.uploaded", b.id);
    return { ok: true };
  });
}
export async function saveWebsitePhoto(service, body, photos, owner) {
  requireThat(photos.length === 1, "Upload one website photograph at a time");
  requireThat(
    slots(await service.catalog()).some((s) => s.slot === body.slot),
    "Choose a website photo location",
  );
  const p = photos[0],
    alt = text(body.alt, "Accessible photo description", 200),
    rights = text(body.rightsNote, "Permission/ownership record", 500),
    caption =
      typeof body.caption === "string" ? body.caption.slice(0, 500) : "";
  return service.atomic(async (b, commands) => {
    commands.push(
      service.command(
        "INSERT INTO website_photos VALUES(?,?,?,?,?,?,'draft',?,?,?,?,?) ON CONFLICT(business_id,slot) DO UPDATE SET alt=excluded.alt,caption=excluded.caption,rights_note=excluded.rights_note,status='draft',original_mime=excluded.original_mime,original_key=excluded.original_key,preview_key=excluded.preview_key,sha256=excluded.sha256,updated_at=excluded.updated_at",
        randomUUID(),
        service.tenant,
        body.slot,
        alt,
        caption,
        rights,
        p.mime,
        p.original_key,
        p.preview_key,
        p.sha,
        Date.now(),
      ),
    );
    service.audit(commands, owner.id, "website-photo.draft-saved", body.slot);
    return { ok: true, status: "draft" };
  });
}
