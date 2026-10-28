import { createHmac, timingSafeEqual } from "node:crypto";
export function customerToken(db, booking) {
  const key = db
    .prepare("SELECT value FROM private_keys WHERE name='customer-links'")
    .get().value;
  return (
    "v1." +
    createHmac("sha256", key)
      .update(`${booking.business_id}:${booking.id}:${booking.access_expires}`)
      .digest("base64url")
  );
}
export function validCustomerToken(db, booking, secret) {
  const expected = customerToken(db, booking);
  return (
    typeof secret === "string" &&
    secret.length === expected.length &&
    timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
  );
}
export function customerLink(db, booking, origin) {
  return `${origin}/booking#${booking.id}:${customerToken(db, booking)}`;
}
