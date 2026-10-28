import test from "node:test";
import assert from "node:assert/strict";
import { fixture, requestInput } from "./helpers.js";
import {
  submitReview,
  publicReviews,
  moderateReview,
  googleReviewUrl,
  reviewLinks,
} from "../src/reviews.js";
import { BUSINESS } from "../src/catalog.js";
test("reviews remain private until content moderation and legitimate one-star feedback can publish", () => {
  const { db, s } = fixture();
  db.prepare("INSERT INTO owners VALUES(?,?,?,?)").run(
    "owner",
    BUSINESS,
    "test@example.invalid",
    "test",
  );
  const input = {
      displayName: "Synthetic reviewer",
      rating: 1,
      feedback: "The result did not meet my expectations.",
      consent: true,
      website: "",
    },
    r = submitReview(s, input, "review");
  assert.equal(publicReviews(db).length, 0);
  assert.equal(submitReview(s, input, "review").id, r.id);
  assert.throws(
    () => submitReview(s, { ...input, rating: 2 }, "review"),
    /different feedback/,
  );
  assert.throws(
    () =>
      moderateReview(
        db,
        { id: r.id, version: 1, status: "rejected", reason: "low_rating" },
        { id: "owner" },
      ),
    /content-policy/,
  );
  moderateReview(
    db,
    { id: r.id, version: 1, status: "approved" },
    { id: "owner" },
  );
  assert.equal(publicReviews(db)[0].rating, 1);
  assert.equal(publicReviews(db)[0].booking_id, undefined);
  assert.equal(
    db.prepare("SELECT count(*) n FROM review_moderation").get().n,
    1,
  );
  assert.throws(
    () =>
      moderateReview(
        db,
        { id: r.id, version: 1, status: "pending" },
        { id: "owner" },
      ),
    /changed/,
  );
  db.close();
});
test("review consent, booking verification and Google URL rules are enforced", () => {
  const { db, s } = fixture(),
    input = {
      displayName: "Synthetic",
      rating: 5,
      feedback: "Excellent detailing experience.",
      consent: true,
      website: "",
    };
  assert.throws(
    () => submitReview(s, { ...input, consent: false }, "no-consent"),
    /Consent/,
  );
  assert.throws(
    () => submitReview(s, { ...input, website: "spam" }, "spam"),
    /rejected/,
  );
  const b = s.create(requestInput(), "review-booking");
  assert.throws(
    () =>
      submitReview(s, { ...input, bookingId: b.id }, "verify", b.accessToken),
    /completed/,
  );
  assert.throws(
    () => googleReviewUrl("https://google.com.evil.test/review"),
    /official/,
  );
  assert.throws(
    () => googleReviewUrl("https://user@google.com/review"),
    /official/,
  );
  assert.equal(
    googleReviewUrl("https://g.page/r/synthetic/review"),
    "https://g.page/r/synthetic/review",
  );
  assert.equal(
    reviewLinks(
      { ...s.settings(), googleReviewUrl: null },
      "https://example.invalid",
    ).website,
    "https://example.invalid/#reviews",
  );
  db.close();
});
