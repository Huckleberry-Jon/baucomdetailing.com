import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fixture, requestInput } from "./helpers.js";
import { openDatabase } from "../src/db.js";
import { BookingService } from "../src/bookings.js";
import { NotificationWorker } from "../src/notifications.js";
test("push/email/worker failures survive database restart without losing booking or status history", async () => {
  const dir = await mkdtemp(
    join(tmpdir(), "docdetailing-notification-durable-"),
  );
  let db;
  try {
    let s;
    ({ db, s } = fixture(join(dir, "database.sqlite")));
    const booking = s.create(requestInput(), "durable-failure");
    db.prepare("INSERT INTO subscriptions VALUES(?,?,?,?,1)").run(
      "device",
      "baucom",
      "https://fcm.googleapis.com/test",
      "{}",
    );
    const config = {
        vapidPublicKey: "test",
        vapidPrivateKey: "test",
        vapidSubject: "test",
        emailApiKey: "test",
        emailFrom: "sender@example.invalid",
        ownerEmail: "owner@example.invalid",
      },
      failure = async () => {
        throw Object.assign(Error("synthetic provider failure"), {
          statusCode: 503,
        });
      };
    await new NotificationWorker(db, config, failure, failure).tick();
    s.transition(booking.id, "confirm", { version: 1, durationMinutes: 60 });
    const broken = new NotificationWorker(db, config, failure, failure);
    broken.enqueue = () => {
      throw Error("Synthetic worker outage");
    };
    await broken.tick();
    db.close();
    db = openDatabase(join(dir, "database.sqlite"));
    s = new BookingService(db);
    assert.equal(s.get(booking.id).status, "confirmed");
    assert.equal(
      db
        .prepare("SELECT count(*) n FROM history WHERE booking_id=?")
        .get(booking.id).n,
      2,
    );
    assert.equal(
      db
        .prepare("SELECT count(*) n FROM notifications WHERE booking_id=?")
        .get(booking.id).n,
      2,
    );
    assert.equal(db.prepare("SELECT count(*) n FROM worker_errors").get().n, 1);
    assert.equal(
      db.prepare("SELECT count(*) n FROM deliveries WHERE status='retry'").get()
        .n,
      2,
    );
    await new NotificationWorker(db, config, failure, failure).tick();
    assert.equal(s.get(booking.id).status, "confirmed");
    assert.ok(
      db
        .prepare("SELECT count(*) n FROM deliveries WHERE channel='customer'")
        .get().n >= 1,
    );
  } finally {
    db?.close();
    assert.ok(
      resolve(dir).startsWith(
        resolve(tmpdir()) + sep + "docdetailing-notification-durable-",
      ),
    );
    await rm(dir, { recursive: true, maxRetries: 5, retryDelay: 100 });
  }
});
