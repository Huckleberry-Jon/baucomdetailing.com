import { readFileSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { token, verifyPassword, rateLimit, requireThat } from "./security.js";
const signature = (value, key) =>
  createHmac("sha256", key).update(value).digest("base64url");
export function gateSession(key) {
  const value = String(Date.now() + 48 * 3600000) + "." + token();
  return value + "." + signature(value, key);
}
export function validGateSession(cookie, key) {
  if (typeof cookie !== "string" || cookie.length > 200) return false;
  const parts = cookie.split(".");
  if (
    parts.length !== 3 ||
    !/^\d+$/.test(parts[0]) ||
    Number(parts[0]) <= Date.now() ||
    Number(parts[0]) > Date.now() + 49 * 3600000
  )
    return false;
  const expected = signature(parts[0] + "." + parts[1], key);
  return (
    expected.length === parts[2].length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))
  );
}
export function accessGate(req, res, path, db, config, body, respond) {
  if (!config.accessGate) return false;
  const cookies = Object.fromEntries(
    (req.headers.cookie ?? "").split(";").map((s) => s.trim().split("=")),
  );
  if (path === "/dev-access" && req.method === "POST") {
    rateLimit(db, "device-gate:" + req.socket.remoteAddress, 10, 900000);
    requireThat(
      typeof body.code === "string" &&
        body.code.length <= 200 &&
        verifyPassword(body.code, config.accessGate.passwordHash),
      "Invalid development access code",
      401,
    );
    res.setHeader(
      "Set-Cookie",
      `dev_access=${gateSession(config.accessGate.signingKey)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=172800`,
    );
    respond(res, 200, { ok: true });
    return true;
  }
  if (path === "/dev-access" && req.method === "GET") return false;
  if (path === "/dev-access.js" && req.method === "GET") return false;
  if (path === "/api/webhooks/email" && req.method === "POST") return false;
  if (validGateSession(cookies.dev_access, config.accessGate.signingKey))
    return false;
  if (req.method === "GET" && !path.startsWith("/api/")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      readFileSync(new URL("../public/dev-access.html", import.meta.url)),
    );
  } else respond(res, 401, { error: "Development tester access required" });
  return true;
}
