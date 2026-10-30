import { randomUUID } from "node:crypto";
import { BUSINESS } from "./catalog.js";
import { requireThat, text } from "./security.js";
import { transaction } from "./db.js";
export const websiteSlots = [
  { slot: "hero", label: "Homepage hero", ratio: "3:4" },
  { slot: "banner", label: "Route 66 brand banner", ratio: "4:1" },
  { slot: "package-route66", label: "Route 66 Revival package", ratio: "3:2" },
  { slot: "package-dustoff", label: "The Dust Off package", ratio: "3:2" },
  { slot: "package-finalmile", label: "The Final Mile package", ratio: "3:2" },
  { slot: "action-1", label: "Owner portrait", ratio: "3:2" },
  { slot: "action-2", label: "Owner truck", ratio: "3:2" },
  { slot: "branding-logo", label: "Business logo / branding", ratio: "1:1" },
  ...["1", "2", "3", "4"].flatMap((n) =>
    ["before", "after"].map((kind) => ({
      slot: "gallery-" + n + "-" + kind,
      label: "Transformation " + n + " — " + kind,
      ratio: "3:2",
    })),
  ),
];
export function saveWebsitePhoto(db, input, photo, owner) {
  requireThat(
    websiteSlots.some((s) => s.slot === input.slot),
    "Choose a website photo location",
  );
  const alt = text(input.alt, "Accessible photo description", 200),
    caption =
      typeof input.caption === "string" ? input.caption.slice(0, 500) : "",
    rights = text(input.rightsNote, "Permission/ownership record", 500);
  return transaction(db, () => {
    db.prepare(
      "INSERT INTO website_photos VALUES(?,?,?,?,?,?,'draft',?,?,?,?,?) ON CONFLICT(business_id,slot) DO UPDATE SET alt=excluded.alt,caption=excluded.caption,rights_note=excluded.rights_note,status='draft',original_mime=excluded.original_mime,original=excluded.original,preview=excluded.preview,sha256=excluded.sha256,updated_at=excluded.updated_at",
    ).run(
      randomUUID(),
      BUSINESS,
      input.slot,
      alt,
      caption,
      rights,
      photo.mime,
      photo.original,
      photo.preview,
      photo.sha,
      Date.now(),
    );
    db.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?)").run(
      randomUUID(),
      BUSINESS,
      owner.id,
      "website-photo.draft-saved",
      input.slot,
      Date.now(),
    );
    return { ok: true, status: "draft" };
  });
}
export function publishWebsitePhoto(db, input, owner) {
  requireThat(typeof input.publish === "boolean", "Invalid publication state");
  if (input.publish)
    requireThat(
      input.confirmPermission === true,
      "Explicit permission confirmation required for public website use",
    );
  return transaction(db, () => {
    const row = db
      .prepare("SELECT id FROM website_photos WHERE business_id=? AND slot=?")
      .get(BUSINESS, input.slot);
    requireThat(row, "Upload this website photo first", 404);
    db.prepare(
      "UPDATE website_photos SET status=?,updated_at=? WHERE id=? AND business_id=?",
    ).run(input.publish ? "published" : "draft", Date.now(), row.id, BUSINESS);
    db.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?)").run(
      randomUUID(),
      BUSINESS,
      owner.id,
      input.publish ? "website-photo.published" : "website-photo.unpublished",
      row.id,
      Date.now(),
    );
    return { ok: true };
  });
}
export function publicWebsitePhotos(db) {
  return db
    .prepare(
      "SELECT id,slot,alt,caption,updated_at FROM website_photos WHERE business_id=? AND status='published'",
    )
    .all(BUSINESS);
}
export function websitePhoto(db, id, owner = false) {
  const row = db
    .prepare(
      "SELECT * FROM website_photos WHERE id=? AND business_id=?" +
        (owner ? "" : " AND status='published'"),
    )
    .get(id, BUSINESS);
  requireThat(row, "Website photo not found", 404);
  return row;
}
