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
  globalThis.BaucomSocial?.render(catalog.settings);
  const note = $("#contact-booking-note");
  if (note)
    note.textContent = catalog.runtime?.siteOpen
      ? "Appointment requests require owner confirmation."
      : "Use the appointment request form for this private preview.";
  if (catalog.settings.scheduleConfirmed) {
    const clock = (n) =>
      String(Math.floor(n / 60)).padStart(2, "0") +
      ":" +
      String(n % 60).padStart(2, "0");
    $("#contact-hours").textContent =
      " Hours: " +
      catalog.settings.workingDays.join(", ") +
      " " +
      clock(catalog.settings.openMinute) +
      "–" +
      clock(catalog.settings.closeMinute) +
      " · " +
      catalog.settings.timezone +
      ".";
  }
  const contact = catalog.settings.contact;
  if (typeof contact === "string" && contact.trim())
    $("#contact-details").textContent = contact;
  for (const p of catalog.services.filter((s) => s.kind === "package")) {
    const c = el("article", null, "card" + (p.featured ? " featured" : ""));
    const figure = el("figure", null, "photo-slot package-photo");
    figure.dataset.photoSlot = "package-" + p.id;
    figure.append(el("span", "Service photograph pending"));
    c.append(figure);
    c.append(
      el(
        "div",
        p.featured ? "THE SIGNATURE DETAIL" : "INTERIOR DETAIL",
        "eyebrow",
      ),
      el("h3", p.name),
      el("p", p.subtitle),
      el("div", `${money(p.min)}–${money(p.max)}`, "price"),
      el("small", catalog.notice),
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
  // Optional gallery loading must not prevent booking controls from initializing.
  void loadWebsitePhotos().catch(() => {});
  const notice = $("#environment-notice");
  if (notice)
    notice.textContent = catalog.runtime?.siteOpen
      ? "REQUESTS REQUIRE OWNER CONFIRMATION"
      : catalog.runtime?.environment === "production"
        ? "PRIVATE PRELAUNCH PREVIEW"
        : catalog.runtime?.environment === "staging"
          ? "PRIVATE STAGING · TEST BOOKINGS ONLY"
          : "LOCAL DEVELOPMENT · NOT OPEN FOR LIVE BOOKINGS";
  estimate();
  $("#package-select").onchange = estimate;
  if (location.hash)
    document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
$("#booking-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = e.submitter;
  button.disabled = true;
  $("#booking-status").dataset.state = "pending";
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
    body.photos = await readPhotos(
      document.querySelector("#booking-photos").files,
    );
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
    $("#booking-status").dataset.state = "success";
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
    $("#booking-status").dataset.state = "error";
    $("#booking-status").textContent = "Request not sent: " + err.message;
  } finally {
    button.disabled = false;
  }
});
document.addEventListener("DOMContentLoaded", () => {
  load().catch((e) => {
    $("#booking-status").dataset.state = "error";
    $("#booking-status").textContent =
      "Booking form could not load: " + e.message;
  });
});
document.querySelector("#check-availability").onclick = async () => {
  const status = document.querySelector("#availability-status"),
    root = document.querySelector("#availability-times");
  root.replaceChildren();
  status.dataset.state = "pending";
  try {
    const q = new URLSearchParams({
      day: document.querySelector("#availability-day").value,
      packageId: document.querySelector("#package-select").value,
    });
    for (const input of document.querySelectorAll("[name=addonIds]:checked"))
      q.append("addonId", input.value);
    const r = await fetch("/api/availability?" + q),
      data = await r.json();
    if (!r.ok) throw Error(data.error);
    status.dataset.state = "success";
    status.textContent =
      data.message + (data.slots.length ? "" : " No available times shown.");
    for (const slot of data.slots) {
      const b = el(
        "button",
        new Date(slot).toLocaleTimeString("en-US", {
          timeZone: "America/Chicago",
          hour: "numeric",
          minute: "2-digit",
        }) + " Central",
      );
      b.type = "button";
      b.onclick = () => {
        const d = new Date(slot),
          value = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        document.querySelector("[name=requestedAt]").value = value;
        status.textContent =
          "Preferred time selected. Submit the booking form to request it.";
      };
      root.append(b);
    }
  } catch (e) {
    status.dataset.state = "error";
    status.textContent = "Availability could not be checked: " + e.message;
  }
};
