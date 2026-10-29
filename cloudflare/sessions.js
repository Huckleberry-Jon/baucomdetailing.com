import { hash, token, requireThat } from "../src/security.js";
const lifetime = 12 * 3600000;
export function sessionCookie(secret, origin, age = 43200) {
  return (
    "session=" +
    secret +
    "; HttpOnly; SameSite=Strict; Path=/; Max-Age=" +
    age +
    (origin.startsWith("https:") ? "; Secure" : "")
  );
}
export async function sessionInfo(s, cookie, user) {
  const row = await s.first(
    "SELECT expires FROM sessions WHERE business_id=? AND owner_id=? AND token_hash=? AND expires>?",
    s.tenant,
    user.id,
    hash(cookie ?? ""),
    Date.now(),
  );
  requireThat(row, "Owner login required", 401);
  return { ownerId: user.id, businessId: s.tenant, expiresAt: row.expires };
}
export async function rotateSession(s, cookie, user) {
  const secret = token(),
    old = hash(cookie ?? ""),
    expires = Date.now() + lifetime;
  // D1 executes this batch transactionally. A revoked/rotated token cannot mint a replacement.
  const results = await s.db.batch([
    s.statement(
      "INSERT INTO sessions(token_hash,business_id,owner_id,expires) SELECT ?,business_id,owner_id,? FROM sessions WHERE business_id=? AND owner_id=? AND token_hash=? AND expires>?",
      hash(secret),
      expires,
      s.tenant,
      user.id,
      old,
      Date.now(),
    ),
    s.statement(
      "DELETE FROM sessions WHERE business_id=? AND owner_id=? AND token_hash=?",
      s.tenant,
      user.id,
      old,
    ),
  ]);
  requireThat(
    results[0].meta.changes === 1,
    "Session expired or revoked; sign in again",
    401,
  );
  return { secret, expiresAt: expires };
}
