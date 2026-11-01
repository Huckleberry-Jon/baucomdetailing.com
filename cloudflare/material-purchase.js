import { randomUUID } from "node:crypto";
import { requireThat, text, hash } from "../src/security.js";
import { material } from "./finance.js";
import { receivedStock, usageCost } from "./material-costing.js";
export async function materialPurchase(s, body, owner, key) {
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
        "Purchase key reused for different request",
        409,
      );
      return { id: prior.material_id, duplicate: true };
    }
    requireThat(body.confirmed === true, "Confirm purchase units and stock");
    const value = material({
        ...body.product,
        quantityMillis: body.product?.quantityMillis ?? 1000,
      }),
      old = body.materialId
        ? await s.first(
            "SELECT * FROM materials WHERE business_id=? AND id=?",
            s.tenant,
            body.materialId,
          )
        : null;
    requireThat(!body.materialId || old, "Material not found", 404);
    const balance = old
      ? await s.first(
          "SELECT * FROM inventory_balances WHERE business_id=? AND material_id=?",
          s.tenant,
          old.id,
        )
      : null;
    requireThat(
      !old ||
        (old.version === body.materialVersion &&
          (balance?.version ?? 0) === body.stockVersion),
      "Product or stock changed; refresh",
      409,
    );
    const available = balance?.quantity_millis ?? 0,
      oldData = old ? JSON.parse(old.data) : null;
    let next, delta, cost;
    if (body.kind === "convert") {
      requireThat(
        old && oldData.unit !== value.unit,
        "Choose a different stock unit to convert",
      );
      requireThat(
        oldData.unit === value.purchaseUnit ||
          ["piece", "bottle"].includes(oldData.unit),
        "Existing stock is not in the declared purchase unit",
      );
      requireThat(
        !(await s.first(
          "SELECT id FROM inventory_movements WHERE business_id=? AND material_id=? AND quantity_millis<0 LIMIT 1",
          s.tenant,
          old.id,
        )),
        "This product has job usage. Create a separate ounce-based product to preserve its history.",
        409,
      );
      requireThat(
        !(await s.first(
          "SELECT id FROM services WHERE business_id=? AND EXISTS(SELECT 1 FROM json_each(json_extract(data,'$.consumables')) WHERE json_extract(value,'$.materialId')=?) LIMIT 1",
          s.tenant,
          old.id,
        )),
        "This product is assigned to services. Create a separate product in the new unit and update assignments.",
        409,
      );
      requireThat(
        !(await s.first(
          "SELECT b.id FROM bookings b,json_tree(b.snapshot) p WHERE b.business_id=? AND p.key='materialId' AND p.value=? LIMIT 1",
          s.tenant,
          old.id,
        )),
        "A booking has a saved consumable plan for this unit. Create a separate product to preserve the plan.",
        409,
      );
      requireThat(
        !(await s.first(
          "SELECT d.job_id FROM job_details d,json_tree(d.data) p WHERE d.business_id=? AND p.key='materialId' AND p.value=? LIMIT 1",
          s.tenant,
          old.id,
        )),
        "A job has a saved consumable plan for this unit. Create a separate product to preserve it.",
        409,
      );
      next = available === 0 ? 0 : receivedStock(value, available);
      delta = next - available;
      cost = 0;
      if (oldData.lowStockMillis != null && value.lowStockMillis == null)
        value.lowStockMillis =
          oldData.lowStockMillis === 0
            ? 0
            : receivedStock(value, oldData.lowStockMillis);
    } else if (body.kind === "settings") {
      requireThat(
        old && oldData.unit === value.unit,
        "Keep existing usage units when editing settings",
      );
      next = available;
      delta = 0;
      cost = 0;
    } else {
      requireThat(body.kind === "purchase", "Invalid purchase action");
      requireThat(
        !old || oldData.unit === value.unit,
        "Convert the existing stock unit first",
        409,
      );
      delta = receivedStock(value, body.purchaseQuantityMillis);
      next = available + delta;
      cost = usageCost(value, delta);
    }
    requireThat(next <= 1000000000, "Stock quantity is too large");
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
    c.push(
      s.command(
        "INSERT INTO inventory_balances VALUES(?,?,?,1) ON CONFLICT(material_id) DO UPDATE SET quantity_millis=excluded.quantity_millis,version=version+1",
        id,
        s.tenant,
        next,
      ),
    );
    c.push(
      s.command(
        "INSERT INTO inventory_movements VALUES(?,?,?,?,?,?,?,?,?,?)",
        randomUUID(),
        s.tenant,
        id,
        null,
        delta,
        cost,
        JSON.stringify({
          kind: body.kind,
          fromUnit: oldData?.unit,
          unit: value.unit,
          purchaseUnit: value.purchaseUnit,
          purchaseSizeMillis: value.purchaseSizeMillis,
          purchaseCostCents: value.purchaseCostCents,
          markupBps: value.markupBps,
          stockBefore: available,
          stockAfter: next,
        }),
        key,
        digest,
        Date.now(),
      ),
    );
    s.audit(c, owner, "inventory." + body.kind, id);
    return { id, duplicate: false, availableQuantityMillis: next };
  });
}
