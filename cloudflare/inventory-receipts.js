import { randomUUID } from "node:crypto";
import { hash, requireThat, text } from "../src/security.js";
import { material } from "./finance.js";
import { prepareMedia } from "./media.js";
export async function materialRows(s) {
  const rows = await s.all(
    "SELECT m.*,coalesce(b.quantity_millis,0) available_quantity_millis,coalesce(b.version,0) stock_version FROM materials m LEFT JOIN inventory_balances b ON b.material_id=m.id AND b.business_id=m.business_id WHERE m.business_id=? ORDER BY m.rowid DESC LIMIT 300",
    s.tenant,
  );
  return rows.map((r) => {
    const d = JSON.parse(r.data);
    return {
      ...r,
      low_stock:
        d.lowStockMillis != null &&
        r.available_quantity_millis <= d.lowStockMillis,
    };
  });
}
export async function importReceipt(s, body, owner, key, env) {
  text(key, "Idempotency key", 150);
  requireThat(body.reviewed === true, "Review receipt items before applying");
  requireThat(
    Array.isArray(body.lines) &&
      body.lines.length > 0 &&
      body.lines.length <= 50,
    "Use 1–50 receipt items",
  );
  const digest = hash(JSON.stringify(body));
  const prior = await s.first(
    "SELECT * FROM inventory_receipts WHERE business_id=? AND idempotency_key=?",
    s.tenant,
    key,
  );
  if (prior) {
    requireThat(
      prior.request_hash === digest,
      "Receipt key reused for different items",
      409,
    );
    return { id: prior.id, duplicate: true };
  }
  const photo = (await prepareMedia(env, s.tenant, [body.photo]))[0];
  return s.atomic(async (b, c) => {
    const old = await s.first(
      "SELECT * FROM inventory_receipts WHERE business_id=? AND (idempotency_key=? OR sha256=?)",
      s.tenant,
      key,
      photo.sha,
    );
    if (old) {
      requireThat(
        old.idempotency_key === key && old.request_hash === digest,
        "This receipt photo has already been applied",
        409,
      );
      return { id: old.id, duplicate: true };
    }
    const id = randomUUID(),
      seen = new Set(),
      lines = [];
    const vendor = text(body.vendor, "Vendor", 150),
      reference =
        typeof body.reference === "string"
          ? body.reference.trim().slice(0, 150)
          : "";
    for (const [index, line] of body.lines.entries()) {
      const value = material(line),
        delta = value.quantityMillis;
      let product = null,
        balance = null;
      if (line.materialId) {
        requireThat(
          !seen.has(line.materialId),
          "Combine duplicate product lines before applying",
        );
        seen.add(line.materialId);
        product = await s.first(
          "SELECT * FROM materials WHERE business_id=? AND id=?",
          s.tenant,
          line.materialId,
        );
        requireThat(product, "Material not found", 404);
        requireThat(
          product.version === line.materialVersion,
          "Material changed; reload receipt",
          409,
        );
        requireThat(
          JSON.parse(product.data).unit === value.unit,
          "Receipt unit must match stock unit; do not assume fluid volume",
        );
        balance = await s.first(
          "SELECT * FROM inventory_balances WHERE business_id=? AND material_id=?",
          s.tenant,
          product.id,
        );
        requireThat(
          (balance?.version ?? 0) === line.stockVersion,
          "Stock changed; reload receipt",
          409,
        );
        // Receipt cost is retained in this movement. Existing product markup/cost settings remain owner controlled.
      }
      const productId = product?.id ?? randomUUID(),
        available = (balance?.quantity_millis ?? 0) + delta;
      requireThat(
        Number.isSafeInteger(available) && available <= 1000000000,
        "Stock quantity is too large",
      );
      if (!product)
        c.push(
          s.command(
            "INSERT INTO materials VALUES(?,?,1,?)",
            productId,
            s.tenant,
            JSON.stringify(value),
          ),
        );
      c.push(
        s.command(
          "INSERT INTO inventory_balances VALUES(?,?,?,1) ON CONFLICT(material_id) DO UPDATE SET quantity_millis=excluded.quantity_millis,version=version+1",
          productId,
          s.tenant,
          available,
        ),
      );
      const cost = Number(
        (BigInt(delta) * BigInt(value.costCents) + 500n) / 1000n,
      );
      requireThat(cost <= 1000000000, "Receipt line cost is too large");
      c.push(
        s.command(
          "INSERT INTO inventory_movements VALUES(?,?,?,?,?,?,?,?,?,?)",
          randomUUID(),
          s.tenant,
          productId,
          null,
          delta,
          cost,
          JSON.stringify({
            product: value.product,
            unit: value.unit,
            unitCostCents: value.costCents,
            receiptId: id,
            reason: "Receipt purchase",
            vendor,
            reference,
          }),
          "receipt:" + id + ":" + index,
          digest,
          Date.now(),
        ),
      );
      lines.push({ ...value, materialId: productId });
    }
    c.push(
      s.command(
        "INSERT INTO inventory_receipts VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        id,
        s.tenant,
        key,
        digest,
        vendor,
        reference,
        JSON.stringify({ lines, reviewedBy: owner, stockOnly: true }),
        photo.mime,
        photo.original_key,
        photo.preview_key,
        photo.sha,
        Date.now(),
      ),
    );
    s.audit(c, owner, "inventory.receipt.applied", id);
    return { id, duplicate: false, items: lines.length };
  });
}
export async function saveBusinessProfile(s, body, owner, env) {
  const logo = body.logo
    ? (await prepareMedia(env, s.tenant, [body.logo]))[0]
    : null;
  return s.atomic(async (b, c) => {
    requireThat(
      body.version === b.revision,
      "Business settings changed; refresh",
      409,
    );
    const settings = JSON.parse(b.settings),
      p = body.profile ?? {};
    const clean = { name: text(p.name, "Business name", 120) };
    for (const field of [
      "contact",
      "invoiceAddress",
      "invoicePhone",
      "invoiceEmail",
      "invoiceFooter",
    ]) {
      requireThat(
        typeof p[field] === "string" && p[field].length <= 500,
        "Invalid " + field,
      );
      clean[field] = p[field].trim();
    }
    requireThat(
      !clean.invoiceEmail ||
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.invoiceEmail),
      "Invalid invoice email",
    );
    if (logo) {
      const id = randomUUID();
      c.push(
        s.command(
          "INSERT INTO business_assets VALUES(?,?,?,?,?,?,?)",
          id,
          s.tenant,
          logo.mime,
          logo.original_key,
          logo.preview_key,
          logo.sha,
          Date.now(),
        ),
      );
      clean.invoiceLogoId = id;
    } else if (body.removeLogo === true) clean.invoiceLogoId = null;
    c.push(
      s.command(
        "UPDATE businesses SET settings=? WHERE id=?",
        JSON.stringify({ ...settings, ...clean }),
        s.tenant,
      ),
    );
    s.audit(c, owner, "business.profile.saved", s.tenant);
    return { ok: true };
  });
}
export const invoiceBranding = (settings) => ({
  businessName: settings.name,
  businessContact: settings.contact ?? "",
  businessAddress: settings.invoiceAddress ?? "",
  businessPhone: settings.invoicePhone ?? "",
  businessEmail: settings.invoiceEmail ?? "",
  invoiceFooter: settings.invoiceFooter ?? "",
  invoiceLogoId: settings.invoiceLogoId ?? null,
});
