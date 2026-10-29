import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { runtime, seed, login, call, input } from "./helpers.mjs";
import { priceDocument } from "../cloudflare/finance.js";
test("discounts proportionately reduce taxable basis and reject invalid amounts", () => {
  const line = {
    description: "Service",
    unit: "service",
    quantityMillis: 1000,
    unitPriceCents: 10000,
    unitCostCents: 2000,
    taxable: true,
  };
  const p = priceDocument({
    lines: [line, { ...line, taxable: false }],
    discountCents: 2000,
    taxBps: 825,
  });
  assert.equal(p.taxCents, 743);
  assert.equal(p.totalCents, 18743);
  assert.throws(() =>
    priceDocument({ lines: [line], discountCents: 10001, taxBps: 0 }),
  );
});
test("actual D1 job, stock, invoice, payment and profitability workflow is transactional and isolated", async () => {
  const f = await runtime();
  try {
    await seed(f.db);
    await seed(f.db, "second", "localhost:4336");
    const cookie = await login(f.mf),
      other = await login(f.mf, "http://localhost:4336");
    const post = (path, body, key = randomUUID()) =>
      call(f.mf, path, { method: "POST", cookie, body, key });
    const booking = await post("/api/bookings", input());
    assert.equal(booking.status, 201);
    const b = booking.data;
    const confirm = await post("/api/owner/transition", {
      id: b.id,
      version: 1,
      action: "confirm",
      durationMinutes: 90,
    });
    assert.equal(confirm.status, 200);
    const job = (await call(f.mf, "/api/owner/jobs", { cookie })).data
      .records[0];
    assert(job.id);
    const material = await post("/api/owner/materials", {
      product: "Cleaner",
      unit: "piece",
      quantityMillis: 1000,
      costCents: 333,
      markupBps: 5000,
      taxable: true,
    });
    assert.equal(material.status, 201);
    const correction = {
      materialId: material.data.id,
      kind: "correction",
      version: 0,
      availableQuantityMillis: 1500,
      reason: "Initial counted stock",
    };
    assert.equal(
      (await post("/api/owner/inventory", correction, "stock-one")).status,
      201,
    );
    assert.equal(
      (await post("/api/owner/inventory", correction, "stock-one")).data
        .duplicate,
      true,
    );
    const usage = {
      materialId: material.data.id,
      jobId: job.id,
      kind: "usage",
      version: 1,
      quantityMillis: 1000,
      reason: "Confirmed use on job",
    };
    const competing = await Promise.all([
      post("/api/owner/inventory", usage),
      post("/api/owner/inventory", usage),
    ]);
    assert.deepEqual(competing.map((x) => x.status).sort(), [201, 409]);
    const stocks = (await call(f.mf, "/api/owner/materials", { cookie })).data
      .records;
    assert.equal(stocks[0].available_quantity_millis, 500);
    const foreign = await call(f.mf, "/api/owner/job?id=" + job.id, {
      cookie: other,
      host: "http://localhost:4336",
    });
    assert.equal(foreign.status, 404);
    const line = {
      description: "Approved detailing",
      unit: "service",
      quantityMillis: 1000,
      unitPriceCents: 10000,
      unitCostCents: 0,
      taxable: true,
    };
    const saved = await call(f.mf, "/api/owner/job", {
      method: "PUT",
      cookie,
      body: {
        id: job.id,
        version: 0,
        data: {
          lines: [
            line,
            {
              ...line,
              description: "Travel",
              unitPriceCents: 1000,
              taxable: false,
            },
          ],
          laborCostCents: 2500,
          travelCostCents: 500,
          laborMinutes: 90,
        },
      },
    });
    assert.equal(saved.status, 200);
    assert.equal(
      (
        await post("/api/owner/documents", {
          kind: "invoice",
          jobId: job.id,
          jobVersion: 1,
          bookingId: b.id,
          customerId: job.customer_id,
          taxBps: 825,
        })
      ).status,
      409,
    );
    await post("/api/owner/transition", {
      id: b.id,
      version: 2,
      action: "start",
    });
    await post("/api/owner/transition", {
      id: b.id,
      version: 3,
      action: "complete",
    });
    assert.equal(
      (await post("/api/owner/inventory", { ...usage, version: 2 })).status,
      409,
    );
    const invoiceBody = {
      kind: "invoice",
      jobId: job.id,
      jobVersion: 1,
      bookingId: b.id,
      customerId: job.customer_id,
      taxBps: 825,
      discountCents: 1000,
      lines: [{ ...line, unitPriceCents: 1 }],
    };
    const invoice = await post("/api/owner/documents", invoiceBody);
    assert.equal(invoice.status, 201, JSON.stringify(invoice.data));
    assert.equal(invoice.data.data.lines.length, 3);
    assert.equal(invoice.data.data.jobCostCents, 3333);
    assert.equal(invoice.data.data.lines[0].unitPriceCents, 10000);
    assert.equal((await post("/api/owner/documents", invoiceBody)).status, 409);
    await post("/api/owner/documents/issue", {
      id: invoice.data.id,
      version: 1,
    });
    const pay = {
      kind: "payment",
      documentId: invoice.data.id,
      amountCents: 3000,
      tipCents: 200,
      method: "cash",
      occurredAt: new Date().toISOString(),
    };
    const paid = await post("/api/owner/finance/events", pay, "deposit-once");
    assert.equal(paid.status, 201, JSON.stringify(paid.data));
    assert.equal(
      (await post("/api/owner/finance/events", pay, "deposit-once")).data
        .duplicate,
      true,
    );
    const receipt = await call(
      f.mf,
      "/api/owner/document?id=" + invoice.data.id,
      { cookie },
    );
    assert.equal(receipt.data.paid_cents, 3000);
    assert.equal(receipt.data.payments.length, 1);
    assert.equal(
      (
        await f.db
          .prepare(
            "SELECT count(*) n FROM notifications WHERE event LIKE 'payment.recorded:%'",
          )
          .first()
      ).n,
      1,
    );
    const report = await call(
      f.mf,
      "/api/owner/finance/report?from=2026-01-01&to=2027-01-01",
      { cookie },
    );
    assert.equal(report.data.receiptsCents, 3000);
    assert.equal(report.data.tipsCents, 200);
    assert.equal(
      report.data.outstandingCents,
      invoice.data.data.totalCents - 3000,
    );
    assert.equal(report.data.jobProfitability[0].costCents, 3333);
    const customer = await call(
      f.mf,
      "/api/owner/customer?id=" + job.customer_id,
      { cookie },
    );
    assert.equal(customer.data.bookings.length, 1);
    const vehicle = JSON.parse(customer.data.vehicles[0].data);
    assert.equal(
      (
        await post("/api/owner/vehicles", {
          customerId: job.customer_id,
          data: { ...vehicle, model: "Second vehicle" },
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await call(f.mf, "/api/owner/customer?id=" + job.customer_id, {
          cookie,
        })
      ).data.vehicles.length,
      2,
    );
  } finally {
    await f.mf.dispose();
  }
});
