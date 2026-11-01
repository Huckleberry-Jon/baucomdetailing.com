import { requireThat } from "../src/security.js";
export const roundRatio = (n, d) => Number((n + BigInt(d) / 2n) / BigInt(d));
export function purchaseBasis(input) {
  const unit = input.unit,
    purchaseUnit = input.purchaseUnit ?? unit;
  let size =
    input.purchaseSizeMillis ??
    (purchaseUnit === unit
      ? 1000
      : purchaseUnit === "gallon" && unit === "oz"
        ? 128000
        : null);
  requireThat(
    ["oz", "gallon", "bottle", "piece"].includes(purchaseUnit),
    "Invalid purchase unit",
  );
  requireThat(
    Number.isSafeInteger(size) && size > 0 && size <= 1000000000,
    "Specify contents in usage units per purchased container",
  );
  requireThat(
    purchaseUnit !== unit || size === 1000,
    "Same units must use a 1:1 conversion",
  );
  requireThat(
    purchaseUnit !== "gallon" || unit !== "oz" || size === 128000,
    "One US gallon contains 128 fluid ounces",
  );
  requireThat(
    purchaseUnit === unit ||
      ["bottle", "piece"].includes(purchaseUnit) ||
      (purchaseUnit === "gallon" && unit === "oz"),
    "Unsupported unit conversion",
  );
  const cost = input.purchaseCostCents;
  requireThat(
    Number.isSafeInteger(cost) && cost >= 0 && cost <= 100000000,
    "Invalid purchase cost",
  );
  return {
    purchaseUnit,
    purchaseSizeMillis: size,
    purchaseCostCents: cost,
    costBasisCents: cost,
    costBasisQuantityMillis: size,
  };
}
export function usageCost(d, quantity, priced = false) {
  const basis = d.costBasisCents ?? d.costCents,
    den = d.costBasisQuantityMillis ?? 1000;
  requireThat(
    Number.isSafeInteger(basis) &&
      basis >= 0 &&
      basis <= 100000000 &&
      Number.isSafeInteger(den) &&
      den > 0 &&
      den <= 1000000000,
    "Invalid material costing basis",
  );
  if (d.costBasisCents === undefined) {
    const cents = priced
      ? (d.unitPriceCents ??
        roundRatio(BigInt(basis) * BigInt(10000 + (d.markupBps ?? 0)), 10000))
      : basis;
    return roundRatio(BigInt(quantity) * BigInt(cents), 1000);
  }
  const result = roundRatio(
    BigInt(quantity) *
      BigInt(basis) *
      BigInt(priced ? 10000 + (d.markupBps ?? 0) : 10000),
    BigInt(den) * 10000n,
  );
  requireThat(
    Number.isSafeInteger(result) && result <= 1000000000000,
    "Material amount is too large",
  );
  return result;
}
export function receivedStock(d, count) {
  requireThat(
    Number.isSafeInteger(count) && count > 0 && count <= 1000000,
    "Invalid purchased quantity",
  );
  const n = BigInt(count) * BigInt(d.purchaseSizeMillis ?? 1000);
  requireThat(
    n % 1000n === 0n,
    "Quantity cannot be represented in stock units",
  );
  const amount = Number(n / 1000n);
  requireThat(
    amount > 0 && amount <= 1000000000,
    "Purchased stock is too large",
  );
  return amount;
}
