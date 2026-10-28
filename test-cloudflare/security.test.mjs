import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createECDH, randomBytes } from "node:crypto";
import webpush from "web-push";
import { Webhook } from "svix";
import { passwordHash } from "../src/security.js";
import {
  runtime,
  seed,
  call,
  login,
  input,
  future,
  origin,
} from "./helpers.mjs";

test("private Cloudflare preview gates assets/APIs and production cookies remain Secure", async () => {
  const secret = "Synthetic-preview-code",
    r = await runtime({
      CLOUDFLARE_ENV: "production",
      DATA_NAMESPACE: "production",
      SITE_OPEN: "false",
      PREVIEW_PASSWORD_HASH: passwordHash(secret),
      PREVIEW_SIGNING_KEY: "synthetic-signing-key-at-least-43-characters-12345",
    });
  try {
    await seed(r.db, "baucom", "baucomdetailing.com");
    await r.db
      .prepare(
        "UPDATE tenant_domains SET canonical_origin='https://baucomdetailing.com'",
      )
      .run();
    const host = "https://baucomdetailing.com";
    assert.equal((await call(r.mf, "/api/catalog", { host })).status, 401);
    const gated = await call(r.mf, "/", { host });
    assert.equal(gated.status, 200);
    assert.match(gated.data, /Private development test/);
    assert.equal(gated.headers.get("X-Robots-Tag"), "noindex, nofollow");
    assert.equal(
      (
        await call(r.mf, "/dev-access", {
          method: "POST",
          host,
          body: { code: "wrong" },
        })
      ).status,
      401,
    );
    const gate = await call(r.mf, "/dev-access", {
      method: "POST",
      host,
      body: { code: secret },
    });
    assert.equal(gate.status, 200);
    assert.match(gate.headers.get("set-cookie"), /Secure/);
    const cookie = gate.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (await call(r.mf, "/api/catalog", { host, cookie })).status,
      200,
    );
    assert.equal(
      (await call(r.mf, "/api/owner/dashboard", { host, cookie })).status,
      401,
    );
    const auth = await call(r.mf, "/api/login", {
      method: "POST",
      host,
      cookie,
      body: {
        email: "owner@example.invalid",
        password: "Synthetic-Cloudflare-owner-only-2026!",
      },
    });
    assert.equal(auth.status, 200);
    assert.match(auth.headers.get("set-cookie"), /HttpOnly.*Secure/);
    assert.equal(
      (await call(r.mf, "/api/catalog", { host, cookie: cookie + "tampered" }))
        .status,
      401,
    );
  } finally {
    await r.mf.dispose();
  }
});

test("D1 rollback protects booking/customer/history/outbox when a later write fails", async () => {
  const { mf, db } = await runtime();
  try {
    await seed(db);
    await db.exec(
      "CREATE TRIGGER synthetic_abort BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'Synthetic failure'); END;",
    );
    const r = await call(mf, "/api/bookings", {
      method: "POST",
      body: input(),
      key: randomUUID(),
    });
    assert.equal(r.status, 500);
    for (const table of [
      "customers",
      "vehicles",
      "bookings",
      "history",
      "notifications",
    ])
      assert.equal(
        (await db.prepare("SELECT count(*) n FROM " + table).first()).n,
        0,
      );
  } finally {
    await mf.dispose();
  }
});

test("D1 settings/blocked-time races revalidate confirmations and Central DST availability", async () => {
  const { mf, db } = await runtime();
  try {
    const { cfg } = await seed(db),
      cookie = await login(mf),
      b = await call(mf, "/api/bookings", {
        method: "POST",
        body: input(),
        key: randomUUID(),
      });
    const r = await Promise.all([
      call(mf, "/api/owner/transition", {
        method: "POST",
        cookie,
        body: {
          id: b.data.id,
          version: 1,
          action: "confirm",
          durationMinutes: 90,
        },
      }),
      call(mf, "/api/owner/settings", {
        method: "PUT",
        cookie,
        body: { ...cfg, closedDates: [future().slice(0, 10)] },
      }),
    ]);
    assert.deepEqual(r.map((x) => x.status).sort(), [200, 409]);
    const dst = await call(
      mf,
      "/api/availability?day=2027-03-14&packageId=dustoff",
    );
    assert.equal(dst.status, 200);
    assert.ok(dst.data.slots.includes("2027-03-14T13:00:00.000Z"));
  } finally {
    await mf.dispose();
  }
});

