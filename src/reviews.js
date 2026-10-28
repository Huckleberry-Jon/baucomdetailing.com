import { randomUUID } from "node:crypto";
import { BUSINESS } from "./catalog.js";
import { transaction } from "./db.js";
import { requireThat, text, hash } from "./security.js";
export function googleReviewUrl(value) {
  if (value === null || value === "") return null;
  let u;
  try {
    u = new URL(value);
  } catch {
    requireThat(false, "Invalid Google review URL");
  }
  requireThat(
    u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      [
        "google.com",
        "www.google.com",
        "search.google.com",
        "maps.google.com",
        "g.page",
        "maps.app.goo.gl",
      ].includes(u.hostname),
    "Use an official HTTPS Google review link",
  );
  return u.href;
}
export function reviewLinks(settings, origin) {
  return {
    website: new URL("/#reviews", origin).href,
    google: googleReviewUrl(settings.googleReviewUrl),
  };
}
export function publicReviews(db) {
  return db
    .prepare(
      "SELECT id,display_name,rating,feedback,created_at,CASE WHEN booking_id IS NOT NULL THEN 1 ELSE 0 END verified_job FROM reviews WHERE business_id=? AND status='approved' ORDER BY created_at DESC LIMIT 100",
    )
    .all(BUSINESS);
}
export function submitReview(service, input, key, secret) {
  text(key, "Idempotency key", 100);
  requireThat(!input.website, "Review rejected");
  requireThat(input.consent === true, "Consent to public display is required");
  const name = text(input.displayName, "Display name", 100),
    feedback = text(input.feedback, "Review", 3000);
  requireThat(
    feedback.length >= 10,
    "Please provide at least 10 characters of feedback",
  );
  requireThat(
    Number.isInteger(input.rating) && input.rating >= 1 && input.rating <= 5,
    "Choose a rating from 1 to 5",
  );
  if (input.bookingId) {
    const booking = service.authorizeCustomer(input.bookingId, secret);
    requireThat(
      booking.status === "completed",
      "Job must be completed before a verified review",
      409,
    );
  }
  const digest = hash(JSON.stringify(input));
  return transaction(service.db, () => {
    const existing = service.db
      .prepare(
        "SELECT id,request_hash,status FROM reviews WHERE business_id=? AND idempotency_key=?",
      )
      .get(BUSINESS, key);
    if (existing) {
      requireThat(
        existing.request_hash === digest,
        "Review key already used for different feedback",
        409,
      );
      return { id: existing.id, status: existing.status, duplicate: true };
    }
    const id = randomUUID();
    service.db
      .prepare(
        "INSERT INTO reviews(id,business_id,booking_id,display_name,rating,feedback,consent,idempotency_key,request_hash,created_at) VALUES(?,?,?,?,?,?,1,?,?,?)",
      )
      .run(
        id,
        BUSINESS,
        input.bookingId ?? null,
        name,
        input.rating,
        feedback,
        key,
        digest,
        Date.now(),
      );
    return { id, status: "pending" };
  });
}
export function moderateReview(db, input, owner) {
  return transaction(db, () => {
    const row = db
      .prepare("SELECT * FROM reviews WHERE id=? AND business_id=?")
      .get(input.id, BUSINESS);
    requireThat(row, "Review not found", 404);
    requireThat(
      row.version === input.version,
      "Review changed; refresh before editing",
      409,
    );
    requireThat(
      ["approved", "rejected", "pending"].includes(input.status),
      "Invalid moderation status",
    );
    const reasons = [
      "spam",
      "inappropriate_content",
      "personal_information",
      "unrelated_content",
      "duplicate",
    ];
    if (input.status === "rejected")
      requireThat(
        reasons.includes(input.reason),
        "Choose a content-policy reason; ratings are not a rejection reason",
      );
    const reason = input.status === "rejected" ? input.reason : null;
    db.prepare(
      "UPDATE reviews SET status=?,moderation_reason=?,version=version+1,moderated_at=? WHERE id=? AND business_id=?",
    ).run(input.status, reason, Date.now(), row.id, BUSINESS);
    db.prepare("INSERT INTO review_moderation VALUES(?,?,?,?,?,?,?)").run(
      randomUUID(),
      row.id,
      owner.id,
      row.status,
      input.status,
      reason,
      Date.now(),
    );
    return { ok: true };
  });
}
