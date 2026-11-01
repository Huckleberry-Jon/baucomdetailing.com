import test from "node:test";
import assert from "node:assert/strict";
import { runtime, seed, login, call, input, future } from "./helpers.mjs";
async function fixture() {
  const f = await runtime();
  await seed(f.db);
  const cookie = await login(f.mf),
    post = (p, b, key) =>
      call(f.mf, p, { method: "POST", cookie, body: b, key });
  const rag = await post("/api/owner/materials", {
    product: "Rags",
    unit: "piece",
    quantityMillis: 1000,
    costCents: 25,
    markupBps: 3000,
    taxable: false,
    lowStockMillis: 8000,
  });
  await post(
    "/api/owner/inventory",
    {
      kind: "correction",
      materialId: rag.data.id,
      version: 0,
      availableQuantityMillis: 10000,
      reason: "Initial supply",
    },
    "ragstock",
  );
  const soap = await post(
    "/api/owner/material-purchase",
    {
      kind: "purchase",
      confirmed: true,
      purchaseQuantityMillis: 1000,
      product: {
        product: "Soap",
        unit: "oz",
        quantityMillis: 1000,
        costCents: 0,
        purchaseUnit: "gallon",
        purchaseCostCents: 3299,
        markupBps: 3000,
        taxable: false,
      },
    },
    "soapstock",
  );
  const assign = async (serviceId, consumables) => {
    const service = (
      await call(f.mf, "/api/owner/dashboard", { cookie })
    ).data.services.find((s) => s.id === serviceId);
    return call(f.mf, "/api/owner/service-consumables", {
      cookie,
      method: "PUT",
      body: { serviceId, version: service.version, consumables },
    });
  };
  assert.equal(
    (
      await assign("dustoff", [
        { materialId: rag.data.id, quantityMillis: 2000 },
      ])
    ).status,
    200,
  );
  assert.equal(
    (
      await assign("route66", [
        { materialId: rag.data.id, quantityMillis: 3000 },
        { materialId: soap.data.id, quantityMillis: 8000 },
      ])
    ).status,
    200,
  );
  const booking = await post("/api/bookings", input(), "supplybooking");
  assert.equal(booking.status, 201);
  await post("/api/owner/transition", {
    id: booking.data.id,
    version: 1,
    action: "confirm",
    durationMinutes: 90,
  });
  const job = (await call(f.mf, "/api/owner/jobs", { cookie })).data.records[0];
  const save = await call(f.mf, "/api/owner/job", {
    cookie,
    method: "PUT",
    body: {
      id: job.id,
      version: 0,
      data: {
        lines: [
          {
            description: "Detail",
            unit: "service",
            quantityMillis: 1000,
            unitPriceCents: 10000,
            unitCostCents: 0,
            taxable: false,
          },
        ],
      },
    },
  });
  assert.equal(save.status, 200);
  const view = async () =>
    (await call(f.mf, "/api/owner/job?id=" + job.id, { cookie })).data;
  return {
    ...f,
    cookie,
    post,
    rag: rag.data.id,
    soap: soap.data.id,
    assign,
    booking: booking.data,
    job,
    view,
  };
}
test("service consumables stay private and frozen; rags apply to chosen services and soap only its own service", async () => {
  const f = await fixture();
  try {
    let j = await f.view();
    assert.equal(j.plannedConsumables.length, 1);
    assert.equal(j.plannedConsumables[0].product, "Rags");
    assert.equal(j.plannedConsumables[0].quantityMillis, 2000);
    const catalog = await call(f.mf, "/api/catalog");
    assert(!JSON.stringify(catalog.data).includes("consumables"));
    assert(!JSON.stringify(f.booking.snapshot).includes("consumables"));
    await f.assign("dustoff", [{ materialId: f.rag, quantityMillis: 4000 }]);
    j = await f.view();
    assert.equal(j.plannedConsumables[0].quantityMillis, 2000);
    const saved = await call(f.mf, "/api/owner/job", {
      method: "PUT",
      cookie: f.cookie,
      body: {
        id: f.job.id,
        version: 1,
        data: {
          lines: [
            {
              description: "Wash",
              serviceId: "route66",
              unit: "service",
              quantityMillis: 1000,
              unitPriceCents: 10000,
              unitCostCents: 0,
              taxable: false,
            },
          ],
        },
      },
    });
    assert.equal(saved.status, 200);
    j = await f.view();
    assert.equal(j.plannedConsumables.length, 2);
    assert.equal(
      j.plannedConsumables.find((p) => p.product === "Rags").quantityMillis,
      5000,
    );
    assert.equal(
      j.plannedConsumables.find((p) => p.product === "Soap").quantityMillis,
      8000,
    );
    const current = (
      await call(f.mf, "/api/owner/materials", { cookie: f.cookie })
    ).data.records.find((r) => r.id === f.rag);
    assert.equal(
      (
        await f.post(
          "/api/owner/material-purchase",
          {
            kind: "convert",
            confirmed: true,
            materialId: f.rag,
            materialVersion: current.version,
            stockVersion: current.stock_version,
            product: {
              product: "Rags",
              unit: "oz",
              quantityMillis: 1000,
              costCents: 0,
              purchaseUnit: "bottle",
              purchaseSizeMillis: 10000,
              purchaseCostCents: 250,
              markupBps: 3000,
              taxable: false,
            },
          },
          "unsafe-conversion",
        )
      ).status,
      409,
    );
  } finally {
    await f.mf.dispose();
  }
});
test("actual consumables deduct once, affect profit, and do not increase invoice unless explicitly charged", async () => {
  const f = await fixture();
  try {
    await f.post("/api/owner/transition", {
      id: f.booking.id,
      version: 2,
      action: "start",
    });
    let j = await f.view(),
      p = j.plannedConsumables[0];
    assert.equal(
      (
        await f.post("/api/owner/transition", {
          id: f.booking.id,
          version: 3,
          action: "complete",
        })
      ).status,
      409,
    );
    const usage = {
      kind: "usage",
      planned: true,
      jobId: f.job.id,
      materialId: f.rag,
      version: p.stockVersion,
      quantityMillis: 2000,
      reason: "Rags used",
    };
    const u = await f.post("/api/owner/inventory", usage, "first");
    assert.equal(u.status, 201, JSON.stringify(u.data));
    assert.equal(
      (await f.post("/api/owner/inventory", usage, "different-retry-key")).data
        .duplicate,
      true,
    );
    assert.equal(
      (
        await f.post(
          "/api/owner/inventory",
          { ...usage, quantityMillis: 3000 },
          "changed",
        )
      ).status,
      409,
    );
    j = await f.view();
    assert.equal(j.plannedConsumables[0].recorded, true);
    assert.equal(j.materials[0].cost_cents, 50);
    assert.equal(JSON.parse(j.materials[0].data).billSeparately, false);
    const quote = (
      await call(f.mf, "/api/owner/job-completion?booking=" + f.booking.id, {
        cookie: f.cookie,
      })
    ).data.quote;
    assert.equal(quote.subtotalCents, 10000);
    assert.equal(quote.lines.length, 1);
    const checkout = await f.post(
      "/api/owner/job-completion",
      {
        bookingId: f.booking.id,
        bookingVersion: 3,
        jobVersion: 1,
        invoiceVersion: null,
        unpaid: true,
        amountCents: 0,
        tipCents: 0,
        method: null,
        occurredAt: new Date().toISOString(),
        discountCents: 0,
        taxBps: 0,
      },
      "included-checkout",
    );
    assert.equal(checkout.status, 200, JSON.stringify(checkout.data));
    const doc = await f.db
      .prepare("SELECT data FROM financial_documents")
      .first();
    assert.deepEqual(JSON.parse(doc.data).consumables, []);
    assert.equal(JSON.parse(doc.data).totalCents, 10000);
    assert.equal(JSON.parse(doc.data).jobCostCents, 50);
    const report = (
      await call(
        f.mf,
        "/api/owner/finance/report?from=" +
          new Date(Date.now() - 86400000).toISOString() +
          "&to=" +
          new Date(Date.now() + 86400000).toISOString(),
        { cookie: f.cookie },
      )
    ).data;
    assert.equal(report.consumablesUsedCents, 50);
    assert.equal(report.includedConsumablesUsedCents, 50);
    assert.equal(report.separatelyBilledConsumablesUsedCents, 0);
    assert.equal(report.jobProfitCents, 9950);
    assert.equal(report.jobProfitability[0].consumablesCostCents, 50);
    assert.equal(report.receiptsCents, 0);
    assert.equal(report.expenseCents, 0);
    assert.equal(report.cashFlowCents, 0);

    assert.equal(
      (
        await call(f.mf, "/api/owner/materials", { cookie: f.cookie })
      ).data.records.find((r) => r.id === f.rag).low_stock,
      true,
    );
  } finally {
    await f.mf.dispose();
  }
});
test("zero actual use and insufficient stock are safe; separate billing requires explicit choice", async () => {
  const f = await fixture();
  try {
    let j = await f.view(),
      p = j.plannedConsumables[0];
    assert.equal(
      (
        await f.post(
          "/api/owner/inventory",
          {
            kind: "usage",
            planned: true,
            jobId: f.job.id,
            materialId: f.rag,
            version: p.stockVersion,
            quantityMillis: 11000,
            reason: "Too much",
          },
          "too-many",
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await f.post(
          "/api/owner/inventory",
          {
            kind: "usage",
            planned: true,
            jobId: f.job.id,
            materialId: f.rag,
            version: p.stockVersion,
            quantityMillis: 0,
            reason: "Not used",
          },
          "not-used",
        )
      ).status,
      201,
    );
    j = await f.view();
    assert.equal(j.plannedConsumables[0].recorded, true);
    assert.equal(j.plannedConsumables[0].actualQuantityMillis, 0);
    const soap = (
      await call(f.mf, "/api/owner/materials", { cookie: f.cookie })
    ).data.records.find((r) => r.id === f.soap);
    assert.equal(
      (
        await f.post(
          "/api/owner/inventory",
          {
            kind: "usage",
            jobId: f.job.id,
            materialId: f.soap,
            version: soap.stock_version,
            quantityMillis: 8000,
            billSeparately: true,
            reason: "Owner approved separate material charge",
          },
          "separate",
        )
      ).status,
      201,
    );
    const quote = (
      await call(f.mf, "/api/owner/job-completion?booking=" + f.booking.id, {
        cookie: f.cookie,
      })
    ).data.quote;
    assert.equal(quote.subtotalCents, 10268);
    assert.equal(quote.lines[1].totalCents, 268);
  } finally {
    await f.mf.dispose();
  }
});

test("invoice chemical disclosure is opt-in, scoped, amount-free and frozen without changing profit or stock", async () => {
  const f = await fixture();
  try {
    const p = (await f.view()).plannedConsumables[0];
    const u = await f.post(
      "/api/owner/inventory",
      {
        kind: "usage",
        planned: true,
        jobId: f.job.id,
        materialId: f.rag,
        version: p.stockVersion,
        quantityMillis: 2000,
        reason: "Actual use",
      },
      "disclosure-use",
    );
    assert.equal(u.status, 201);
    let j = await f.view();
    assert.equal(j.plannedConsumables[0].includeOnInvoice, false);
    const update = (body, cookie = f.cookie) =>
      call(f.mf, "/api/owner/consumable-visibility", {
        method: "PUT",
        cookie,
        body,
      });
    const body = {
      id: u.data.id,
      expectedVisibility: false,
      includeOnInvoice: true,
    };
    assert.equal((await update(body, "")).status, 401);
    await seed(f.db, "other", "localhost:4335");
    const other = await login(f.mf, "http://localhost:4335");
    assert.equal(
      (
        await call(f.mf, "/api/owner/consumable-visibility", {
          host: "http://localhost:4335",
          cookie: other,
          method: "PUT",
          body,
        })
      ).status,
      404,
    );
    assert.equal(
      (await update({ ...body, includeOnInvoice: "yes" })).status,
      400,
    );
    assert.equal((await update(body)).status, 200);
    assert.equal((await update(body)).status, 409);
    j = await f.view();
    assert.equal(j.plannedConsumables[0].includeOnInvoice, true);
    assert.equal(j.plannedConsumables[0].availableQuantityMillis, 8000);
    await f.post("/api/owner/transition", {
      id: f.booking.id,
      version: 2,
      action: "start",
    });
    const result = await f.post(
      "/api/owner/job-completion",
      {
        bookingId: f.booking.id,
        bookingVersion: 3,
        jobVersion: 1,
        invoiceVersion: null,
        unpaid: true,
        amountCents: 0,
        tipCents: 0,
        method: null,
        occurredAt: new Date().toISOString(),
        discountCents: 0,
        taxBps: 0,
      },
      "disclosure-checkout",
    );
    assert.equal(result.status, 200, JSON.stringify(result.data));
    const doc = JSON.parse(
      (
        await f.db
          .prepare("SELECT data FROM financial_documents WHERE business_id=?")
          .bind("baucom")
          .first()
      ).data,
    );
    assert.deepEqual(doc.consumables, [
      { product: "Rags", unit: "piece", quantityMillis: 2000 },
    ]);
    assert.equal(doc.totalCents, 10000);
    assert.equal(doc.jobCostCents, 50);
    assert.equal(
      (
        await update({
          id: u.data.id,
          expectedVisibility: true,
          includeOnInvoice: false,
        })
      ).status,
      409,
    );
    assert.deepEqual(
      JSON.parse(
        (
          await f.db
            .prepare("SELECT data FROM financial_documents WHERE business_id=?")
            .bind("baucom")
            .first()
        ).data,
      ).consumables,
      doc.consumables,
    );
  } finally {
    await f.mf.dispose();
  }
});

test("an invoice issued before completion also freezes consumable disclosure", async () => {
  const f = await fixture();
  try {
    const p = (await f.view()).plannedConsumables[0];
    const u = await f.post(
      "/api/owner/inventory",
      {
        kind: "usage",
        planned: true,
        jobId: f.job.id,
        materialId: f.rag,
        version: p.stockVersion,
        quantityMillis: 1000,
        reason: "Actual use",
      },
      "preissued-use",
    );
    assert.equal(u.status, 201);
    const d = await f.post(
      "/api/owner/documents",
      {
        kind: "invoice",
        customerId: f.job.customer_id,
        bookingId: f.booking.id,
        lines: [
          {
            description: "Service",
            unit: "service",
            quantityMillis: 1000,
            unitPriceCents: 10000,
            unitCostCents: 0,
            taxable: false,
          },
        ],
        taxBps: 0,
      },
      "preissued-draft",
    );
    assert.equal(d.status, 201, JSON.stringify(d.data));
    assert.equal(
      (
        await f.post(
          "/api/owner/documents/issue",
          { id: d.data.id, version: d.data.version },
          "preissued-issue",
        )
      ).status,
      200,
    );
    const changed = await call(f.mf, "/api/owner/consumable-visibility", {
      method: "PUT",
      cookie: f.cookie,
      body: {
        id: u.data.id,
        expectedVisibility: false,
        includeOnInvoice: true,
      },
    });
    assert.equal(changed.status, 409);
    assert.equal(
      (await f.view()).plannedConsumables[0].includeOnInvoice,
      false,
    );
  } finally {
    await f.mf.dispose();
  }
});
