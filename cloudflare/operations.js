import { randomUUID } from "node:crypto";
import { requireThat, text, hash } from "../src/security.js";
import { priceDocument } from "./finance.js";
const qty = (n, name = "quantity") => {
  requireThat(
    Number.isSafeInteger(n) && n >= 0 && n <= 1000000000,
    "Invalid " + name,
  );
  return n;
};
export async function jobView(s, id) {
  const job = await s.first(
    "SELECT j.*,b.status,b.version booking_version,b.start_ms,b.data booking_data,b.snapshot,c.data customer,v.data vehicle,d.version,d.data FROM jobs j JOIN bookings b ON b.id=j.booking_id AND b.business_id=j.business_id JOIN customers c ON c.id=j.customer_id AND c.business_id=j.business_id JOIN vehicles v ON v.id=j.vehicle_id AND v.business_id=j.business_id LEFT JOIN job_details d ON d.job_id=j.id AND d.business_id=j.business_id WHERE j.business_id=? AND j.id=?",
    s.tenant,
    id,
  );
  requireThat(job, "Job not found", 404);
  const materials = await s.all(
    "SELECT * FROM inventory_movements WHERE business_id=? AND job_id=? ORDER BY created_at,id",
    s.tenant,
    id,
  );
  return {
    ...job,
    version: job.version ?? 0,
    data: JSON.parse(job.data ?? "{}"),
    materials,
  };
}
export async function saveJob(s, body, owner) {
  return s.atomic(async (b, c) => {
    const job = await jobView(s, body.id);
    requireThat(job.version === body.version, "Job changed; refresh", 409);
    requireThat(
      ["confirmed", "rescheduled", "in_progress"].includes(job.status),
      "Completed or cancelled jobs cannot be edited",
      409,
    );
    const d = body.data ?? {};
    const priced = priceDocument({ lines: d.lines, taxBps: 0 });
    const data = {
      lines: priced.lines,
      notes: typeof d.notes === "string" ? d.notes.slice(0, 3000) : "",
      laborMinutes: qty(d.laborMinutes ?? 0, "labor minutes"),
      laborCostCents: qty(d.laborCostCents ?? 0, "labor cost"),
      travelCostCents: qty(d.travelCostCents ?? 0, "travel cost"),
    };
    c.push(
      s.command(
        "INSERT INTO job_details VALUES(?,?,1,?) ON CONFLICT(job_id) DO UPDATE SET version=version+1,data=excluded.data",
        job.id,
        s.tenant,
        JSON.stringify(data),
      ),
    );
    s.audit(c, owner, "job.saved", job.id);
    return { id: job.id, version: job.version + 1, data };
  });
}
export async function stockMovement(s, body, owner, key) {
  text(key, "Idempotency key", 150);
  const digest = hash(JSON.stringify(body));
  return s.atomic(async (b, c) => {
    const prior = await s.first(
      "SELECT * FROM inventory_movements WHERE business_id=? AND idempotency_key=?",
      s.tenant,
      key,
    );
    if (prior) {
      requireThat(
        prior.request_hash === digest,
        "Stock key reused for different request",
        409,
      );
      return { id: prior.id, duplicate: true };
    }
    const product = await s.first(
      "SELECT * FROM materials WHERE business_id=? AND id=?",
      s.tenant,
      body.materialId,
    );
    requireThat(product, "Material not found", 404);
    const balance = await s.first(
      "SELECT * FROM inventory_balances WHERE business_id=? AND material_id=?",
      s.tenant,
      product.id,
    );
    const available = balance?.quantity_millis ?? 0;
    requireThat(
      (balance?.version ?? 0) === body.version,
      "Stock changed; refresh",
      409,
    );
    let delta,
      job = null,
      cost = 0;
    const material = JSON.parse(product.data);
    if (body.kind === "usage") {
      job = await jobView(s, body.jobId);
      requireThat(
        ["confirmed", "rescheduled", "in_progress"].includes(job.status),
        "Job is not open for material use",
        409,
      );
      delta = -qty(body.quantityMillis);
      requireThat(delta < 0, "Usage must be positive");
      cost = Number(
        (BigInt(-delta) * BigInt(material.costCents) + 500n) / 1000n,
      );
    } else {
      requireThat(body.kind === "correction", "Invalid stock movement");
      delta = qty(body.availableQuantityMillis) - available;
    }
    requireThat(available + delta >= 0, "Insufficient stock", 409);
    const reason = text(body.reason, "Stock note", 500),
      id = randomUUID();
    c.push(
      s.command(
        "INSERT INTO inventory_balances VALUES(?,?,?,1) ON CONFLICT(material_id) DO UPDATE SET quantity_millis=excluded.quantity_millis,version=version+1",
        product.id,
        s.tenant,
        available + delta,
      ),
    );
    c.push(
      s.command(
        "INSERT INTO inventory_movements VALUES(?,?,?,?,?,?,?,?,?,?)",
        id,
        s.tenant,
        product.id,
        job?.id ?? null,
        delta,
        cost,
        JSON.stringify({
          product: material.product,
          unit: material.unit,
          unitCostCents: material.costCents,
          unitPriceCents: material.unitPriceCents,
          taxable: material.taxable,
          reason,
        }),
        key,
        digest,
        Date.now(),
      ),
    );
    s.audit(c, owner, "inventory." + body.kind, id);
    return {
      id,
      duplicate: false,
      availableQuantityMillis: available + delta,
      version: (balance?.version ?? 0) + 1,
    };
  });
}
export function jobInvoiceLines(job) {
  const d = job.data;
  requireThat(
    Array.isArray(d.lines) && d.lines.length,
    "Save the job charges before invoicing",
    409,
  );
  return [
    ...d.lines,
    ...job.materials
      .filter((m) => m.quantity_millis < 0)
      .map((m) => {
        const d = JSON.parse(m.data);
        return {
          description: d.product,
          unit: d.unit,
          quantityMillis: -m.quantity_millis,
          unitPriceCents: d.unitPriceCents,
          unitCostCents: d.unitCostCents,
          taxable: d.taxable,
        };
      }),
  ];
}
