import { requireThat } from "../src/security.js";
import { usageCost } from "./material-costing.js";
export async function validateConsumables(s, items) {
  requireThat(
    Array.isArray(items) && items.length <= 50,
    "Use at most 50 consumables per service",
  );
  const ids = new Set(),
    result = [];
  for (const item of items) {
    requireThat(
      item && typeof item.materialId === "string" && !ids.has(item.materialId),
      "Choose each consumable once",
    );
    ids.add(item.materialId);
    requireThat(
      Number.isInteger(item.quantityMillis) &&
        item.quantityMillis > 0 &&
        item.quantityMillis <= 1000000,
      "Set a positive usage quantity",
    );
    const material = await s.first(
      "SELECT id,data FROM materials WHERE business_id=? AND id=?",
      s.tenant,
      item.materialId,
    );
    requireThat(material, "Consumable not found", 404);
    result.push({
      materialId: item.materialId,
      quantityMillis: item.quantityMillis,
      billSeparately: false,
      unit: JSON.parse(material.data).unit,
    });
  }
  return result;
}
export async function saveServiceConsumables(s, body, owner) {
  return s.atomic(async (b, c) => {
    const row = await s.first(
      "SELECT * FROM services WHERE business_id=? AND id=?",
      s.tenant,
      body.serviceId,
    );
    requireThat(row, "Service not found", 404);
    requireThat(row.version === body.version, "Service changed; refresh", 409);
    const data = JSON.parse(row.data),
      consumables = await validateConsumables(s, body.consumables);
    c.push(
      s.command(
        "UPDATE services SET data=?,version=version+1 WHERE business_id=? AND id=?",
        JSON.stringify({ ...data, consumables }),
        s.tenant,
        row.id,
      ),
    );
    s.audit(c, owner, "service.consumables.saved", row.id);
    return { ok: true, version: row.version + 1 };
  });
}
export async function plannedConsumables(s, job, movements) {
  const snapshot =
    typeof job.snapshot === "string" ? JSON.parse(job.snapshot) : job.snapshot;
  const details =
    typeof job.data === "string" ? JSON.parse(job.data) : (job.data ?? {});
  const sources = [
      snapshot?.package,
      ...(snapshot?.addons ?? []),
      ...(details.lines ?? []).map((l) => l.serviceSnapshot),
    ].filter(Boolean),
    unique = new Map();
  for (const source of sources) {
    if (
      !unique.has(source.id) ||
      unique.get(source.id).consumables === undefined
    )
      unique.set(source.id, source);
  }
  const services = [...unique.values()],
    combined = new Map();
  for (const service of services) {
    for (const item of service.consumables ?? []) {
      const entry = combined.get(item.materialId) ?? {
        materialId: item.materialId,
        quantityMillis: 0,
        services: [],
      };
      entry.quantityMillis += item.quantityMillis;
      entry.services.push(service.name);
      combined.set(item.materialId, entry);
    }
  }
  const result = [],
    rows = combined.size
      ? await s.all(
          "SELECT m.*,coalesce(b.quantity_millis,0) available_quantity_millis,coalesce(b.version,0) stock_version FROM materials m LEFT JOIN inventory_balances b ON b.material_id=m.id AND b.business_id=m.business_id WHERE m.business_id=? AND m.id IN(SELECT value FROM json_each(?))",
          s.tenant,
          JSON.stringify([...combined.keys()]),
        )
      : [],
    byId = new Map(rows.map((r) => [r.id, r]));
  for (const plan of combined.values()) {
    const row = byId.get(plan.materialId);
    requireThat(row, "Assigned consumable no longer exists", 409);
    const d = JSON.parse(row.data),
      record = movements.find(
        (m) =>
          m.material_id === plan.materialId &&
          JSON.parse(m.data).planned === true,
      );
    result.push({
      ...plan,
      product: d.product,
      unit: d.unit,
      estimatedCostCents: usageCost(d, plan.quantityMillis),
      availableQuantityMillis: row.available_quantity_millis,
      stockVersion: row.stock_version,
      recorded: !!record,
      actualQuantityMillis: record ? -record.quantity_millis : null,
      movementId: record?.id ?? null,
      includeOnInvoice: record
        ? JSON.parse(record.data).includeOnInvoice === true
        : false,
    });
  }
  return result;
}

export function publicService(service) {
  const { consumables, ...value } = service;
  return value;
}
export function publicBookingSnapshot(snapshot) {
  return {
    ...snapshot,
    package: publicService(snapshot.package),
    addons: (snapshot.addons ?? []).map(publicService),
  };
}

// Invoice disclosure is a whitelisted snapshot, never a charge or internal costing data.
export function invoiceConsumables(job) {
  return job.materials
    .filter(
      (m) =>
        m.quantity_millis < 0 && JSON.parse(m.data).includeOnInvoice === true,
    )
    .map((m) => {
      const d = JSON.parse(m.data);
      return {
        product: d.product,
        unit: d.unit,
        quantityMillis: -m.quantity_millis,
      };
    });
}
export async function setConsumableVisibility(s, body, owner) {
  requireThat(
    typeof body.includeOnInvoice === "boolean" &&
      typeof body.expectedVisibility === "boolean",
    "Choose invoice visibility",
  );
  return s.atomic(async (b, c) => {
    const row = await s.first(
      "SELECT * FROM inventory_movements WHERE business_id=? AND id=? AND job_id IS NOT NULL AND quantity_millis<0",
      s.tenant,
      body.id,
    );
    requireThat(row, "Consumable use not found", 404);
    const job = await s.first(
      "SELECT b.status,j.booking_id FROM jobs j JOIN bookings b ON b.id=j.booking_id AND b.business_id=j.business_id WHERE j.business_id=? AND j.id=?",
      s.tenant,
      row.job_id,
    );
    requireThat(
      job && ["confirmed", "rescheduled", "in_progress"].includes(job.status),
      "Invoice choices are frozen when the job is completed",
      409,
    );
    const issued = await s.first(
      "SELECT id FROM financial_documents WHERE business_id=? AND booking_id=? AND kind='invoice' AND status='issued'",
      s.tenant,
      job.booking_id,
    );
    requireThat(!issued, "Issued invoice details cannot change", 409);
    const data = JSON.parse(row.data);
    requireThat(
      (data.includeOnInvoice === true) === body.expectedVisibility,
      "Invoice choice changed; refresh",
      409,
    );
    data.includeOnInvoice = body.includeOnInvoice;
    c.push(
      s.command(
        "UPDATE inventory_movements SET data=? WHERE business_id=? AND id=?",
        JSON.stringify(data),
        s.tenant,
        row.id,
      ),
    );
    s.audit(c, owner, "consumable.invoice_visibility", row.id);
    return { ok: true };
  });
}
