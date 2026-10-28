const $ = (s) => document.querySelector(s),
  money = (n) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n / 100);
const el = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
let catalog,
  submissionKey = crypto.randomUUID();
function estimate() {
  const p = catalog.services.find((s) => s.id === $("#package-select").value);
  $("#estimate").textContent =
    `Estimated package: ${money(p.min)}–${money(p.max)}. Selected add-ons require a separate quote.`;
}
async function load() {
  const r = await fetch("/api/catalog");
  catalog = await r.json();
  if (!r.ok) throw Error(catalog.error);
  $("#notice").textContent = catalog.notice;
  $("#service-area").textContent = catalog.settings.serviceArea;
  for (const p of catalog.services.filter((s) => s.kind === "package")) {
    const c = el("article", null, "card" + (p.featured ? " featured" : ""));
    c.append(
      el(
        "div",
        p.featured ? "THE SIGNATURE DETAIL" : "INTERIOR DETAIL",
        "eyebrow",
      ),
      el("h3", p.name),
      el("p", p.subtitle),
      el("div", `${money(p.min)}–${money(p.max)}`, "price"),
      el(
        "small",
        "Starting estimate. Vehicle size, condition, and additional cleaning affect final price.",
      ),
    );
    const ul = el("ul");
    for (const item of p.items) ul.append(el("li", item));
    c.append(ul);
    const a = el("a", "Select package ↗", "button");
    a.href = "#book";
    a.onclick = () => {
      $("#package-select").value = p.id;
      estimate();
    };
    c.append(a);
    $("#packages-grid").append(c);
    const o = el("option", p.name);
    o.value = p.id;
    $("#package-select").append(o);
  }
  for (const a of catalog.services.filter((s) => s.kind === "addon")) {
    const c = el("article", null, "mini-card");
    c.append(
      el("h3", a.name),
      el("p", a.description),
      el("strong", a.min === null ? "Quote required" : money(a.min)),
    );
    $("#addons-grid").append(c);
    const l = el("label", null, "check"),
      i = el("input");
    i.type = "checkbox";
    i.name = "addonIds";
    i.value = a.id;
    l.append(i, document.createTextNode(a.name));
    $("#addon-checks").append(l);
  }
  for (const s of [
    "Excessive staining",
    "Pet hair",
    "Chewing gum",
    "Food or beverage spills",
    "Heavy dirt or mud",
    "Odors",
  ]) {
    const l = el("label", null, "check"),
      i = el("input");
    i.type = "checkbox";
    i.name = "condition";
    i.value = s;
    l.append(i, document.createTextNode(s));
    $("#concern-checks").append(l);
  }
  estimate();
  $("#package-select").onchange = estimate;
}
$("#booking-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = e.submitter;
  button.disabled = true;
  try {
    const f = new FormData(e.target),
      body = Object.fromEntries(f);
    body.addonIds = f.getAll("addonIds");
    body.concerns = [...f.getAll("condition"), f.get("notes")]
      .filter(Boolean)
      .join("; ");
    body.requestedAt = new Date(body.requestedAt).toISOString();
    body.acceptNotice = f.get("acceptNotice") === "on";
    delete body.notes;
    delete body.condition;
    const r = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": submissionKey,
        },
        body: JSON.stringify(body),
      }),
      b = await r.json();
    if (!r.ok) {
      if (r.status === 409) submissionKey = crypto.randomUUID();
      throw Error(b.error);
    }
    $("#booking-status").replaceChildren(
      document.createTextNode(
        `Request saved. Status: ${b.status}. This appointment is not confirmed. `,
      ),
    );
    if (b.accessToken) {
      const a = el("a", "Save your private booking link");
      a.href = `/booking#${b.id}:${b.accessToken}`;
      $("#booking-status").append(a);
      a.append(document.createTextNode(" (expires in 30 days)"));
    } else
      $("#booking-status").append(
        document.createTextNode(
          "This request was already submitted. Use the private link saved from the first response.",
        ),
      );
    e.target.reset();
    submissionKey = crypto.randomUUID();
    estimate();
  } catch (err) {
    $("#booking-status").textContent = err.message;
  } finally {
    button.disabled = false;
  }
});
load().catch((e) => {
  $("#booking-status").textContent = e.message;
});
