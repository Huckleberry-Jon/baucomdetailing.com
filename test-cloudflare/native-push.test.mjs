import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import {
  encryptDeviceToken,
  decryptDeviceToken,
  apnsJWT,
  apnsBlocked,
} from "../cloudflare/native-push.js";
import { runtime, seed, login, call, input, origin } from "./helpers.mjs";

const syntheticKeys = () =>
  generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
test("APNs uses encrypted device tokens and a valid ES256 provider JWT, with fail-closed delivery policy", async () => {
  const token = "ab".repeat(32),
    cipher = encryptDeviceToken(
      token,
      "synthetic-business-key",
      "tenant/device",
    );
  assert(!cipher.includes(token));
  assert.equal(
    decryptDeviceToken(cipher, "synthetic-business-key", "tenant/device"),
    token,
  );
  assert.throws(() => decryptDeviceToken(cipher, "other-key", "tenant/device"));
  assert.throws(() =>
    decryptDeviceToken(cipher, "synthetic-business-key", "other/device"),
  );
  const keys = syntheticKeys(),
    env = {
      APNS_TEAM_ID: "ABCDEFGHIJ",
      APNS_KEY_ID: "0123456789",
      APNS_PRIVATE_KEY: keys.privateKey,
    };
  const jwt = await apnsJWT(env),
    [header, claims, sig] = jwt.split(".");
  assert.equal(JSON.parse(Buffer.from(header, "base64url")).alg, "ES256");
  assert.equal(
    JSON.parse(Buffer.from(claims, "base64url")).iss,
    env.APNS_TEAM_ID,
  );
  assert(
    verify(
      "sha256",
      Buffer.from(header + "." + claims),
      { key: keys.publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(sig, "base64url"),
    ),
  );
  assert.equal(
    apnsBlocked(
      {
        ...env,
        ALLOW_NATIVE_PUSH_SEND: "true",
        APNS_TOPIC: "com.docincorporated.docdetailing",
      },
      "owner",
    ),
    "Outbound communications disabled",
  );
});
test("actual D1 native registration is tenant/owner scoped, renewed without replay, and revoked by logout", async () => {
  const { mf, db, fixture } = await runtime();
  try {
    const { ownerId } = await seed(db);
    await seed(db, "other", "localhost:4336");
    const cookie = await login(mf);
    const body = {
      deviceId: "synthetic-device-0001",
      deviceToken: "ab".repeat(32),
      environment: "production",
      enabled: true,
    };
    assert.equal(
      (await call(mf, "/api/owner/native-device", { method: "POST", body }))
        .status,
      401,
    );
    assert.equal(
      (
        await call(mf, "/api/owner/native-device", {
          method: "POST",
          cookie,
          body: { ...body, ownerId: "forged" },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call(mf, "/api/owner/native-device", {
          method: "POST",
          cookie,
          body,
        })
      ).status,
      200,
    );
    const original = await db
      .prepare("SELECT * FROM native_devices WHERE owner_id=?")
      .bind(ownerId)
      .first();
    assert(!original.token_ciphertext.includes(body.deviceToken));
    await call(mf, "/api/owner/native-device", {
      method: "POST",
      cookie,
      body: { ...body, deviceToken: "cd".repeat(32) },
    });
    const renewed = await db
      .prepare("SELECT * FROM native_devices WHERE owner_id=?")
      .bind(ownerId)
      .first();
    assert.equal(renewed.id, original.id);
    assert.equal(renewed.registered_at, original.registered_at);
    assert.notEqual(renewed.token_hash, original.token_hash);
    assert.equal(
      (
        await call(mf, "/api/owner/native-device", {
          method: "POST",
          cookie,
          host: "http://localhost:4336",
          body,
        })
      ).status,
      401,
    );
    const rotated = await call(mf, "/api/owner/session/refresh", {
      method: "POST",
      cookie,
      body: {},
    });
    const next = rotated.headers.get("set-cookie").split(";")[0];
    assert.notEqual(
      (
        await db
          .prepare("SELECT session_hash FROM native_devices WHERE id=?")
          .bind(original.id)
          .first()
      ).session_hash,
      original.session_hash,
    );
    await call(mf, "/api/bookings", {
      method: "POST",
      body: input(),
      key: "native-registered-booking",
    });
    await fixture("drain", { tenant: "baucom", origin, env: {} });
    const deliveries = await db
      .prepare("SELECT * FROM deliveries WHERE channel='apns'")
      .all();
    assert.equal(deliveries.results.length, 1);
    assert.equal(deliveries.results[0].status, "blocked");
    await fixture("drain", { tenant: "baucom", origin, env: {} });
    assert.equal(
      (
        await db
          .prepare("SELECT count(*) n FROM deliveries WHERE channel='apns'")
          .first()
      ).n,
      1,
    );
    await call(mf, "/api/owner/logout", {
      method: "POST",
      cookie: next,
      body: {},
    });
    assert.equal(
      (await db.prepare("SELECT count(*) n FROM native_devices").first()).n,
      0,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT status FROM deliveries WHERE channel='apns'")
          .first()
      ).status,
      "revoked",
    );
  } finally {
    await mf.dispose();
  }
});
test("actual workerd APNs failures retain bookings, expire invalid tokens and never duplicate provider-accepted deliveries", async () => {
  let requests = [];
  const keys = syntheticKeys();
  let status = 503;
  const { mf, db, fixture } = await runtime();
  try {
    const { ownerId } = await seed(db);
    const cookie = await login(mf);
    const body = {
      deviceId: "synthetic-device-0001",
      deviceToken: "ab".repeat(32),
      environment: "production",
      enabled: true,
    };
    await call(mf, "/api/owner/native-device", {
      method: "POST",
      cookie,
      body,
    });
    await call(mf, "/api/bookings", {
      method: "POST",
      body: input(),
      key: "native-provider-booking",
    });
    const env = {
      COMMUNICATIONS_MODE: "test-only",
      ALLOW_NATIVE_PUSH_SEND: "true",
      TEST_NATIVE_OWNER_IDS: ownerId,
      APNS_TEAM_ID: "ABCDEFGHIJ",
      APNS_KEY_ID: "0123456789",
      APNS_PRIVATE_KEY: keys.privateKey,
      APNS_TOPIC: "com.docincorporated.docdetailing",
      APNS_ENVIRONMENT: "production",
    };
    const run = async () => {
      await db
        .prepare("UPDATE apns_test_status SET status=? WHERE id=1")
        .bind(status)
        .run();
      await db
        .prepare("UPDATE deliveries SET next_attempt=0 WHERE channel='apns'")
        .run();
      await fixture("drain", { tenant: "baucom", origin, env });
      requests = (
        await db
          .prepare("SELECT * FROM apns_test_requests ORDER BY rowid")
          .all()
      ).results.map((x) => ({
        body: JSON.parse(x.body),
        collapse: x.collapse_id,
      }));
    };
    await run();
    assert.equal(
      (
        await db
          .prepare("SELECT status FROM deliveries WHERE channel='apns'")
          .first()
      ).status,
      "retry",
    );
    assert.equal(
      (await db.prepare("SELECT count(*) n FROM bookings").first()).n,
      1,
    );
    assert.equal(
      requests.length,
      1,
      (
        await db
          .prepare("SELECT last_error FROM deliveries WHERE channel='apns'")
          .first()
      ).last_error,
    );
    assert.equal(requests[0].body.businessId, "baucom");
    assert(!JSON.stringify(requests[0].body).includes("Synthetic address"));
    status = 400;
    await run();
    assert.equal(
      (
        await db
          .prepare("SELECT status FROM deliveries WHERE channel='apns'")
          .first()
      ).status,
      "expired",
    );
    assert.equal(
      (await db.prepare("SELECT active FROM native_devices").first()).active,
      0,
    );
    await call(mf, "/api/owner/native-device", {
      method: "POST",
      cookie,
      body: { ...body, deviceToken: "cd".repeat(32) },
    });
    await call(mf, "/api/bookings", {
      method: "POST",
      body: input(),
      key: "native-next-booking",
    });
    status = 200;
    await run();
    const accepted = await db
      .prepare(
        "SELECT * FROM deliveries WHERE channel='apns' AND status='accepted_by_provider'",
      )
      .all();
    assert.equal(accepted.results.length, 1);
    const before = requests.length;
    await run();
    assert.equal(requests.length, before);
  } finally {
    await mf.dispose();
  }
});

test("actual D1 inbox paginates without overlap, read state is scoped and reminders deduplicate", async () => {
  const f = await runtime();
  try {
    await seed(f.db);
    const cookie = await login(f.mf);
    const booking = await call(f.mf, "/api/bookings", {
      method: "POST",
      key: "inbox-fixture",
      body: input(),
    });
    assert.equal(booking.status, 201);
    for (let i = 0; i < 55; i++)
      await f.db
        .prepare(
          "INSERT INTO notifications(id,business_id,booking_id,event,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(
          "inbox-" + String(i).padStart(3, "0"),
          "baucom",
          booking.data.id,
          "booking.requested",
          1234,
        )
        .run();
    const page = await call(f.mf, "/api/owner/inbox", { cookie });
    assert.equal(page.data.notifications.length, 50);
    const next = await call(
      f.mf,
      "/api/owner/inbox?before=" + encodeURIComponent(page.data.nextCursor),
      { cookie },
    );
    assert.equal(
      new Set(
        [...page.data.notifications, ...next.data.notifications].map(
          (x) => x.id,
        ),
      ).size,
      56,
    );
    await call(f.mf, "/api/owner/read", {
      method: "POST",
      cookie,
      body: { id: page.data.notifications[0].id },
    });
    const unread = await call(f.mf, "/api/owner/inbox?unread=true", { cookie });
    assert.equal(unread.data.unread, 55);
    assert(unread.data.notifications.every((x) => x.read_at === null));
    assert.equal((await call(f.mf, "/api/owner/inbox")).status, 401);
    await f.db
      .prepare("UPDATE bookings SET status='confirmed',start_ms=? WHERE id=?")
      .bind(Date.now() + 1800000, booking.data.id)
      .run();
    await f.fixture("drain", { tenant: "baucom", origin, env: {} });
    await f.fixture("drain", { tenant: "baucom", origin, env: {} });
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT count(*) n FROM notifications WHERE event LIKE 'appointment.reminder:%'",
          )
          .first()
      ).n,
      1,
    );
  } finally {
    await f.mf.dispose();
  }
});
