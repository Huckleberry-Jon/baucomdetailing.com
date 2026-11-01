import { invoiceBranding } from "./inventory-receipts.js";
import { randomUUID } from "node:crypto";
import { hash, text, requireThat } from "../src/security.js";
import { jobView, jobInvoiceLines } from "./operations.js";
import { priceDocument } from "./finance.js";
const money = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 100000000;
export async function completionContext(s, bookingId) {
  const row = await s.first(
    "SELECT id FROM jobs WHERE business_id=? AND booking_id=?",
    s.tenant,
    bookingId,
  );
  requireThat(row, "Job not found", 404);
  const job = await jobView(s, row.id);
  const invoice = await s.first(
    "SELECT * FROM financial_documents WHERE business_id=? AND booking_id=? AND kind='invoice'",
    s.tenant,
    bookingId,
  );
  const sums = invoice
    ? await s.first(
        "SELECT coalesce(sum(amount_cents),0) paid,coalesce(sum(tip_cents),0) tips,coalesce(sum(tax_cents),0) tax FROM financial_events WHERE business_id=? AND document_id=? AND kind='payment'",
        s.tenant,
        invoice.id,
      )
    : { paid: 0, tips: 0, tax: 0 };
  const receipt = await s.first(
    "SELECT id FROM history WHERE business_id=? AND booking_id=? AND event='job.checkout'",
    s.tenant,
    bookingId,
  );
  const quote = job.data.lines?.length
    ? priceDocument({ lines: jobInvoiceLines(job), taxBps: 0 })
    : null;
  return {
    job,
    invoice: invoice
      ? {
          ...invoice,
          data: JSON.parse(invoice.data),
          paid_cents: sums.paid,
          tip_cents: sums.tips,
          tax_paid_cents: sums.tax,
        }
      : null,
    quote,
    checkoutRecorded: !!receipt,
  };
}
export async function completeWithPayment(s, body, owner, key) {
  text(key, "Idempotency key", 150);
  const keyHash = hash(key),
    digest = hash(JSON.stringify(body));
  return s.atomic(async (b, c) => {
    const prior = await s.first(
      "SELECT data FROM history WHERE business_id=? AND event='job.checkout' AND json_extract(data,'$.keyHash')=?",
      s.tenant,
      keyHash,
    );
    if (prior) {
      const d = JSON.parse(prior.data);
      requireThat(
        d.requestHash === digest,
        "Checkout key reused with different details",
        409,
      );
      return { ...d.result, duplicate: true };
    }
    const ctx = await completionContext(s, body.bookingId),
      { job } = ctx;
    requireThat(
      job.plannedConsumables.every((p) => p.recorded),
      "Review assigned consumables before completing this job",
      409,
    );
    requireThat(
      !ctx.checkoutRecorded,
      "Checkout already recorded; open the invoice to record another payment",
      409,
    );
    requireThat(
      ["in_progress", "completed"].includes(job.status),
      "Start the job before completing it",
      409,
    );
    requireThat(
      job.booking_version === body.bookingVersion &&
        job.version === body.jobVersion,
      "Job changed; refresh before completing",
      409,
    );
    requireThat(
      (ctx.invoice?.version ?? null) === (body.invoiceVersion ?? null),
      "Invoice changed; refresh",
      409,
    );
    requireThat(
      typeof body.unpaid === "boolean",
      "Choose payment received or not paid yet",
    );
    requireThat(
      money(body.amountCents) && money(body.tipCents),
      "Invalid payment or tip",
    );
    const at = Date.parse(body.occurredAt);
    requireThat(
      Number.isFinite(at) &&
        at <= Date.now() + 60000 &&
        at >= Date.UTC(2000, 0, 1),
      "Invalid payment time",
    );
    requireThat(
      body.unpaid
        ? body.amountCents === 0 && body.tipCents === 0
        : body.amountCents > 0,
      "Enter the amount received; use not paid yet for no payment",
    );
    if (!body.unpaid)
      requireThat(
        ["cash", "check", "bank", "external_card_reference"].includes(
          body.method,
        ),
        "Choose the external payment method",
      );
    let invoice = ctx.invoice,
      data = invoice?.data;
    if (invoice)
      requireThat(
        ["draft", "issued"].includes(invoice.status),
        "Invoice is void; resolve it before checkout",
        409,
      );
    if (!invoice) {
      let lines;
      if (ctx.quote) lines = jobInvoiceLines(job);
      else {
        requireThat(
          money(body.servicePriceCents) && body.servicePriceCents > 0,
          "Enter the final approved service price",
        );
        lines = [
          {
            description: "Completed detailing service - approved final price",
            unit: "service",
            quantityMillis: 1000,
            unitPriceCents: body.servicePriceCents,
            unitCostCents: 0,
            taxable: true,
          },
        ];
      }
      data = priceDocument({
        lines,
        taxBps: body.taxBps ?? 0,
        discountCents: body.discountCents ?? 0,
      });
      data.customer = JSON.parse(
        (
          await s.first(
            "SELECT data FROM customers WHERE business_id=? AND id=?",
            s.tenant,
            job.customer_id,
          )
        ).data,
      );
      const settings = JSON.parse(b.settings);
      Object.assign(data, {
        jobId: job.id,
        ...invoiceBranding(settings),
        reviewUrl: settings.googleReviewUrl ?? null,
        jobCostCents:
          (job.data.lines ?? []).reduce((n, l) => n + (l.costCents ?? 0), 0) +
          job.materials.reduce((n, m) => n + m.cost_cents, 0) +
          (job.data.laborCostCents ?? 0) +
          (job.data.travelCostCents ?? 0),
        photoIds: (
          await s.all(
            "SELECT id FROM media WHERE business_id=? AND booking_id=? AND include_on_invoice=1 ORDER BY created_at,id LIMIT 24",
            s.tenant,
            body.bookingId,
          )
        ).map((p) => p.id),
      });
      invoice = {
        id: randomUUID(),
        number:
          "INV-" +
          new Date().getUTCFullYear() +
          "-" +
          String(b.revision + 1).padStart(6, "0"),
        status: "issued",
        version: 1,
      };
      c.push(
        s.command(
          "INSERT INTO financial_documents(id,business_id,customer_id,booking_id,kind,status,number,version,data,created_at) VALUES(?,?,?,?,'invoice','issued',?,1,?,?)",
          invoice.id,
          s.tenant,
          job.customer_id,
          body.bookingId,
          invoice.number,
          JSON.stringify(data),
          Date.now(),
        ),
      );
      s.audit(c, owner, "document.issued", invoice.id);
    } else if (invoice.status === "draft") {
      invoice = {
        ...invoice,
        status: "issued",
        number:
          "INV-" +
          new Date().getUTCFullYear() +
          "-" +
          String(b.revision + 1).padStart(6, "0"),
      };
      c.push(
        s.command(
          "UPDATE financial_documents SET status='issued',number=?,version=version+1 WHERE business_id=? AND id=?",
          invoice.number,
          s.tenant,
          invoice.id,
        ),
      );
      s.audit(c, owner, "document.issued", invoice.id);
    }
    const paid = ctx.invoice?.paid_cents ?? 0,
      priorTax = ctx.invoice?.tax_paid_cents ?? 0;
    requireThat(
      body.amountCents <= data.totalCents - paid,
      "Payment exceeds remaining invoice balance",
      409,
    );
    let paymentId = null;
    if (!body.unpaid) {
      const tax =
        paid + body.amountCents === data.totalCents
          ? data.taxCents - priorTax
          : Number(
              (BigInt(body.amountCents) * BigInt(data.taxCents) +
                BigInt(Math.floor(data.totalCents / 2))) /
                BigInt(data.totalCents),
            );
      paymentId = randomUUID();
      const event = {
        kind: "payment",
        documentId: invoice.id,
        amountCents: body.amountCents,
        tipCents: body.tipCents,
        method: body.method,
        occurredAt: body.occurredAt,
      };
      c.push(
        s.command(
          "INSERT INTO financial_events VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          paymentId,
          s.tenant,
          invoice.id,
          "payment",
          body.amountCents,
          body.tipCents,
          Math.min(tax, data.taxCents - priorTax),
          at,
          JSON.stringify({
            method: body.method,
            category: "receipt",
            note: "Job completion payment",
          }),
          "checkout-" + keyHash,
          hash(JSON.stringify(event)),
        ),
      );
      s.event(c, body.bookingId, "payment.recorded", "owner", {
        paymentId,
        amountCents: body.amountCents,
        tipCents: body.tipCents,
      });
      s.audit(c, owner, "finance.payment.recorded", paymentId);
    }
    if (job.status === "in_progress") {
      c.push(
        s.command(
          "UPDATE bookings SET status='completed',version=version+1 WHERE business_id=? AND id=?",
          s.tenant,
          body.bookingId,
        ),
      );
      s.event(c, body.bookingId, "booking.complete", "owner", {
        status: "completed",
      });
    }
    const result = {
      bookingId: body.bookingId,
      status: "completed",
      documentId: invoice.id,
      number: invoice.number,
      paymentId,
      amountCents: body.amountCents,
      tipCents: body.tipCents,
      balanceCents: data.totalCents - paid - body.amountCents,
      duplicate: false,
    };
    c.push(
      s.command(
        "INSERT INTO history VALUES(?,?,?,?,?,?,?)",
        randomUUID(),
        s.tenant,
        body.bookingId,
        "owner",
        "job.checkout",
        JSON.stringify({ keyHash, requestHash: digest, result }),
        Date.now(),
      ),
    );
    s.audit(c, owner, "job.checkout", job.id);
    return result;
  });
}
