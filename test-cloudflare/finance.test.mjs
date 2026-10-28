import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { runtime, seed, login, call, input } from "./helpers.mjs";
import { material, priceDocument } from "../cloudflare/finance.js";
test("materials use integer quantities and pricing without unit assumptions", () => {
  const m = material({
    product: "Cleaner",
    quantityMillis: 1500,
    unit: "oz",
    costCents: 125,
    markupBps: 2000,
    taxable: true,
  });
  assert.equal(m.unitPriceCents, 150);
  assert.equal(m.sellingCents, 225);
  assert.throws(() => material({ ...m, unit: "liters" }));
  assert.throws(() => material({ ...m, quantityMillis: 1.5 }));
  const p = priceDocument({
    taxBps: 825,
    lines: [
      {
        description: "Service",
        unit: "service",
        quantityMillis: 1000,
        unitPriceCents: 10000,
        unitCostCents: 2500,
        taxable: true,
      },
    ],
  });
  assert.equal(p.totalCents, 10825);
  assert.equal(p.materialCostCents, 2500);
});
test("actual D1 finance: tenant isolation, immutable issue, idempotency, concurrent balance and cash report", async () => {
  const { mf, db } = await runtime();
  try {
    await seed(db);
    await seed(db, "second", "localhost:4336");
    const cookie = await login(mf),
      other = await login(mf, "http://localhost:4336");
    const post = (path, body, key = randomUUID()) =>
      call(mf, path, { method: "POST", cookie, body, key });
    assert.equal((await call(mf, "/api/owner/materials")).status, 401);
    const m = await post("/api/owner/materials", {
      product: "Cleaner",
      unit: "gallon",
      quantityMillis: 1000,
      costCents: 1200,
      markupBps: 5000,
      taxable: false,
    });
    assert.equal(m.status, 201);
    assert.equal(m.data.data.sellingCents, 1800);
    assert.equal(
      (
        await call(mf, "/api/owner/materials", {
          cookie: other,
          host: "http://localhost:4336",
        })
      ).data.records.length,
      0,
    );
    await call(mf, "/api/bookings", {
      method: "POST",
      body: input(),
      key: randomUUID(),
    });
    const customer = (await call(mf, "/api/owner/customers", { cookie })).data
      .records[0];
    const body = {
      kind: "invoice",
      customerId: customer.id,
      taxBps: 825,
      lines: [
        {
          description: "Detail",
          unit: "service",
          quantityMillis: 1000,
          unitPriceCents: 10000,
          unitCostCents: 2000,
          taxable: true,
        },
      ],
    };
    assert.equal(
      (
        await call(mf, "/api/owner/documents", {
          method: "POST",
          cookie: other,
          host: "http://localhost:4336",
          body,
        })
      ).status,
      404,
    );
    const draft = await post("/api/owner/documents", body);
    assert.equal(draft.status, 201);
    const issue = await post("/api/owner/documents/issue", {
      id: draft.data.id,
      version: 1,
    });
    assert.equal(issue.status, 200);
    assert.match(issue.data.number, /^INV-/);
    assert.equal(
      (
        await post("/api/owner/documents", {
          ...body,
          id: draft.data.id,
          version: 2,
        })
      ).status,
      409,
    );
    const payment = {
      kind: "payment",
      documentId: draft.data.id,
      amountCents: 6000,
      tipCents: 1000,
      occurredAt: new Date().toISOString(),
      method: "cash",
    };
    const results = await Promise.all([
      post("/api/owner/finance/events", payment),
      post("/api/owner/finance/events", payment),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    const key = randomUUID(),
      balance = { ...payment, amountCents: 4825, tipCents: 0 };
    const paid = await post("/api/owner/finance/events", balance, key);
    assert.equal(paid.status, 201);
    const retry = await post("/api/owner/finance/events", balance, key);
    assert.equal(retry.data.id, paid.data.id);
    assert.equal(retry.data.duplicate, true);
    assert.equal(
      (
        await post(
          "/api/owner/finance/events",
          { ...balance, amountCents: 1 },
          key,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await post("/api/owner/finance/events", {
          kind: "expense",
          amountCents: 2000,
          category: "materials",
          occurredAt: new Date().toISOString(),
          method: "bank",
        })
      ).status,
      201,
    );
    const from = new Date(Date.now() - 86400000).toISOString(),
      to = new Date(Date.now() + 86400000).toISOString();
    const report = (
      await call(
        mf,
        "/api/owner/finance/report?" + new URLSearchParams({ from, to }),
        { cookie },
      )
    ).data;
    assert.equal(report.receiptsCents, 10825);
    assert.equal(report.salesTaxCollectedCents, 825);
    assert.equal(report.tipsCents, 1000);
    assert.equal(report.materialsPurchasedCents, 2000);
    assert.equal(report.estimatedProfitCents, 9000);
    assert.equal(report.cashFlowCents, 9825);
    const foreign = (
      await call(
        mf,
        "/api/owner/finance/report?" + new URLSearchParams({ from, to }),
        { cookie: other, host: "http://localhost:4336" },
      )
    ).data;
    assert.equal(foreign.receiptsCents, 0);
    assert.equal(
      (await db.prepare("PRAGMA foreign_key_check").all()).results.length,
      0,
    );
  } finally {
    await mf.dispose();
  }
});
