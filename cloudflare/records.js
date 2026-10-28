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
    const d = body.data ?? {};
    let value;
    if (kind === "customers") {
      value = {
        firstName: text(d.firstName, "First name", 100),
        lastName: text(d.lastName, "Last name", 100),
        email: text(d.email, "Email", 254),
        phone: text(d.phone, "Phone", 40),
        address: text(d.address, "Address", 500),
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
