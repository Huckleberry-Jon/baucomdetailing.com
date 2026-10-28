import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { runtime, seed, call, login, input } from "./helpers.mjs";
import {
  createCloudBackup,
  restoreCloudBackup,
  TABLES,
} from "../cloudflare/recovery.mjs";
import { fileStorage } from "../scripts/cloud-backup.mjs";

test("full encrypted cloud recovery restores fresh actual D1/R2 and fails closed on tampering", async () => {
  const source = await runtime(),
    target = await runtime(),
    empty = await runtime();
  try {
    await seed(source.db);
    const cookie = await login(source.mf),
      bytes = await sharp({
        create: { width: 10, height: 10, channels: 3, background: "#226644" },
      })
        .png()
        .toBuffer();
    const booking = await call(source.mf, "/api/bookings", {
      method: "POST",
      key: randomUUID(),
      body: input({
        photos: [{ name: "fixture.png", base64: bytes.toString("base64") }],
      }),
    });
    assert.equal(booking.status, 201);
    await call(source.mf, "/api/owner/transition", {
      method: "POST",
      cookie,
      body: {
        id: booking.data.id,
        version: 1,
        action: "confirm",
        durationMinutes: 90,
      },
    });
    await source.fixture("drain", {
      tenant: "baucom",
      origin: "http://localhost:4334",
      env: {},
    });
    const dir = await mkdtemp(
        join(tmpdir(), "docdetailing-encrypted-recovery-"),
      ),
      storage = fileStorage(dir),
      passphrase = "Synthetic-recovery-passphrase-2026!";
    const backup = await createCloudBackup({
      db: source.db,
      media: source.bucket,
      destination: storage,
      passphrase,
      namespace: "local",
    });
    const encrypted = await storage.get(backup.id + "/manifest.enc");
    assert.ok(!encrypted.includes(Buffer.from("customer@example.invalid")));
    await assert.rejects(
      restoreCloudBackup({
        db: empty.db,
        media: empty.bucket,
        source: storage,
        id: backup.id,
        passphrase: "Wrong-synthetic-recovery-passphrase",
        namespace: "local",
      }),
    );
    assert.equal(
      (await empty.db.prepare("SELECT count(*) n FROM businesses").first()).n,
      0,
    );
    const report = await restoreCloudBackup({
      db: target.db,
      media: target.bucket,
      source: storage,
      id: backup.id,
      passphrase,
      namespace: "local",
    });
    assert.equal(report.bookings, 1);
    assert.equal(report.deliveryHold, true);
    for (const table of [
      "bookings",
      "customers",
      "vehicles",
      "settings",
      "history",
      "notifications",
      "jobs",
      "media",
    ]) {
      if (table === "settings") {
        assert.equal(
          (await target.db.prepare("SELECT settings FROM businesses").first())
            .settings,
          (await source.db.prepare("SELECT settings FROM businesses").first())
            .settings,
        );
        continue;
      }
      assert.equal(
        (await target.db.prepare("SELECT count(*) n FROM " + table).first()).n,
        (await source.db.prepare("SELECT count(*) n FROM " + table).first()).n,
      );
    }
    const photo = await target.db.prepare("SELECT * FROM media").first();
    assert.deepEqual(
      Buffer.from(
        await (await target.bucket.get(photo.original_key)).arrayBuffer(),
      ),
      bytes,
    );
    assert.equal(
      (await target.db.prepare("SELECT count(*) n FROM sessions").first()).n,
      0,
    );
    assert.equal(
      (await target.db.prepare("SELECT count(*) n FROM tenant_domains").first())
        .n,
      0,
    );
    assert.equal(
      (await target.db.prepare("SELECT delivery_hold FROM businesses").first())
        .delivery_hold,
      1,
    );
    assert.ok(
      (await target.db.prepare("SELECT * FROM deliveries").all()).results.every(
        (d) => d.status === "recovery_hold",
      ),
    );
    await assert.rejects(
      restoreCloudBackup({
        db: target.db,
        media: target.bucket,
        source: storage,
        id: backup.id,
        passphrase,
        namespace: "local",
      }),
      /empty target/,
    );
    const mediaFile = backup.id + "/media-0.enc",
      bad = Buffer.from(await storage.get(mediaFile));
    bad[bad.length - 1] ^= 1;
    await writeFile(join(dir, mediaFile), bad);
    await assert.rejects(
      restoreCloudBackup({
        db: empty.db,
        media: empty.bucket,
        source: storage,
        id: backup.id,
        passphrase,
        namespace: "local",
      }),
    );
    assert.equal(
      (await empty.db.prepare("SELECT count(*) n FROM bookings").first()).n,
      0,
    );
  } finally {
    await source.mf.dispose();
    await target.mf.dispose();
    await empty.mf.dispose();
  }
});
