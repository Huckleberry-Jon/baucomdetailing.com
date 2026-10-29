import { jobView, jobInvoiceLines } from "./operations.js";
import { randomUUID } from "node:crypto";
import { requireThat, text, hash } from "../src/security.js";
const integer = (v, name, max = 100000000) => {
  requireThat(Number.isSafeInteger(v) && v >= 0 && v <= max, "Invalid " + name);
  return v;
};
const round = (n, d) => Number((n + BigInt(d) / 2n) / BigInt(d));
export function material(input) {
  const d = {
    product: text(input.product, "Product", 150),
    unit: input.unit,
    quantityMillis: integer(input.quantityMillis, "quantity", 1000000),
    costCents: integer(input.costCents, "unit cost"),
    markupBps: integer(input.markupBps, "markup", 100000),
    taxable: input.taxable,
  };
  requireThat(
    ["oz", "gallon", "bottle", "piece"].includes(d.unit) &&
      typeof d.taxable === "boolean" &&
      d.quantityMillis > 0,
    "Invalid material unit, tax or quantity",
  );
  d.unitPriceCents = round(
    BigInt(d.costCents) * BigInt(10000 + d.markupBps),
    10000,
  );
  d.sellingCents = round(
    BigInt(d.unitPriceCents) * BigInt(d.quantityMillis),
    1000,
  );
  return d;
}
export function priceDocument(body) {
  requireThat(
    Array.isArray(body.lines) &&
      body.lines.length > 0 &&
      body.lines.length <= 100,
    "Use 1–100 document lines",
  );
  const lines = body.lines.map((l) => {
    const line = {
      description: text(l.description, "Description", 250),
      unit: l.unit,
      quantityMillis: integer(l.quantityMillis, "quantity", 1000000),
      unitPriceCents: integer(l.unitPriceCents, "unit price"),
      unitCostCents: integer(l.unitCostCents, "unit cost"),
      taxable: l.taxable,
    };
    requireThat(
      ["service", "each", "hour", "oz", "gallon", "bottle", "piece"].includes(
        line.unit,
      ) &&
        line.quantityMillis > 0 &&
        typeof line.taxable === "boolean",
      "Invalid line unit, quantity or tax",
    );
    line.totalCents = round(
      BigInt(line.quantityMillis) * BigInt(line.unitPriceCents),
      1000,
    );
    line.costCents = round(
      BigInt(line.quantityMillis) * BigInt(line.unitCostCents),
      1000,
    );
    return line;
  });
  const taxBps = integer(body.taxBps, "tax rate", 10000),
    subtotalCents = lines.reduce((n, l) => n + l.totalCents, 0),
    discountCents = integer(body.discountCents ?? 0, "discount"),
    taxableSubtotal = lines
      .filter((l) => l.taxable)
      .reduce((n, l) => n + l.totalCents, 0);
  requireThat(discountCents <= subtotalCents, "Discount exceeds subtotal");
  const taxableDiscount = subtotalCents
      ? round(BigInt(discountCents) * BigInt(taxableSubtotal), subtotalCents)
      : 0,
    taxCents = round(
      BigInt(taxableSubtotal - taxableDiscount) * BigInt(taxBps),
      10000,
    );
  integer(subtotalCents + taxCents, "document total", 1000000000);
  return {
    currency: "USD",
    lines,
    taxBps,
    subtotalCents,
    taxCents,
    discountCents,
    totalCents: subtotalCents - discountCents + taxCents,
    materialCostCents: lines.reduce((n, l) => n + l.costCents, 0),
    notes: typeof body.notes === "string" ? body.notes.slice(0, 3000) : "",
  };
}
export async function saveMaterial(s, body, owner) {
  const value = material(body.data ?? body);
  return s.atomic(async (b, c) => {
    const old = body.id
      ? await s.first(
          "SELECT * FROM materials WHERE business_id=? AND id=?",
          s.tenant,
          body.id,
        )
      : null;
    requireThat(!body.id || old, "Material not found", 404);
    requireThat(
      !old || old.version === body.version,
      "Material changed; refresh",
      409,
    );
    requireThat(
      !old || JSON.parse(old.data).unit === value.unit,
      "Create a separate product to change its stock unit",
      409,
    );
    const id = old?.id ?? randomUUID();
    c.push(
      old
        ? s.command(
            "UPDATE materials SET data=?,version=version+1 WHERE business_id=? AND id=?",
            JSON.stringify(value),
            s.tenant,
            id,
          )
        : s.command(
            "INSERT INTO materials VALUES(?,?,1,?)",
            id,
            s.tenant,
            JSON.stringify(value),
          ),
    );
    s.audit(c, owner, "material.saved", id);
    return { id, version: (old?.version ?? 0) + 1, data: value };
  });
}
export async function saveDocument(s, body, owner) {
  return s.atomic(async (b, c) => {
    const old = body.id
      ? await s.first(
          "SELECT * FROM financial_documents WHERE business_id=? AND id=?",
          s.tenant,
          body.id,
        )
      : null;
    requireThat(!body.id || old, "Document not found", 404);
    requireThat(
      !old || old.version === body.version,
      "Document changed; refresh",
      409,
    );
    requireThat(
      !old || old.status === "draft",
      "Issued documents are immutable",
      409,
    );
    requireThat(
      ["estimate", "invoice"].includes(body.kind),
      "Invalid document kind",
    );
    if (old && JSON.parse(old.data).jobId)
      requireThat(
        body.bookingId === old.booking_id &&
          body.customerId === old.customer_id &&
          body.kind === "invoice",
        "Job invoice association cannot change",
      );
    const customer = await s.first(
      "SELECT * FROM customers WHERE business_id=? AND id=?",
      s.tenant,
      body.customerId,
    );
    requireThat(customer, "Customer not found", 404);
    if (body.bookingId) {
      const booking = await s.first(
        "SELECT * FROM bookings WHERE business_id=? AND id=?",
        s.tenant,
        body.bookingId,
      );
      requireThat(
        booking && booking.customer_id === customer.id,
        "Booking/customer mismatch",
        400,
      );
    }
    let job = null;
    if (body.jobId) {
      job = await jobView(s, body.jobId);
      requireThat(
        job.status === "completed" && job.version === body.jobVersion,
        "Complete the job and refresh before invoicing",
        409,
      );
      requireThat(
        body.kind === "invoice" &&
          body.customerId === job.customer_id &&
          body.bookingId === job.booking_id,
        "Job invoice mismatch",
      );
      const duplicate = await s.first(
        "SELECT id FROM financial_documents WHERE business_id=? AND booking_id=? AND kind='invoice' AND id!=?",
        s.tenant,
        job.booking_id,
        old?.id ?? "",
      );
      requireThat(!duplicate, "An invoice already exists for this job", 409);
      body = { ...body, lines: jobInvoiceLines(job) };
    }
    const data = priceDocument(body),
      id = old?.id ?? randomUUID();
    if (!job && old) {
      const prior = JSON.parse(old.data);
      if (prior.jobId) {
        data.jobId = prior.jobId;
        data.jobCostCents = prior.jobCostCents;
      }
    }
    if (job) {
      data.jobId = job.id;
      data.jobCostCents =
        job.data.lines.reduce((n, l) => n + l.costCents, 0) +
        job.materials.reduce((n, m) => n + m.cost_cents, 0) +
        (job.data.laborCostCents ?? 0) +
        (job.data.travelCostCents ?? 0);
    }
    data.customer = JSON.parse(customer.data);
    data.businessName = JSON.parse(b.settings).name;
    const photos = body.photoIds ?? [];
    requireThat(
      Array.isArray(photos) && photos.length <= 24,
      "Invalid invoice photos",
    );
    data.photoIds = [];
    for (const photo of new Set(photos)) {
      const row = await s.first(
        "SELECT * FROM media WHERE business_id=? AND id=?",
        s.tenant,
        photo,
      );
      requireThat(
        row &&
          body.bookingId &&
          row.booking_id === body.bookingId &&
          row.include_on_invoice === 1,
        "Photo not selected for this job invoice",
      );
      data.photoIds.push(row.id);
    }
    data.reviewUrl = JSON.parse(b.settings).googleReviewUrl ?? null;
    if (old)
      c.push(
        s.command(
          "UPDATE financial_documents SET customer_id=?,booking_id=?,kind=?,data=?,version=version+1 WHERE business_id=? AND id=?",
          customer.id,
          body.bookingId ?? null,
          body.kind,
          JSON.stringify(data),
          s.tenant,
          id,
        ),
      );
    else
      c.push(
        s.command(
          "INSERT INTO financial_documents(id,business_id,customer_id,booking_id,kind,status,data,created_at) VALUES(?,?,?,?,?,'draft',?,?)",
          id,
          s.tenant,
          customer.id,
          body.bookingId ?? null,
          body.kind,
          JSON.stringify(data),
          Date.now(),
        ),
      );
    s.audit(c, owner, "document.saved", id);
    return { id, version: (old?.version ?? 0) + 1, data };
  });
}
export async function issueDocument(s, body, owner) {
  return s.atomic(async (b, c) => {
    const row = await s.first(
      "SELECT * FROM financial_documents WHERE business_id=? AND id=?",
      s.tenant,
      body.id,
    );
    requireThat(row, "Document not found", 404);
    requireThat(
      row.version === body.version && row.status === "draft",
      "Document changed or already issued",
      409,
    );
    const number =
      (row.kind === "invoice" ? "INV" : "EST") +
      "-" +
      new Date().getUTCFullYear() +
      "-" +
      String(b.revision + 1).padStart(6, "0");
    c.push(
      s.command(
        "UPDATE financial_documents SET status='issued',number=?,version=version+1 WHERE business_id=? AND id=?",
        number,
        s.tenant,
        row.id,
      ),
    );
    s.audit(c, owner, "document.issued", row.id);
    return { id: row.id, number, version: row.version + 1 };
  });
}
export async function recordEvent(s, body, owner, key) {
  text(key, "Idempotency key", 150);
  const digest = hash(JSON.stringify(body));
  return s.atomic(async (b, c) => {
    const previous = await s.first(
      "SELECT * FROM financial_events WHERE business_id=? AND idempotency_key=?",
      s.tenant,
      key,
    );
    if (previous) {
      requireThat(
        previous.request_hash === digest,
        "Payment key reused for a different record",
        409,
      );
      return { id: previous.id, duplicate: true };
    }
    requireThat(["payment", "expense"].includes(body.kind), "Invalid event");
    const amount = integer(body.amountCents, "amount"),
      tip = integer(body.tipCents ?? 0, "tip");
    requireThat(amount > 0, "Amount must be positive");
    const at = Date.parse(body.occurredAt);
    requireThat(
      Number.isFinite(at) &&
        at <= Date.now() + 60000 &&
        at >= Date.UTC(2000, 0, 1),
      "Invalid received/expense time",
    );
    requireThat(
      ["cash", "check", "bank", "external_card_reference"].includes(
        body.method,
      ),
      "Choose an external payment method",
    );
    let tax = 0,
      documentId = null,
      paidBookingId = null;
    if (body.kind === "payment") {
      const row = await s.first(
        "SELECT * FROM financial_documents WHERE business_id=? AND id=? AND kind='invoice' AND status='issued'",
        s.tenant,
        body.documentId,
      );
      requireThat(row, "Issued invoice not found", 404);
      const d = JSON.parse(row.data),
        paid = await s.first(
          "SELECT coalesce(sum(amount_cents),0) amount,coalesce(sum(tax_cents),0) tax FROM financial_events WHERE business_id=? AND document_id=? AND kind='payment'",
          s.tenant,
          row.id,
        );
      requireThat(
        paid.amount + amount <= d.totalCents,
        "Payment exceeds invoice balance",
        409,
      );
      // Allocate tax proportionately; final payment closes rounding remainder.
      tax =
        paid.amount + amount === d.totalCents
          ? d.taxCents - paid.tax
          : round(BigInt(amount) * BigInt(d.taxCents), d.totalCents);
      tax = Math.min(tax, d.taxCents - paid.tax);
      documentId = row.id;
      paidBookingId = row.booking_id;
    } else
      requireThat(
        tip === 0 && !body.documentId,
        "Expenses cannot contain tips or an invoice",
      );
    const category = body.kind === "expense" ? body.category : "receipt";
    requireThat(
      ["receipt", "materials", "operating", "tax_remittance", "other"].includes(
        category,
      ),
      "Invalid category",
    );
    const data = {
      method: body.method,
      category,
      note: typeof body.note === "string" ? body.note.slice(0, 500) : "",
    };
    const id = randomUUID();
    c.push(
      s.command(
        "INSERT INTO financial_events VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        id,
        s.tenant,
        documentId,
        body.kind,
        amount,
        tip,
        tax,
        at,
        JSON.stringify(data),
        key,
        digest,
      ),
    );
    if (paidBookingId)
      s.event(c, paidBookingId, "payment.recorded", "owner", {
        paymentId: id,
        amountCents: amount,
      });
    s.audit(c, owner, "finance." + body.kind + ".recorded", id);
    return { id, duplicate: false };
  });
}
export async function report(s, from, to) {
  const a = Date.parse(from),
    z = Date.parse(to);
  requireThat(
    Number.isFinite(a) &&
      Number.isFinite(z) &&
      z > a &&
      z - a <= 370 * 86400000,
    "Use a report period up to 370 days",
  );
  const rows = await s.all(
    "SELECT * FROM financial_events WHERE business_id=? AND occurred_at>=? AND occurred_at<? ORDER BY occurred_at,id",
    s.tenant,
    a,
    z,
  );
  const payments = rows.filter((r) => r.kind === "payment"),
    expenses = rows.filter((r) => r.kind === "expense");
  const sum = (arr, k) => arr.reduce((n, r) => n + r[k], 0),
    receiptsCents = sum(payments, "amount_cents"),
    tipsCents = sum(payments, "tip_cents"),
    salesTaxCollectedCents = sum(payments, "tax_cents"),
    expenseCents = sum(expenses, "amount_cents");
  const materialsPurchasedCents = expenses
    .filter((r) => JSON.parse(r.data).category === "materials")
    .reduce((n, r) => n + r.amount_cents, 0);
  const taxRemittedCents = expenses
    .filter((r) => JSON.parse(r.data).category === "tax_remittance")
    .reduce((n, r) => n + r.amount_cents, 0);
  const invoices = await s.all(
    "SELECT d.*,coalesce((SELECT sum(amount_cents) FROM financial_events e WHERE e.business_id=d.business_id AND e.document_id=d.id AND e.kind='payment'),0) paid_cents FROM financial_documents d WHERE d.business_id=? AND d.kind='invoice' AND d.status='issued'",
    s.tenant,
  );
  const outstandingCents = invoices.reduce(
    (n, r) => n + JSON.parse(r.data).totalCents - r.paid_cents,
    0,
  );
  const jobProfitability = invoices
    .filter(
      (r) => r.created_at >= a && r.created_at < z && JSON.parse(r.data).jobId,
    )
    .map((r) => {
      const d = JSON.parse(r.data);
      return {
        invoiceId: r.id,
        jobId: d.jobId,
        number: r.number,
        revenueExcludingTaxCents: d.totalCents - d.taxCents,
        costCents: d.jobCostCents,
        profitCents: d.totalCents - d.taxCents - d.jobCostCents,
      };
    });
  return {
    outstandingCents,
    jobProfitability,
    from: new Date(a).toISOString(),
    to: new Date(z).toISOString(),
    currency: "USD",
    basis:
      "Cash received and expenses recorded in this period; inventory purchases are expenses. Invoice line costs are estimates, not a second expense.",
    receiptsCents,
    tipsCents,
    salesTaxCollectedCents,
    taxRemittedCents,
    materialsPurchasedCents,
    expenseCents,
    incomeExcludingTaxCents: receiptsCents - salesTaxCollectedCents,
    estimatedProfitCents:
      receiptsCents -
      salesTaxCollectedCents +
      tipsCents -
      (expenseCents - taxRemittedCents),
    cashFlowCents: receiptsCents + tipsCents - expenseCents,
    events: rows,
  };
}
