import test from "node:test";
import assert from "node:assert/strict";
import { runtime, seed, login, call, input } from "./helpers.mjs";
import { material, priceDocument } from "../cloudflare/finance.js";
import { usageCost } from "../cloudflare/material-costing.js";
const product = {
  product: "Gallon cleaner",
  unit: "oz",
  quantityMillis: 1000,
  costCents: 0,
  purchaseUnit: "gallon",
  purchaseCostCents: 3299,
  taxable: false,
};
test("purchase basis preserves gallon cost and applies standard 30% markup once at the line total", () => {
  const p = material(product);
  assert.equal(p.purchaseSizeMillis, 128000);
  assert.equal(p.markupBps, 3000);
  assert.equal(usageCost(p, 8000), 206);
  assert.equal(usageCost(p, 8000, true), 268);
  assert.equal(usageCost(p, 128000), 3299);
  assert.equal(usageCost(p, 128000, true), 4289);
  assert.equal(material({ ...product, markupBps: 0 }).markupBps, 0);
  assert.throws(() => material({ ...product, purchaseSizeMillis: 160000 }));
  assert.throws(() => material({ ...product, purchaseUnit: "bottle" }));
});
test("actual D1 purchase, usage and invoice keep ounce precision and cannot duplicate stock", async () => {
  const f = await runtime();
  try {
    await seed(f.db);
    const cookie = await login(f.mf),
      post = (path, body, key) =>
        call(f.mf, path, { method: "POST", cookie, body, key });
    const body = {
      kind: "purchase",
      confirmed: true,
      product,
      purchaseQuantityMillis: 1000,
    };
    const p = await post("/api/owner/material-purchase", body, "gallon1");
    assert.equal(p.status, 201, JSON.stringify(p.data));
    assert.equal(
      (await post("/api/owner/material-purchase", body, "gallon1")).data
        .duplicate,
      true,
    );
    assert.equal(
      (
        await post(
          "/api/owner/material-purchase",
          { ...body, purchaseQuantityMillis: 2000 },
          "gallon1",
        )
      ).status,
      409,
    );
    let r = (await call(f.mf, "/api/owner/materials", { cookie })).data
      .records[0];
    assert.equal(r.available_quantity_millis, 128000);
    assert.equal(JSON.parse(r.data).markupBps, 3000);
    const b = await post("/api/bookings", input(), "gallonbooking");
    assert.equal(
      (
        await post("/api/owner/transition", {
          id: b.data.id,
          version: 1,
          action: "confirm",
          durationMinutes: 90,
        })
      ).status,
      200,
    );
    const job = (await call(f.mf, "/api/owner/jobs", { cookie })).data
      .records[0];
    assert.equal(
      (
        await call(f.mf, "/api/owner/job", {
          method: "PUT",
          cookie,
          body: {
            id: job.id,
            version: 0,
            data: {
              lines: [
                {
                  description: "Detail",
                  unit: "service",
                  quantityMillis: 1000,
                  unitPriceCents: 6000,
                  unitCostCents: 0,
                  taxable: false,
                },
              ],
            },
          },
        })
      ).status,
      200,
    );
    const usage = await post(
      "/api/owner/inventory",
      {
        kind: "usage",
        materialId: r.id,
        version: r.stock_version,
        jobId: job.id,
        quantityMillis: 8000,
        reason: "8 fl oz used",
      },
      "usage8",
    );
    assert.equal(usage.status, 201);
    const movement = await f.db
      .prepare("SELECT * FROM inventory_movements WHERE job_id=?")
      .bind(job.id)
      .first();
    assert.equal(movement.cost_cents, 206);
    const snapshot = JSON.parse(movement.data);
    assert.equal(snapshot.costBasisCents, 3299);
    assert.equal(snapshot.costBasisQuantityMillis, 128000);
    const quote = (
      await call(f.mf, "/api/owner/job-completion?booking=" + b.data.id, {
        cookie,
      })
    ).data.quote;
    assert.equal(quote.subtotalCents, 6268);
    assert.equal(quote.lines[1].costCents, 206);
    assert.equal(quote.lines[1].totalCents, 268);
    r = (await call(f.mf, "/api/owner/materials", { cookie })).data.records[0];
    assert.equal(r.available_quantity_millis, 120000);
    assert.equal(
      (await f.db.prepare("SELECT count(*) n FROM financial_events").first()).n,
      0,
    );
  } finally {
    await f.mf.dispose();
  }
});
test("actual D1 existing single container converts to 128 oz with editable 30% markup and unchanged finances", async () => {
  const f = await runtime();
  try {
    await seed(f.db);
    const cookie = await login(f.mf),
      post = (p, b, k) =>
        call(f.mf, p, { method: "POST", cookie, body: b, key: k });
    const old = await post("/api/owner/materials", {
      product: "Existing cleaner",
      unit: "piece",
      quantityMillis: 1000,
      costCents: 3299,
      markupBps: 0,
      taxable: false,
    });
    await post(
      "/api/owner/inventory",
      {
        kind: "correction",
        materialId: old.data.id,
        version: 0,
        availableQuantityMillis: 1000,
        reason: "One purchased gallon",
      },
      "oldstock",
    );
    const convert = {
      kind: "convert",
      confirmed: true,
      materialId: old.data.id,
      materialVersion: 1,
      stockVersion: 1,
      product: { ...product, markupBps: 3000 },
    };
    const c = await post("/api/owner/material-purchase", convert, "convert1");
    assert.equal(c.status, 201, JSON.stringify(c.data));
    assert.equal(c.data.availableQuantityMillis, 128000);
    assert.equal(
      (await post("/api/owner/material-purchase", convert, "convert1")).data
        .duplicate,
      true,
    );
    assert.equal(
      (await f.db.prepare("SELECT count(*) n FROM financial_events").first()).n,
      0,
    );
    assert.equal(
      (await f.db.prepare("SELECT count(*) n FROM financial_documents").first())
        .n,
      0,
    );
  } finally {
    await f.mf.dispose();
  }
});
