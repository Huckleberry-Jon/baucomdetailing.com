import { submitReview, moderateReview, publicReviews } from "../src/reviews.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { fixture, requestInput } from "./helpers.js";
import { openDatabase } from "../src/db.js";
import { createBackup, restoreBackup } from "../src/backups.js";
import { preparePhotos, listPhotos, mediaRecord } from "../src/media.js";
import { BookingService } from "../src/bookings.js";
import { NotificationWorker } from "../src/notifications.js";
import { customerToken } from "../src/customer-links.js";
import { BUSINESS } from "../src/catalog.js";
const passphrase = "Synthetic backup test passphrase only";
test("encrypted backup restores records, settings, audit, secrets and exact photo bytes into a fresh database", async () => {
  const dir = await mkdtemp(join(tmpdir(), "docdetailing-backup-"));
  let db, restored;
  try {
    ({ db } = fixture(join(dir, "source.sqlite")));
    const s = new BookingService(db),
      photo = {
        name: "synthetic.png",
        base64: (
          await sharp({
            create: { width: 20, height: 20, channels: 3, background: "green" },
          })
            .png()
            .toBuffer()
        ).toString("base64"),
      },
      input = { ...requestInput(), photos: [photo] },
      b = s.create(input, "backup", await preparePhotos(input.photos));
    s.transition(b.id, "confirm", { version: 1, durationMinutes: 60 });
    db.prepare("INSERT INTO owners VALUES(?,?,?,?)").run(
      "owner",
      BUSINESS,
      "qa@example.invalid",
      "test",
    );
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      "old-session",
      "owner",
      Date.now() + 3600000,
    );
    db.prepare("INSERT INTO subscriptions VALUES(?,?,?,?,1)").run(
      "device",
      BUSINESS,
      "https://fcm.googleapis.com/test",
      "{}",
    );
    await new NotificationWorker(db).tick();
    const review = submitReview(
      s,
      {
        displayName: "Backup reviewer",
        rating: 2,
        feedback: "Synthetic feedback retained in backups.",
        consent: true,
      },
      "backup-review",
    );
    moderateReview(
      db,
      { id: review.id, version: 1, status: "approved" },
      { id: "owner" },
    );
    const snapshot = mediaRecord(db, listPhotos(db, b.id)[0].id),
      secret = customerToken(db, s.get(b.id));
    const backupDir = join(dir, "backup"),
      target = join(dir, "restored");
    await createBackup(db, backupDir, passphrase);
    const encrypted = await readFile(join(backupDir, "database.enc"));
    assert.equal(
      encrypted.includes(Buffer.from("Synthetic test address")),
      false,
    );
    const result = await restoreBackup(backupDir, target, passphrase);
    restored = openDatabase(result.databasePath);
    const r = new BookingService(restored);
    assert.equal(r.get(b.id).status, "confirmed");
    assert.equal(publicReviews(restored)[0].rating, 2);
    assert.equal(
      restored.prepare("SELECT count(*) n FROM review_moderation").get().n,
      1,
    );
    let sends = 0;
    await new NotificationWorker(
      restored,
      {
        emailApiKey: "test",
        emailFrom: "test@example.invalid",
        ownerEmail: "owner@example.invalid",
      },
      null,
      async () => {
        sends++;
      },
    ).tick();
    assert.equal(sends, 0);
    assert.deepEqual(r.settings(), s.settings());
    assert.equal(
      restored.prepare("SELECT count(*) n FROM customers").get().n,
      1,
    );
    assert.equal(
      restored.prepare("SELECT count(*) n FROM vehicles").get().n,
      1,
    );
    assert.equal(restored.prepare("SELECT count(*) n FROM history").get().n, 2);
    assert.equal(
      restored.prepare("SELECT count(*) n FROM sessions").get().n,
      0,
    );
    assert.equal(
      restored.prepare("SELECT active FROM subscriptions").get().active,
      0,
    );
    assert.equal(
      restored
        .prepare(
          "SELECT value FROM private_keys WHERE name='delivery-recovery-hold'",
        )
        .get().value,
      "1",
    );
    assert.equal(r.authorizeCustomer(b.id, secret).id, b.id);
    const media = mediaRecord(restored, snapshot.id);
    assert.deepEqual(
      Buffer.from(media.original),
      Buffer.from(snapshot.original),
    );
    assert.deepEqual(Buffer.from(media.preview), Buffer.from(snapshot.preview));
    await assert.rejects(
      restoreBackup(backupDir, target, passphrase),
      /EEXIST/,
    );
    await assert.rejects(
      restoreBackup(
        backupDir,
        join(dir, "wrong-password"),
        "Wrong synthetic passphrase with 20 chars",
      ),
    );
    const manifest = JSON.parse(
      await readFile(join(backupDir, "manifest.json"), "utf8"),
    );
    await writeFile(join(backupDir, "database.enc"), Buffer.from("tampered"));
    await assert.rejects(
      restoreBackup(backupDir, join(dir, "tampered"), passphrase),
      /checksum/,
    );
    assert.ok(manifest.migrations.length >= 6);
  } finally {
    restored?.close();
    db?.close();
    assert.ok(
      resolve(dir).startsWith(resolve(tmpdir()) + sep + "docdetailing-backup-"),
    );
    await rm(dir, { recursive: true, maxRetries: 5, retryDelay: 100 });
  }
});
