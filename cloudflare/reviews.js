import { randomUUID } from "node:crypto";
import { hash, requireThat, text } from "../src/security.js";
import { googleReviewUrl } from "./domain.js";
export const reviewLinks = (settings, origin) => ({
  website: new URL("/#reviews", origin).href,
  google: googleReviewUrl(settings.googleReviewUrl),
});
export async function submitReview(s, input, key, secret) {
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
  return s.atomic(async (b, commands) => {
    if (input.bookingId)
      requireThat(
        (await s.authorizeCustomer(input.bookingId, secret)).status ===
          "completed",
        "Job must be completed before a verified review",
        409,
      );
    const digest = hash(JSON.stringify(input)),
      old = await s.first(
        "SELECT id,request_hash,status FROM reviews WHERE business_id=? AND idempotency_key=?",
        s.tenant,
        key,
      );
    if (old) {
      requireThat(
        old.request_hash === digest,
        "Review key already used for different feedback",
        409,
      );
      return { id: old.id, status: old.status, duplicate: true };
    }
    const id = randomUUID();
    commands.push(
      s.command(
        "INSERT INTO reviews(id,business_id,booking_id,display_name,rating,feedback,consent,idempotency_key,request_hash,created_at) VALUES(?,?,?,?,?,?,1,?,?,?)",
        id,
        s.tenant,
        input.bookingId ?? null,
        name,
        input.rating,
        feedback,
        key,
        digest,
        Date.now(),
      ),
    );
    return { id, status: "pending" };
  });
}
export async function moderateReview(s, input, owner) {
  return s.atomic(async (b, commands) => {
    const row = await s.first(
      "SELECT * FROM reviews WHERE id=? AND business_id=?",
      input.id,
      s.tenant,
    );
    requireThat(row, "Review not found", 404);
    requireThat(row.version === input.version, "Review changed; refresh", 409);
    requireThat(
      ["approved", "rejected", "pending"].includes(input.status),
      "Invalid moderation status",
    );
    if (input.status === "rejected")
      requireThat(
        [
          "spam",
          "inappropriate_content",
          "personal_information",
          "unrelated_content",
          "duplicate",
        ].includes(input.reason),
        "Choose a content-policy reason; ratings are not a rejection reason",
      );
    const reason = input.status === "rejected" ? input.reason : null;
    commands.push(
      s.command(
        "UPDATE reviews SET status=?,moderation_reason=?,version=version+1,moderated_at=? WHERE id=? AND business_id=?",
        input.status,
        reason,
        Date.now(),
        row.id,
        s.tenant,
      ),
      s.command(
        "INSERT INTO review_moderation VALUES(?,?,?,?,?,?,?)",
        randomUUID(),
        row.id,
        owner.id,
        row.status,
        input.status,
        reason,
        Date.now(),
      ),
    );
    return { ok: true };
  });
}
