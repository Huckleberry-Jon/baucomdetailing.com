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
import { fileStorage, verifyArchiveRestore } from "../scripts/cloud-backup.mjs";

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

    const brand = (
      await call(source.mf, "/api/owner/business-profile", { cookie })
    ).data;
    assert.equal(
      (
        await call(source.mf, "/api/owner/business-profile", {
          method: "PUT",
          cookie,
          body: {
            version: brand.version,
            profile: {
              name: "Recovery detail",
              contact: "Fixture",
              invoiceAddress: "",
              invoicePhone: "",
              invoiceEmail: "",
              invoiceFooter: "",
            },
            logo: { name: "logo.png", base64: bytes.toString("base64") },
          },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call(source.mf, "/api/owner/inventory-receipts", {
          method: "POST",
          cookie,
          key: "recovery-receipt",
          body: {
            reviewed: true,
            vendor: "Fixture vendor",
            reference: "backup-1",
            photo: { name: "receipt.png", base64: bytes.toString("base64") },
            lines: [
              {
                product: "Receipt cleaner",
                unit: "bottle",
                quantityMillis: 1000,
                costCents: 500,
                markupBps: 0,
                taxable: false,
                lowStockMillis: 500,
              },
            ],
          },
        })
      ).status,
      201,
    );
    const booking = await call(source.mf, "/api/bookings", {
      method: "POST",
      key: randomUUID(),
      body: input({
        photos: [{ name: "fixture.png", base64: bytes.toString("base64") }],
      }),
    });
    assert.equal(booking.status, 201);
    assert.equal(
      (
        await call(source.mf, "/api/owner/native-device", {
          method: "POST",
          cookie,
          body: {
            deviceId: "recovery-device-test-1",
            deviceToken: "ab".repeat(32),
            environment: "production",
            enabled: true,
          },
        })
      ).status,
      200,
    );
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
    const customer = await source.db
      .prepare("SELECT id FROM customers LIMIT 1")
      .first();
    const material = await call(source.mf, "/api/owner/materials", {
      method: "POST",
      cookie,
      body: {
        product: "Recovery cleaner",
        unit: "bottle",
        quantityMillis: 1000,
        costCents: 500,
        markupBps: 1000,
        taxable: false,
      },
    });
    assert.equal(material.status, 201);
    assert.equal(
      (
        await call(source.mf, "/api/owner/inventory", {
          method: "POST",
          cookie,
          key: "recovery-stock",
          body: {
            kind: "correction",
            materialId: material.data.id,
            version: 0,
            availableQuantityMillis: 2500,
            reason: "Recovery stock count",
          },
        })
      ).status,
      201,
    );
    const job = (await call(source.mf, "/api/owner/jobs", { cookie })).data
      .records[0];
    assert.equal(
      (
        await call(source.mf, "/api/owner/job", {
          method: "PUT",
          cookie,
          body: {
            id: job.id,
            version: 0,
            data: {
              lines: [
                {
                  description: "Recovery job",
                  unit: "service",
                  quantityMillis: 1000,
                  unitPriceCents: 10000,
                  unitCostCents: 0,
                  taxable: false,
                },
              ],
              laborCostCents: 2500,
              travelCostCents: 500,
            },
          },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call(source.mf, "/api/owner/inventory", {
          method: "POST",
          cookie,
          key: "recovery-usage",
          body: {
            kind: "usage",
            materialId: material.data.id,
            jobId: job.id,
            version: 1,
            quantityMillis: 500,
            reason: "Confirmed recovery fixture usage",
          },
        })
      ).status,
      201,
    );
    const document = await call(source.mf, "/api/owner/documents", {
      method: "POST",
      cookie,
      body: {
        kind: "invoice",
        customerId: customer.id,
        taxBps: 0,
        lines: [
          {
            description: "Detail",
            unit: "service",
            quantityMillis: 1000,
            unitPriceCents: 10000,
            unitCostCents: 1000,
            taxable: false,
          },
        ],
      },
    });
    assert.equal(document.status, 201);
    assert.equal(
      (
        await call(source.mf, "/api/owner/documents/issue", {
          method: "POST",
          cookie,
          body: { id: document.data.id, version: 1 },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call(source.mf, "/api/owner/finance/events", {
          method: "POST",
          cookie,
          key: randomUUID(),
          body: {
            kind: "payment",
            documentId: document.data.id,
            amountCents: 10000,
            tipCents: 500,
            method: "cash",
            occurredAt: new Date().toISOString(),
          },
        })
      ).status,
      201,
    );
    await source.db
      .prepare(
        "INSERT INTO tenant_entitlements VALUES('baucom','complimentary_test','active',?)",
      )
      .bind(Date.now())
      .run();
    const supplyService = (
      await call(source.mf, "/api/owner/dashboard", { cookie })
    ).data.services.find((s) => s.id === "dustoff");
    assert.equal(
      (
        await call(source.mf, "/api/owner/service-consumables", {
          method: "PUT",
          cookie,
          body: {
            serviceId: "dustoff",
            version: supplyService.version,
            consumables: [
              { materialId: material.data.id, quantityMillis: 500 },
            ],
          },
        })
      ).status,
      200,
    );
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
    const verified = await verifyArchiveRestore({
      source: storage,
      id: backup.id,
      passphrase,
    });
    assert.equal(verified.restoreVerified, true);
    assert.equal(verified.integrity, "ok");
    assert.equal(verified.bookings, backup.records);
    assert.equal(verified.mediaObjects, backup.objects);
    assert.equal(verified.counts.sessions, 0);
    assert.equal(verified.counts.tenant_domains, 0);
    assert.ok(verified.counts.inventory_receipts > 0);
    assert.ok(verified.counts.financial_events > 0);
    await assert.rejects(
      verifyArchiveRestore({
        source: storage,
        id: backup.id,
        passphrase: "Wrong-verification-passphrase-2026",
      }),
    );
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
      "services",
      "materials",
      "job_details",
      "inventory_balances",
      "inventory_movements",
      "financial_documents",
      "financial_events",
      "tenant_entitlements",
      "media",
      "business_assets",
      "inventory_receipts",
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
    for (const table of [
      "materials",
      "job_details",
      "inventory_balances",
      "inventory_movements",
      "financial_documents",
      "financial_events",
      "tenant_entitlements",
    ]) {
      assert.deepEqual(
        (
          await target.db
            .prepare("SELECT * FROM " + table + " ORDER BY rowid")
            .all()
        ).results,
        (
          await source.db
            .prepare("SELECT * FROM " + table + " ORDER BY rowid")
            .all()
        ).results,
      );
    }
    assert.equal(
      (await target.db.prepare("SELECT active FROM native_devices").first())
        .active,
      0,
    );
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
