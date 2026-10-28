import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { fixture, requestInput } from "./helpers.js";
import { runtimeConfig, deliveryBlockReason } from "../src/runtime-config.js";
import { passwordHash } from "../src/security.js";
import { gateSession, validGateSession } from "../src/dev-access.js";
import { NotificationWorker } from "../src/notifications.js";
import { createApplication } from "../src/server.js";
const secret = {
  accessPasswordHash: passwordHash("Synthetic gate passphrase"),
  gateSigningKey: randomBytes(32).toString("base64url"),
  vapidPublicKey: "dev-public",
  vapidPrivateKey: "dev-private",
};
test("device profile never inherits regular secrets/database and outbound communication is off by default", () => {
  const env = {
      APP_ENV: "device-test",
      DEV_ORIGIN: "https://assigned-example.ngrok.app",
      DATABASE_PATH: "production.sqlite",
      PORT: "4317",
      RESEND_API_KEY: "do-not-inherit",
      VAPID_PRIVATE_KEY: "do-not-inherit",
    },
    config = runtimeConfig(env, () => secret);
  assert.equal(config.emailApiKey, undefined);
  assert.equal(config.vapidPrivateKey, "dev-private");
  assert.match(config.databasePath, /device-test/);
  assert.equal(config.port, 4324);
  assert.equal(config.deliveryPolicy.pushEnabled, false);
  assert.equal(config.deliveryPolicy.emailEnabled, false);
  assert.throws(
    () =>
      runtimeConfig(
        { ...env, DEV_ORIGIN: "https://baucomdetailing.com" },
        () => secret,
      ),
    /separate/,
  );
  assert.throws(
    () =>
      runtimeConfig(
        { ...env, DEV_ORIGIN: "http://example.test" },
        () => secret,
      ),
    /separate/,
  );
  assert.throws(
    () =>
      runtimeConfig(
        { ...env, DEV_SECRETS_FILE: "production-secrets.json" },
        () => secret,
      ),
    /isolated/,
  );
  assert.equal(
    deliveryBlockReason(
      {
        deliveryPolicy: {
          emailEnabled: true,
          emailRecipients: ["tester@example.invalid"],
        },
      },
      false,
      "customer@example.invalid",
    ),
    "Email recipient is not on the test allowlist",
  );
});
test("disabled push/email, unapproved recipients and transport failures never remove the stored booking", async () => {
  const { db, s } = fixture(),
    b = s.create(requestInput(), "policy");
  db.prepare("INSERT INTO subscriptions VALUES(?,?,?,?,1)").run(
    "test-device",
    "baucom",
    "https://fcm.googleapis.com/test",
    "{}",
  );
  s.transition(b.id, "confirm", { version: 1, durationMinutes: 60 });
  let calls = 0;
  const config = {
      vapidPublicKey: "test",
      vapidPrivateKey: "test",
      vapidSubject: "test",
      emailApiKey: "test",
      emailFrom: "sender@example.invalid",
      ownerEmail: "owner@example.invalid",
      deliveryPolicy: {
        pushEnabled: false,
        emailEnabled: false,
        emailRecipients: [],
      },
    },
    worker = new NotificationWorker(
      db,
      config,
      async () => {
        calls++;
      },
      async () => {
        calls++;
      },
    );
  await worker.tick();
  assert.equal(calls, 0);
  assert.equal(s.get(b.id).status, "confirmed");
  assert.ok(
    db.prepare("SELECT count(*) n FROM deliveries WHERE status='blocked'").get()
      .n >= 2,
  );
  config.deliveryPolicy = {
    pushEnabled: true,
    emailEnabled: true,
    emailRecipients: ["approved@example.invalid"],
  };
  db.prepare("UPDATE deliveries SET next_attempt=0").run();
  const failed = new NotificationWorker(
    db,
    config,
    async () => {
      throw Error("provider down");
    },
    async () => {
      throw Error("must not call unapproved recipients");
    },
  );
  await failed.tick();
  assert.equal(s.get(b.id).status, "confirmed");
  assert.equal(
    db.prepare("SELECT count(*) n FROM history WHERE booking_id=?").get(b.id).n,
    2,
  );
  assert.ok(
    db
      .prepare(
        "SELECT count(*) n FROM deliveries WHERE last_error LIKE '%allowlist%'",
      )
      .get().n > 0,
  );
  db.close();
});
test("gate sessions are signed, expiring and separate from owner authentication", () => {
  const token = gateSession(secret.gateSigningKey);
  assert.equal(validGateSession(token, secret.gateSigningKey), true);
  assert.equal(validGateSession(token + "bad", secret.gateSigningKey), false);
  assert.equal(validGateSession("1.nonce.bad", secret.gateSigningKey), false);
  assert.equal(validGateSession(token, "another-key"), false);
});
test("HTTP gate blocks all app APIs and serves login at the same private deep-link path", async (t) => {
  const { db } = fixture(),
    origin = "http://127.0.0.1:4325",
    app = createApplication(db, {
      origin,
      environment: "device-test",
      accessGate: {
        passwordHash: secret.accessPasswordHash,
        signingKey: secret.gateSigningKey,
      },
      emailWebhookSecret: "whsec_" + randomBytes(32).toString("base64"),
      deliveryPolicy: {
        pushEnabled: false,
        emailEnabled: false,
        emailRecipients: [],
      },
    });
  await new Promise((resolve) => app.server.listen(4325, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    db.close();
  });
  const headers = { Origin: origin, "Content-Type": "application/json" },
    call = (path, options = {}) =>
      fetch(origin + path, {
        ...options,
        headers: { ...headers, ...options.headers },
      });
  assert.equal((await call("/api/catalog")).status, 401);
  assert.equal(
    (
      await call("/api/bookings", {
        method: "POST",
        body: JSON.stringify(requestInput()),
      })
    ).status,
    401,
  );
  const deep = await call("/booking?id=synthetic");
  assert.equal(deep.status, 200);
  assert.match(await deep.text(), /Private development test/);
  const login = await call("/dev-access", {
    method: "POST",
    body: JSON.stringify({ code: "Synthetic gate passphrase" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /Secure/);
  assert.match(cookie, /HttpOnly/);
  assert.equal(
    (await call("/api/catalog", { headers: { Cookie: cookie.split(";")[0] } }))
      .status,
    200,
  );
  assert.equal(
    (
      await call("/api/owner/dashboard", {
        headers: { Cookie: cookie.split(";")[0] },
      })
    ).status,
    401,
  );
  assert.equal(
    (await call("/api/webhooks/email", { method: "POST", body: "{}" })).status,
    401,
  );
  assert.equal(db.prepare("SELECT count(*) n FROM bookings").get().n, 0);
});
