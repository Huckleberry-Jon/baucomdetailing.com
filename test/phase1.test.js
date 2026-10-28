import test from "node:test";
import assert from "node:assert/strict";
import { Webhook } from "svix";
import { randomBytes } from "node:crypto";
import { fixture, future, requestInput } from "./helpers.js";
import { BUSINESS } from "../src/catalog.js";
import {
  NotificationWorker,
  saveSubscription,
  recordEmailReceipt,
} from "../src/notifications.js";
import { customerToken } from "../src/customer-links.js";
import { calendar, addBlock, availability, dateKey } from "../src/calendar.js";
const config = {
  origin: "https://development.example.invalid",
  emailApiKey: "test",
  emailFrom: "test@example.invalid",
  ownerEmail: "owner@example.invalid",
  vapidPublicKey: "test",
  vapidPrivateKey: "test",
  vapidSubject: "mailto:test@example.invalid",
};
test("notification fallback, exact deep link and email customer link survive provider failures", async () => {
  const { db, s } = fixture(),
    b = s.create(requestInput(), "notification");
  db.prepare("INSERT INTO subscriptions VALUES(?,?,?,?,1)").run(
    "device",
    BUSINESS,
    "https://fcm.googleapis.com/test",
    "{}",
  );
  const messages = [];
  const w = new NotificationWorker(
    db,
    config,
    async () => {
      throw Object.assign(Error("gone"), { statusCode: 410 });
    },
    async (m) => {
      messages.push(m);
      return { id: "mail-" + messages.length };
    },
  );
  await w.tick();
  assert.equal(db.prepare("SELECT active FROM subscriptions").get().active, 0);
  assert.equal(messages.filter((m) => m.to === config.ownerEmail).length, 1);
  assert.match(messages[0].text, new RegExp(b.id));
  assert.equal(
    db.prepare("SELECT count(*) n FROM delivery_attempts").get().n,
    2,
  );
  s.transition(b.id, "confirm", { version: 1, durationMinutes: 60 });
  await w.tick();
  const email = messages.find((m) => m.to === "test@example.invalid");
  assert.match(
    email.text,
    /Private booking link: https:\/\/development.example.invalid\/booking#/,
  );
  assert.equal(
    s.authorizeCustomer(b.id, customerToken(db, s.get(b.id))).id,
    b.id,
  );
  assert.equal(
    db.prepare("SELECT count(*) n FROM history WHERE booking_id=?").get(b.id).n,
    2,
  );
  db.close();
});
test("renewed subscriptions do not replay historic bookings and replace the old device endpoint", async () => {
  const { db, s } = fixture();
  const b = s.create(requestInput(), "old");
  db.prepare("INSERT INTO owners VALUES(?,?,?,?)").run(
    "owner",
    BUSINESS,
    "owner@example.invalid",
    "test",
  );
  const sub = {
    endpoint: "https://fcm.googleapis.com/new",
    keys: { auth: "a".repeat(22), p256dh: "a".repeat(87) },
  };
  saveSubscription(db, { subscription: sub }, { id: "owner" }, "key");
  db.prepare("UPDATE subscription_meta SET registered_at=?").run(
    Date.now() + 1,
  );
  let calls = 0;
  await new NotificationWorker(
    db,
    config,
    async () => {
      calls++;
    },
    async () => ({ id: "mail" }),
  ).tick();
  assert.equal(calls, 0);
  assert.equal(s.get(b.id).status, "pending");
  saveSubscription(
    db,
    {
      subscription: { ...sub, endpoint: "https://fcm.googleapis.com/renewed" },
      replaces: sub.endpoint,
    },
    { id: "owner" },
    "key",
  );
  assert.equal(
    db
      .prepare("SELECT active FROM subscriptions WHERE endpoint=?")
      .get(sub.endpoint).active,
    0,
  );
  db.close();
});
test("two workers claim one delivery; retry leases and failure attempts remain durable", async () => {
  const { db, s } = fixture();
  s.create(requestInput(), "lease");
  db.prepare("INSERT INTO subscriptions VALUES(?,?,?,?,1)").run(
    "device",
    BUSINESS,
    "https://fcm.googleapis.com/test",
    "{}",
  );
  let calls = 0;
  const send = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 10));
  };
  const a = new NotificationWorker(
      db,
      { vapidPublicKey: "test", vapidPrivateKey: "test", vapidSubject: "test" },
      send,
    ),
    b = new NotificationWorker(
      db,
      { vapidPublicKey: "test", vapidPrivateKey: "test", vapidSubject: "test" },
      send,
    );
  await Promise.all([a.tick(), b.tick()]);
  assert.equal(calls, 1);
  db.prepare(
    "UPDATE deliveries SET status='sending',claimed_until=0 WHERE channel='push'",
  ).run();
  await a.tick();
  assert.equal(calls, 2);
  assert.equal(
    db.prepare("SELECT attempts FROM deliveries WHERE channel='push'").get()
      .attempts,
    2,
  );
  db.close();
});
test("signed email receipts reject forged requests and idempotently reconcile true delivery", async () => {
  const { db, s } = fixture(),
    b = s.create(requestInput(), "receipt");
  s.transition(b.id, "confirm", { version: 1, durationMinutes: 60 });
  await new NotificationWorker(db, config, null, async (m) => ({
    id: m.to === config.ownerEmail ? "owner-id" : "customer-id",
  })).tick();
  const secret = "whsec_" + randomBytes(32).toString("base64"),
    wh = new Webhook(secret),
    id = "msg_test",
    timestamp = new Date(),
    raw = JSON.stringify({
      type: "email.delivered",
      created_at: new Date().toISOString(),
      data: { email_id: "customer-id" },
    }),
    headers = {
      "svix-id": id,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": wh.sign(id, timestamp, raw),
    };
  assert.throws(
    () =>
      recordEmailReceipt(
        db,
        raw,
        { ...headers, "svix-signature": "bad" },
        secret,
      ),
    /signature/,
  );
  recordEmailReceipt(db, raw, headers, secret);
  recordEmailReceipt(db, raw, headers, secret);
  assert.equal(
    db.prepare("SELECT count(*) n FROM webhook_receipts").get().n,
    1,
  );
  assert.equal(
    db
      .prepare("SELECT status FROM deliveries WHERE provider_id='customer-id'")
      .get().status,
    "delivered_to_mail_server",
  );
  db.close();
});
test("calendar shows pending, confirmed and blocks; availability excludes blocked and confirmed intervals", () => {
  const { db, s } = fixture(),
    data = requestInput(),
    b = s.create(data, "calendar");
  const p = s.catalog().find((p) => p.id === "dustoff");
  db.prepare("UPDATE services SET data=? WHERE id=?").run(
    JSON.stringify({ ...p, durationMinutes: 60 }),
    p.id,
  );
  const day = dateKey(Date.parse(future()));
  assert.ok(availability(s, day, "dustoff").slots.includes(future()));
  s.transition(b.id, "confirm", { version: 1, durationMinutes: 60 });
  assert.ok(!availability(s, day, "dustoff").slots.includes(future()));
  assert.throws(
    () =>
      addBlock(s, {
        startAt: future(),
        endAt: new Date(Date.parse(future()) + 3600000).toISOString(),
        label: "Conflicting block",
      }),
    /Reschedule/,
  );
  const later = new Date(Date.parse(future()) + 4 * 3600000).toISOString();
  addBlock(s, {
    startAt: later,
    endAt: new Date(Date.parse(later) + 3600000).toISOString(),
    label: "Personal time",
  });
  assert.ok(!availability(s, day, "dustoff").slots.includes(later));
  const c = calendar(s, day, day);
  assert.equal(c.bookings[0].status, "confirmed");
  assert.equal(c.blocks.length, 1);
  assert.throws(
    () =>
      s.transition(
        s.create({ ...data, requestedAt: later }, "blocked").id,
        "confirm",
        { version: 1, durationMinutes: 60 },
      ),
    /blocked/,
  );
  db.close();
});
test("availability handles unknown durations, closed days and invalid dates", () => {
  const { db, s } = fixture();
  assert.equal(
    availability(s, dateKey(Date.parse(future())), "dustoff").needsDuration,
    true,
  );
  assert.throws(() => calendar(s, "2026-02-30", "2026-03-01"), /dates/);
  s.updateSettings({
    ...s.settings(),
    closedDates: [dateKey(Date.parse(future()))],
  });
  const p = s.catalog().find((p) => p.id === "dustoff");
  db.prepare("UPDATE services SET data=? WHERE id=?").run(
    JSON.stringify({ ...p, durationMinutes: 60 }),
    p.id,
  );
  assert.equal(
    availability(s, dateKey(Date.parse(future())), "dustoff").slots.length,
    0,
  );
  db.close();
});
test("closed-date changes cannot silently conflict with confirmed appointments; DST dates map to Central time", () => {
  const { db, s } = fixture(),
    b = s.create(requestInput(), "closed-conflict");
  s.transition(b.id, "confirm", { version: 1, durationMinutes: 60 });
  assert.throws(
    () =>
      s.updateSettings({
        ...s.settings(),
        closedDates: [dateKey(Date.parse(future()))],
      }),
    /Reschedule/,
  );
  assert.equal(dateKey(Date.parse("2026-11-01T04:30:00Z")), "2026-10-31");
  assert.equal(dateKey(Date.parse("2026-11-01T07:30:00Z")), "2026-11-01");
  db.close();
});
