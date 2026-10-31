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
  if ($("#availability-day").value) void loadAvailableTimes();
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
  populateAvailabilityDays();
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
    if (!body.requestedAt)
      throw Error("Choose an available day and time first.");
    body.requestedAt = new Date(body.requestedAt).toISOString();
    const latest = await fetchAvailableTimes($("#availability-day").value);
    if (!latest.slots.includes(body.requestedAt)) {
      await loadAvailableTimes();
      throw Error(
        "That time is no longer available. Choose another available day and time.",
      );
    }
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
    button.disabled = !document.querySelector("[name=requestedAt]").value;
  }
});
document.addEventListener("DOMContentLoaded", () => {
  load().catch((e) => {
    $("#booking-status").dataset.state = "error";
    $("#booking-status").textContent =
      "Booking form could not load: " + e.message;
  });
});

let availabilityRevision = 0;
function populateAvailabilityDays(keep = $("#availability-day").value) {
  const root = $("#availability-day"),
    settings = catalog.settings;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: settings.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  root.replaceChildren(new Option("Choose an available day", ""));
  for (let i = 0; i < 366; i++) {
    const at = new Date(Date.parse(today + "T12:00:00Z") + i * 86400000),
      day = at.toISOString().slice(0, 10);
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
    }).format(at);
    const closed =
      !settings.scheduleConfirmed ||
      !settings.workingDays.includes(weekday) ||
      settings.closedDates.includes(day);
    const label = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(at);
    const option = new Option(label + (closed ? " - unavailable" : ""), day);
    option.disabled = closed;
    root.append(option);
  }
  if ([...root.options].some((o) => o.value === keep && !o.disabled))
    root.value = keep;
}
async function fetchAvailableTimes(day) {
  if (!day) throw Error("Choose an available day first.");
  const q = new URLSearchParams({ day, packageId: $("#package-select").value });
  for (const input of document.querySelectorAll("[name=addonIds]:checked"))
    q.append("addonId", input.value);
  const response = await fetch("/api/availability?" + q, { cache: "no-store" }),
    data = await response.json();
  if (!response.ok) throw Error(data.error);
  return data;
}
async function loadAvailableTimes() {
  const revision = ++availabilityRevision,
    status = $("#availability-status"),
    times = document.querySelector("[name=requestedAt]");
  const selectedDay = $("#availability-day").value;
  times.disabled = true;
  document.querySelector("#booking-form button[type=submit]").disabled = true;
  times.replaceChildren(new Option("Checking availability...", ""));
  status.dataset.state = "pending";
  try {
    const response = await fetch("/api/catalog", { cache: "no-store" }),
      fresh = await response.json();
    if (!response.ok) throw Error(fresh.error);
    if (revision !== availabilityRevision) return;
    catalog.settings = fresh.settings;
    populateAvailabilityDays(selectedDay);
    if (!$("#availability-day").value)
      throw Error("This day is unavailable. Choose an open day.");
    const data = await fetchAvailableTimes(selectedDay);
    if (revision !== availabilityRevision) return;
    times.replaceChildren(
      new Option(
        data.slots.length ? "Choose an available time" : "No available times",
        "",
      ),
    );
    for (const slot of data.slots) {
      const label = new Intl.DateTimeFormat("en-US", {
        timeZone: data.timezone ?? catalog.settings.timezone,
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(slot));
      times.append(new Option(label, slot));
    }
    times.disabled = data.slots.length === 0;
    status.dataset.state = "success";
    status.textContent =
      data.message + (data.slots.length ? "" : " Choose another day.");
    if (!data.slots.length) {
      const option = [...$("#availability-day").options].find(
        (o) => o.value === selectedDay,
      );
      if (option) option.disabled = true;
    }
  } catch (error) {
    if (revision !== availabilityRevision) return;
    times.replaceChildren(new Option("Choose another available day", ""));
    status.dataset.state = "error";
    status.textContent = error.message;
  }
}
$("#check-availability").onclick = loadAvailableTimes;
$("#availability-day").onchange = loadAvailableTimes;
$("#booking-form").addEventListener("change", (event) => {
  if (event.target.name === "addonIds" && $("#availability-day").value)
    void loadAvailableTimes();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && catalog && $("#availability-day").value)
    void loadAvailableTimes();
});

document.querySelector("[name=requestedAt]").onchange = () => {
  document.querySelector("#booking-form button[type=submit]").disabled =
    !document.querySelector("[name=requestedAt]").value;
};
