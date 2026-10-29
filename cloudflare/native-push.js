import {
  randomUUID,
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { requireThat, hash } from "../src/security.js";

const keyBytes = (key) =>
  createHash("sha256")
    .update("docdetailing-native-token:" + key)
    .digest();
export function encryptDeviceToken(value, key, aad) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", keyBytes(key), iv);
  cipher.setAAD(Buffer.from(aad));
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64");
}
export function decryptDeviceToken(value, key, aad) {
  const bytes = Buffer.from(value, "base64"),
    decipher = createDecipheriv(
      "aes-256-gcm",
      keyBytes(key),
      bytes.subarray(0, 12),
    );
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([
    decipher.update(bytes.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
export async function saveNativeDevice(s, body, user, session) {
  requireThat(
    Object.keys(body).every((k) =>
      ["deviceId", "deviceToken", "environment", "enabled"].includes(k),
    ),
    "Invalid native registration",
  );
  requireThat(
    typeof body.deviceId === "string" &&
      /^[a-zA-Z0-9_-]{16,100}$/.test(body.deviceId),
    "Invalid device identifier",
  );
  requireThat(
    typeof body.deviceToken === "string" &&
      /^(?:[a-fA-F0-9]{2}){16,256}$/.test(body.deviceToken),
    "Invalid device token",
  );
  requireThat(
    ["sandbox", "production"].includes(body.environment) &&
      body.enabled === true,
    "Notification permission must be enabled",
  );
  return s.atomic(async (b, commands) => {
    const old = await s.first(
      "SELECT * FROM native_devices WHERE business_id=? AND device_id=?",
      s.tenant,
      body.deviceId,
    );
    requireThat(
      !old || old.owner_id === user.id,
      "Device belongs to another owner",
      403,
    );
    const digest = hash(body.deviceToken.toLowerCase());
    const same = await s.first(
      "SELECT * FROM native_devices WHERE business_id=? AND token_hash=?",
      s.tenant,
      digest,
    );
    requireThat(
      !same || same.owner_id === user.id,
      "Device token belongs to another owner",
      403,
    );
    const id = old?.id ?? randomUUID(),
      now = Date.now();
    if (same && same.id !== id)
      commands.push(
        s.command(
          "DELETE FROM native_devices WHERE business_id=? AND id=? AND owner_id=?",
          s.tenant,
          same.id,
          user.id,
        ),
      );
    commands.push(
      s.command(
        "INSERT INTO native_devices VALUES(?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(business_id,device_id) DO UPDATE SET token_hash=excluded.token_hash,token_ciphertext=excluded.token_ciphertext,environment=excluded.environment,session_hash=excluded.session_hash,active=1,last_seen=excluded.last_seen",
        id,
        s.tenant,
        user.id,
        body.deviceId,
        digest,
        encryptDeviceToken(
          body.deviceToken.toLowerCase(),
          b.link_key,
          s.tenant + "/" + body.deviceId,
        ),
        body.environment,
        hash(session ?? ""),
        old?.registered_at ?? now,
        now,
      ),
    );
    s.audit(commands, user.id, "native.device.registered", id);
    return { id, registeredAt: old?.registered_at ?? now };
  });
}
export function apnsBlocked(env, ownerId) {
  if ((env.COMMUNICATIONS_MODE ?? "disabled") === "disabled")
    return "Outbound communications disabled";
  if (env.ALLOW_NATIVE_PUSH_SEND !== "true") return "Native push disabled";
  if (
    !env.APNS_KEY_ID ||
    !env.APNS_TEAM_ID ||
    !env.APNS_PRIVATE_KEY ||
    !env.APNS_TOPIC
  )
    return "APNs provider not configured";
  if (
    (env.COMMUNICATIONS_MODE ?? "disabled") === "test-only" &&
    !(env.TEST_NATIVE_OWNER_IDS ?? "")
      .split(",")
      .map((x) => x.trim())
      .includes(ownerId)
  )
    return "Native test recipient not authorized";
  return null;
}
let cached = null;
export async function apnsJWT(env, now = Date.now()) {
  const fingerprint = hash(
    env.APNS_TEAM_ID + ":" + env.APNS_KEY_ID + ":" + env.APNS_PRIVATE_KEY,
  );
  if (cached?.fingerprint === fingerprint && now - cached.created < 45 * 60000)
    return cached.value;
  requireThat(
    /^[A-Z0-9]{10}$/.test(env.APNS_TEAM_ID ?? "") &&
      /^[A-Z0-9]{10}$/.test(env.APNS_KEY_ID ?? ""),
    "Invalid APNs configuration",
    503,
  );
  const header = Buffer.from(
    JSON.stringify({ alg: "ES256", kid: env.APNS_KEY_ID }),
  ).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({ iss: env.APNS_TEAM_ID, iat: Math.floor(now / 1000) }),
  ).toString("base64url");
  const raw = Buffer.from(
    env.APNS_PRIVATE_KEY.replace(
      /-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,
      "",
    ),
    "base64",
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    raw,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    Buffer.from(header + "." + claims),
  );
  const value =
    header + "." + claims + "." + Buffer.from(sig).toString("base64url");
  cached = { fingerprint, created: now, value };
  return value;
}
export const APNS_FAILURES = [
  "device lookup",
  "configuration",
  "token preparation",
  "authentication",
  "unread count",
  "transport",
  "local test service lookup",
  "local test service request",
].map((x) => "APNs " + x + " failed");
export async function sendAPNs(s, env, delivery, payload, fetcher) {
  const trace = { stage: "device lookup" };
  try {
    return await sendAPNsCore(s, env, delivery, payload, fetcher, trace);
  } catch (error) {
    error.apnsCategory = "APNs " + trace.stage + " failed";
    throw error;
  }
}
async function sendAPNsCore(s, env, delivery, payload, fetcher, trace) {
  const device = await s.first(
    "SELECT d.* FROM native_devices d JOIN sessions x ON x.business_id=d.business_id AND x.owner_id=d.owner_id AND x.token_hash=d.session_hash WHERE d.business_id=? AND d.id=? AND d.active=1",
    s.tenant,
    delivery.target,
  );
  requireThat(device, "Native device inactive", 410);
  trace.stage = "configuration";
  const blocked = apnsBlocked(env, device.owner_id);
  requireThat(!blocked, blocked ?? "Native push disabled", 503);
  requireThat(
    device.environment === env.APNS_ENVIRONMENT,
    "APNs environment mismatch",
    503,
  );
  requireThat(
    env.APNS_TOPIC === "com.docincorporated.docdetailing",
    "APNs topic mismatch",
    503,
  );
  trace.stage = "token preparation";
  const business = await s.first(
    "SELECT link_key FROM businesses WHERE id=?",
    s.tenant,
  );
  let token, jwt;
  try {
    token = decryptDeviceToken(
      device.token_ciphertext,
      business.link_key,
      s.tenant + "/" + device.device_id,
    );
  } catch {
    throw Object.assign(Error("Native token decryption failed"), {
      apnsCategory: "Native token decryption failed",
    });
  }
  trace.stage = "authentication";
  try {
    jwt = await apnsJWT(env);
  } catch {
    throw Object.assign(Error("APNs credential import/signing failed"), {
      apnsCategory: "APNs credential import/signing failed",
    });
  }
  trace.stage = "unread count";
  const unread = await s.first(
    "SELECT count(*) n FROM notifications WHERE business_id=? AND read_at IS NULL",
    s.tenant,
  );
  trace.stage = "transport";
  if (env.CLOUDFLARE_ENV === "local") {
    trace.stage = "local test service lookup";
    requireThat(
      env.APNS_TEST_TRANSPORT &&
        typeof env.APNS_TEST_TRANSPORT.fetch === "function",
      "Local APNs requires an in-process test service",
      503,
    );
    trace.stage = "local test service request";
    fetcher = (url, init) =>
      env.APNS_TEST_TRANSPORT.fetch(
        new Request("https://apns-test.invalid" + new URL(url).pathname, init),
      );
  } else {
    fetcher ??= (...args) => fetch(...args);
  }
  const response = await fetcher(
    (device.environment === "sandbox"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com") +
      "/3/device/" +
      token,
    {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      headers: {
        authorization: "bearer " + jwt,
        "apns-topic": env.APNS_TOPIC,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-id": delivery.id,
        "apns-collapse-id": payload.eventId,
        "apns-expiration": String(Math.floor(Date.now() / 1000) + 3600),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        aps: {
          alert: {
            title: payload.title,
            body: "Open DocDetailing to review this appointment.",
          },
          sound: "default",
          badge: unread.n,
          "thread-id": payload.bookingId,
        },
        eventId: payload.eventId,
        bookingId: payload.bookingId,
        businessId: s.tenant,
      }),
    },
  );
  if (!response.ok) {
    let reason = "";
    try {
      reason = (await response.json()).reason ?? "";
    } catch {}
    const invalid =
      response.status === 410 ||
      ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"].includes(
        reason,
      );
    if (reason === "ExpiredProviderToken") cached = null;
    throw Object.assign(Error("APNs request failed"), {
      status: invalid ? 410 : response.status,
    });
  }
  return response;
}
export async function nativeInbox(s, params) {
  const unread = params.get("unread") === "true",
    before = params.get("before");
  let clause = unread ? " AND read_at IS NULL" : "",
    args = [s.tenant];
  if (before) {
    const [time, id, ...extra] = before.split(":");
    requireThat(
      !extra.length &&
        /^\d+$/.test(time) &&
        Number.isSafeInteger(Number(time)) &&
        id?.length <= 100 &&
        /^[a-zA-Z0-9_-]+$/.test(id),
      "Invalid inbox cursor",
    );
    clause += " AND (created_at<? OR (created_at=? AND id<?))";
    args.push(Number(time), Number(time), id);
  }
  const records = await s.all(
    "SELECT id,booking_id,event,read_at,created_at FROM notifications WHERE business_id=?" +
      clause +
      " ORDER BY created_at DESC,id DESC LIMIT 50",
    ...args,
  );
  return {
    notifications: records,
    unread: (
      await s.first(
        "SELECT count(*) n FROM notifications WHERE business_id=? AND read_at IS NULL",
        s.tenant,
      )
    ).n,
    businessId: s.tenant,
    nextCursor:
      records.length === 50
        ? records.at(-1).created_at + ":" + records.at(-1).id
        : null,
  };
}
