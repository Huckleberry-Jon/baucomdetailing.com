import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { runtime, seed, call, login, input } from "./helpers.mjs";
const profile = {
  name: "Fixture Detail",
  contact: "Amarillo",
  invoiceAddress: "Fixture address",
  invoicePhone: "8065550100",
  invoiceEmail: "fixture@example.invalid",
  invoiceFooter: "Thank you",
};
const line = {
  product: "Cleaner",
  unit: "bottle",
  quantityMillis: 2000,
  costCents: 500,
  markupBps: 0,
  taxable: false,
  lowStockMillis: 2000,
};
async function photo(color = "#aabbcc") {
  return {
    name: "receipt.png",
    base64: (
      await sharp({
        create: { width: 32, height: 32, channels: 3, background: color },
      })
        .png()
        .toBuffer()
    ).toString("base64"),
  };
}
test("actual D1/R2 receipt import is reviewed, atomic, private and idempotent; low stock follows inventory", async () => {
  const f = await runtime();
  try {
    await seed(f.db);
    const cookie = await login(f.mf),
      body = {
        reviewed: true,
        vendor: "Fixture vendor",
        reference: "R1",
        photo: await photo(),
        lines: [line],
      };
    assert.equal(
      (
        await call(f.mf, "/api/owner/inventory-receipts", {
          method: "POST",
          body,
          key: "r1",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call(f.mf, "/api/owner/inventory-receipts", {
          method: "POST",
          cookie,
          body: { ...body, reviewed: false },
          key: "r1",
        })
      ).status,
      400,
    );
    const first = await call(f.mf, "/api/owner/inventory-receipts", {
      method: "POST",
      cookie,
      body,
      key: "r1",
    });
    assert.equal(first.status, 201, JSON.stringify(first.data));
    assert.equal(
      (
        await call(f.mf, "/api/owner/inventory-receipts", {
          method: "POST",
          cookie,
          body,
          key: "r1",
        })
      ).data.duplicate,
      true,
    );
    assert.equal(
      (
        await call(f.mf, "/api/owner/inventory-receipts", {
          method: "POST",
          cookie,
          body,
          key: "r2",
        })
      ).status,
      409,
    );
    let rows = (await call(f.mf, "/api/owner/materials", { cookie })).data
      .records;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].available_quantity_millis, 2000);
    assert.equal(rows[0].low_stock, true);
    const r = rows[0];
    const restock = {
      ...body,
      photo: await photo("#112233"),
      lines: [
        {
          ...line,
          quantityMillis: 1000,
          materialId: r.id,
          materialVersion: r.version,
          stockVersion: r.stock_version,
        },
      ],
    };
    assert.equal(
      (
        await call(f.mf, "/api/owner/inventory-receipts", {
          method: "POST",
          cookie,
          body: restock,
          key: "r3",
        })
      ).status,
      201,
    );
    rows = (await call(f.mf, "/api/owner/materials", { cookie })).data.records;
    assert.equal(rows[0].available_quantity_millis, 3000);
    assert.equal(rows[0].low_stock, false);
    const stale = await call(f.mf, "/api/owner/inventory-receipts", {
      method: "POST",
      cookie,
      body: { ...restock, photo: await photo("#223344") },
      key: "r4",
    });
    assert.equal(stale.status, 409);
    assert.equal(
      (await f.db.prepare("SELECT count(*) n FROM financial_events").first()).n,
      0,
    );
    assert.equal(
      (await f.db.prepare("SELECT count(*) n FROM inventory_receipts").first())
        .n,
      2,
    );
    assert.equal(
      (
        await call(
          f.mf,
          "/api/owner/inventory-receipt-photo?id=" + first.data.id,
        )
      ).status,
      401,
    );
    const image = await f.mf.dispatchFetch(
      "http://localhost:4334/api/owner/inventory-receipt-photo?id=" +
        first.data.id,
      { headers: { Cookie: cookie } },
    );
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("cache-control"), "no-store");
    assert.equal((await image.arrayBuffer()).byteLength > 0, true);
    await seed(f.db, "other", "127.0.0.1:4334");
    const other = await login(f.mf, "http://127.0.0.1:4334");
    assert.equal(
      (
        await call(
          f.mf,
          "/api/owner/inventory-receipt-photo?id=" + first.data.id,
          { cookie: other, host: "http://127.0.0.1:4334" },
        )
      ).status,
      404,
    );
    await f.db.exec(
      "CREATE TRIGGER reject_receipt BEFORE INSERT ON inventory_receipts BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;",
    );
    const fail = await call(f.mf, "/api/owner/inventory-receipts", {
      method: "POST",
      cookie,
      key: "failure",
      body: { ...body, photo: await photo("#556677") },
    });
    assert.equal(fail.status, 500);
    assert.equal(
      (await f.db.prepare("SELECT count(*) n FROM materials").first()).n,
      1,
    );
    assert.equal(
      (await f.db.prepare("SELECT count(*) n FROM inventory_movements").first())
        .n,
      2,
    );
  } finally {
    await f.mf.dispose();
  }
});
test("business logo and invoice branding are scoped, versioned and historical", async () => {
  const f = await runtime();
  try {
    await seed(f.db);
    const cookie = await login(f.mf);
    let p = (await call(f.mf, "/api/owner/business-profile", { cookie })).data;
    const original = p.profile;
    const saved = await call(f.mf, "/api/owner/business-profile", {
      method: "PUT",
      cookie,
      body: { version: p.version, profile, logo: await photo() },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    p = (await call(f.mf, "/api/owner/business-profile", { cookie })).data;
    assert.equal(p.profile.workingDays.join(), original.workingDays.join());
    assert.deepEqual(
      p.profile.notificationPreferences,
      original.notificationPreferences,
    );
    const logoId = p.profile.invoiceLogoId;
    assert.ok(logoId);
    assert.ok(
      (await call(f.mf, "/api/owner/business-asset?id=" + logoId, { cookie }))
        .data.base64,
    );
    const booking = await call(f.mf, "/api/bookings", {
      method: "POST",
      key: "brand-customer",
      body: input(),
    });
    assert.equal(booking.status, 201);
    const customer = await f.db.prepare("SELECT id FROM customers").first();
    const d = await call(f.mf, "/api/owner/documents", {
      method: "POST",
      cookie,
      body: {
        customerId: customer.id,
        kind: "invoice",
        taxBps: 0,
        lines: [
          {
            description: "Detail",
            unit: "service",
            quantityMillis: 1000,
            unitPriceCents: 7900,
            unitCostCents: 0,
            taxable: false,
          },
        ],
      },
    });
    assert.equal(d.status, 201, JSON.stringify(d.data));
    assert.equal(
      (
        await call(f.mf, "/api/owner/documents/issue", {
          method: "POST",
          cookie,
          body: { id: d.data.id, version: 1 },
        })
      ).status,
      200,
    );
    p = (await call(f.mf, "/api/owner/business-profile", { cookie })).data;
    assert.equal(
      (
        await call(f.mf, "/api/owner/business-profile", {
          method: "PUT",
          cookie,
          body: {
            version: p.version,
            profile: { ...profile, name: "Changed" },
            removeLogo: true,
          },
        })
      ).status,
      200,
    );
    const doc = (
        await call(f.mf, "/api/owner/document?id=" + d.data.id, { cookie })
      ).data,
      data = JSON.parse(doc.data);
    assert.equal(data.businessName, profile.name);
    assert.equal(data.invoiceLogoId, logoId);
    assert.equal(data.businessAddress, profile.invoiceAddress);
    assert.equal(
      (
        await call(f.mf, "/api/owner/business-profile", {
          method: "PUT",
          cookie,
          body: { version: p.version, profile },
        })
      ).status,
      409,
    );
    await seed(f.db, "other", "127.0.0.1:4334");
    const other = await login(f.mf, "http://127.0.0.1:4334");
    assert.equal(
      (
        await call(f.mf, "/api/owner/business-asset?id=" + logoId, {
          cookie: other,
          host: "http://127.0.0.1:4334",
        })
      ).status,
      404,
    );
  } finally {
    await f.mf.dispose();
  }
});
