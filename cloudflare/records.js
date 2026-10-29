import { randomUUID } from "node:crypto";
import { requireThat, text, hash } from "../src/security.js";
export async function directory(s, kind, query) {
  const table = kind === "customers" ? "customers" : "vehicles";
  const q = (query.get("q") ?? "").trim().toLowerCase();
  requireThat(q.length <= 100, "Search too long");
  const after = query.get("after") ?? "";
  const rows = await s.all(
    "SELECT * FROM " +
      table +
      " WHERE business_id=? AND id>? AND lower(data) LIKE ? ESCAPE '\\' ORDER BY id LIMIT 51",
    s.tenant,
    after,
    "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%",
  );
  return {
    records: rows
      .slice(0, 50)
      .map((r) => ({ ...r, version: hash(r.data), data: JSON.parse(r.data) })),
    next: rows.length > 50 ? rows[49].id : null,
  };
}
export async function updateRecord(s, kind, body, owner) {
  const table = kind === "customers" ? "customers" : "vehicles";
  return s.atomic(async (b, c) => {
    const old = await s.first(
      "SELECT * FROM " + table + " WHERE business_id=? AND id=?",
      s.tenant,
      body.id,
    );
    requireThat(old, "Record not found", 404);
    requireThat(
      hash(old.data) === body.version,
      "Record changed; refresh",
      409,
    );
    const value = validateRecord(kind, body.data ?? {});
    c.push(
      s.command(
        "UPDATE " + table + " SET data=? WHERE business_id=? AND id=?",
        JSON.stringify(value),
        s.tenant,
        old.id,
      ),
    );
    s.audit(c, owner, kind + ".updated", old.id);
    return { ok: true };
  });
}

export function validateRecord(kind, d) {
  let value;
  if (kind === "customers") {
    value = {
      firstName: text(d.firstName, "First name", 100),
      lastName: text(d.lastName, "Last name", 100),
      email: text(d.email, "Email", 254),
      phone: text(d.phone, "Phone", 40),
      address: text(d.address, "Address", 500),
      notes: typeof d.notes === "string" ? d.notes.slice(0, 3000) : "",
    };
    requireThat(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email),
      "Invalid email",
    );
    requireThat(value.phone.replace(/\D/g, "").length >= 10, "Invalid phone");
  } else {
    value = {
      year: d.year,
      make: text(d.make, "Make", 100),
      model: text(d.model, "Model", 100),
      color: text(d.color, "Color", 80),
      bodyType: text(d.bodyType, "Body type", 80),
    };
    requireThat(
      Number.isInteger(d.year) &&
        d.year >= 1900 &&
        d.year <= new Date().getFullYear() + 2,
      "Invalid year",
    );
  }

  return value;
}
export async function createRecord(s, kind, body, owner) {
  const data = validateRecord(kind, body.data ?? {});
  return s.atomic(async (b, c) => {
    const id = randomUUID();
    if (kind === "vehicles") {
      requireThat(
        await s.first(
          "SELECT id FROM customers WHERE business_id=? AND id=?",
          s.tenant,
          body.customerId,
        ),
        "Customer not found",
        404,
      );
      c.push(
        s.command(
          "INSERT INTO vehicles VALUES(?,?,?,?)",
          id,
          s.tenant,
          body.customerId,
          JSON.stringify(data),
        ),
      );
    } else
      c.push(
        s.command(
          "INSERT INTO customers VALUES(?,?,?)",
          id,
          s.tenant,
          JSON.stringify(data),
        ),
      );
    s.audit(c, owner, kind + ".created", id);
    return { id, version: hash(JSON.stringify(data)), data };
  });
}
export async function customerHistory(s, id) {
  const row = await s.first(
    "SELECT * FROM customers WHERE business_id=? AND id=?",
    s.tenant,
    id,
  );
  requireThat(row, "Customer not found", 404);
  return {
    ...row,
    data: JSON.parse(row.data),
    version: hash(row.data),
    vehicles: await s.all(
      "SELECT * FROM vehicles WHERE business_id=? AND customer_id=?",
      s.tenant,
      id,
    ),
    bookings: await s.all(
      "SELECT b.*,j.id job_id FROM bookings b LEFT JOIN jobs j ON j.booking_id=b.id AND j.business_id=b.business_id WHERE b.business_id=? AND b.customer_id=? ORDER BY b.start_ms DESC LIMIT 300",
      s.tenant,
      id,
    ),
  };
}