test("actual Worker renewal fences owner/tenant endpoints and encrypted push failures stay durable", async () => {
  const keys = webpush.generateVAPIDKeys(),
    r = await runtime({
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: "mailto:test@example.invalid",
    });
  try {
    await seed(r.db);
    const cookie = await login(r.mf),
      ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const sub = {
      endpoint: "https://fcm.googleapis.com/synthetic-only-a",
      keys: {
        auth: randomBytes(16).toString("base64url"),
        p256dh: ecdh.getPublicKey().toString("base64url"),
      },
    };
    assert.equal(
      (
        await call(r.mf, "/api/owner/subscription", {
          method: "POST",
          cookie,
          body: { ...sub, endpoint: "https://localhost/private" },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call(r.mf, "/api/owner/subscription", {
          method: "POST",
          cookie,
          body: sub,
        })
      ).status,
      200,
    );
    await call(r.mf, "/api/bookings", {
      method: "POST",
      body: input(),
      key: randomUUID(),
    });
    await r.db
      .prepare("UPDATE deliveries SET next_attempt=0 WHERE channel=?")
      .bind("push")
      .run();
    await r.fixture("drain", {
      tenant: "baucom",
      origin,
      env: { COMMUNICATIONS_MODE: "test-only", ALLOW_PUSH_SEND: "true" },
    });
    const push = await r.db
      .prepare("SELECT * FROM deliveries WHERE channel='push'")
      .first();
    assert.ok(push);
    assert.equal(push.status, "retry");
    assert.equal(push.attempts, 1);
    assert.equal(
      (
        await r.db
          .prepare(
            "SELECT count(*) n FROM delivery_attempts WHERE delivery_id=?",
          )
          .bind(push.id)
          .first()
      ).n,
      1,
    );
    const replacement = {
      ...sub,
      endpoint: "https://fcm.googleapis.com/synthetic-only-b",
    };
    assert.equal(
      (
        await call(r.mf, "/api/owner/subscription", {
          method: "POST",
          cookie,
          body: { subscription: replacement, replaces: sub.endpoint },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await r.db
          .prepare("SELECT active FROM subscriptions WHERE endpoint=?")
          .bind(sub.endpoint)
          .first()
      ).active,
      0,
    );
    await r.fixture("drain", { tenant: "baucom", origin, env: {} });
    assert.equal(
      (
        await r.db
          .prepare("SELECT count(*) n FROM deliveries WHERE channel='push'")
          .first()
      ).n,
      1,
    );
  } finally {
    await r.mf.dispose();
  }
});

test("actual Worker validates signed email receipts, tenant tags and early delivery reconciliation", async () => {
  const secret = "whsec_" + randomBytes(32).toString("base64"),
    r = await runtime({ RESEND_WEBHOOK_SECRET: secret });
  try {
    await seed(r.db);
    await seed(r.db, "other", "127.0.0.1:4334");
    const cookie = await login(r.mf);
    await call(r.mf, "/api/bookings", {
      method: "POST",
      body: input(),
      key: randomUUID(),
    });
    await r.fixture("drain", { tenant: "baucom", origin, env: {} });
    const event = {
        type: "email.delivered",
        created_at: new Date().toISOString(),
        data: {
          email_id: "synthetic-early-provider",
          tags: { business_id: "baucom" },
        },
      },
      raw = JSON.stringify(event),
      id = "msg_" + randomUUID(),
      now = new Date(),
      signature = new Webhook(secret).sign(id, now, raw);
    const headers = {
      "svix-id": id,
      "svix-timestamp": String(Math.floor(now.getTime() / 1000)),
      "svix-signature": signature,
    };
    assert.equal(
      (
        await call(r.mf, "/api/webhooks/email", {
          method: "POST",
          body: event,
          headers: { ...headers, "svix-signature": "invalid" },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call(r.mf, "/api/webhooks/email", {
          method: "POST",
          body: event,
          headers,
          host: "http://127.0.0.1:4334",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call(r.mf, "/api/webhooks/email", {
          method: "POST",
          body: event,
          headers,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call(r.mf, "/api/webhooks/email", {
          method: "POST",
          body: event,
          headers,
        })
      ).status,
      200,
    );
    assert.equal(
      (await r.db.prepare("SELECT count(*) n FROM webhook_receipts").first()).n,
      1,
    );
    const d = await r.db.prepare("SELECT id FROM deliveries LIMIT 1").first();
    await r.db
      .prepare("UPDATE deliveries SET provider_id=? WHERE id=?")
      .bind(event.data.email_id, d.id)
      .run();
    await r.fixture("reconcile", {
      tenant: "baucom",
      provider: event.data.email_id,
    });
    assert.equal(
      (
        await r.db
          .prepare("SELECT status FROM deliveries WHERE id=?")
          .bind(d.id)
          .first()
      ).status,
      "delivered_to_mail_server",
    );
    assert.equal(
      (await call(r.mf, "/api/owner/dashboard", { cookie })).data.bookings
        .length,
      1,
    );
  } finally {
    await r.mf.dispose();
  }
});
