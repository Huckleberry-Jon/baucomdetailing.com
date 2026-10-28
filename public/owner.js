const $ = (s) => document.querySelector(s),
  el = (tag, t, cls) => {
    const e = document.createElement(tag);
    if (t) e.textContent = t;
    if (cls) e.className = cls;
    return e;
  };
let dashboard;
async function api(path, method = "GET", body) {
  const r = await fetch("/api/owner/" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Object.assign(Error(data.error), { status: r.status });
  return data;
}
const safe =
  (fn) =>
  async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      $("#status").textContent = e.message;
    }
  };
function button(text, fn) {
  const b = el("button", text);
  b.type = "button";
  b.onclick = safe(fn);
  return b;
}
function field(form, label, name, type, value) {
  const l = el("label", label),
    i = el("input");
  i.name = name;
  i.type = type;
  if (value !== undefined) i.value = value;
  l.append(i);
  form.append(l);
  return i;
}
async function refresh() {
  dashboard = await api("dashboard");
  $("#login").hidden = true;
  $("#workspace").hidden = false;
  $("#stats").replaceChildren(
    el(
      "div",
      `${dashboard.bookings.filter((b) => b.status === "pending").length} pending`,
    ),
    el("div", `${dashboard.unread} unread`),
    el(
      "div",
      `${dashboard.bookings.filter((b) => ["confirmed", "rescheduled"].includes(b.status)).length} confirmed`,
    ),
  );
  $("#request-list").replaceChildren();
  for (const b of dashboard.bookings) {
    const c = JSON.parse(b.customer),
      v = JSON.parse(b.vehicle),
      s = JSON.parse(b.snapshot),
      details = JSON.parse(b.data),
      card = el("article", null, "request");
    card.id = "booking-" + b.id;
    card.append(
      el("div", b.status.replaceAll("_", " "), "eyebrow"),
      el("h3", c.firstName + " " + c.lastName),
      el("p", `${v.year} ${v.make} ${v.model} · ${v.color} · ${v.bodyType}`),
      el(
        "p",
        new Date(b.start_ms).toLocaleString("en-US", {
          timeZone: "America/Chicago",
        }) + " · America/Chicago",
      ),
      el("p", s.package.name + " · " + s.addons.map((a) => a.name).join(", ")),
      el("p", `${c.phone} · ${c.email}`),
      el("p", details.location),
      el("p", details.concerns || "No specific concerns supplied."),
    );
    if (b.proposal) {
      const p = JSON.parse(b.proposal);
      card.append(
        el(
          "p",
          `Proposal: ${new Date(p.startAt).toLocaleString()} · $${(p.priceCents / 100).toFixed(2)}. Customer acceptance is required.`,
        ),
      );
    }
    const form = el("form", null, "form-grid");
    const duration = field(
      form,
      "Duration (minutes)",
      "durationMinutes",
      "number",
      s.package.durationMinutes ?? "",
    );
    duration.min = "1";
    duration.max = "720";
    const when = field(
      form,
      "Proposed time (your device timezone)",
      "startAt",
      "datetime-local",
    );
    const price = field(form, "Revised total (cents)", "priceCents", "number");
    price.min = "0";
    card.append(form);
    const actions = el("div", null, "toolbar");
    const send = async (action) => {
      const input = {
        id: b.id,
        version: b.version,
        action,
        durationMinutes: Number(duration.value),
      };
      if (action === "propose") {
        input.startAt = new Date(when.value).toISOString();
        input.priceCents = Number(price.value);
        if (!price.value) throw Error("Enter the revised total");
      }
      await api("transition", "POST", input);
      await refresh();
    };
    if (b.status === "pending")
      actions.append(button("Confirm requested time", () => send("confirm")));
    if (
      ["pending", "confirmed", "rescheduled", "awaiting_acceptance"].includes(
        b.status,
      )
    )
      actions.append(
        button("Propose time / price", () => send("propose")),
        button("Cancel / reject", () => send("cancel")),
      );
    if (["confirmed", "rescheduled"].includes(b.status))
      actions.append(
        button("Start job", () => send("start")),
        button("No-show", () => send("no_show")),
      );
    if (b.status === "in_progress")
      actions.append(button("Complete", () => send("complete")));
    actions.append(
      button("History", async () => {
        const history = await api("history?id=" + b.id);
        const list = el("ol");
        for (const h of history)
          list.append(
            el(
              "li",
              `${new Date(h.created_at).toLocaleString()} · ${h.actor} · ${h.event}`,
            ),
          );
        card.append(list);
      }),
    );
    card.append(actions);
    $("#request-list").append(card);
  }
  if (!dashboard.bookings.length)
    $("#request-list").append(
      el("p", "No requests yet. New requests will appear here."),
    );
  $("#inbox").replaceChildren();
  for (const n of dashboard.notifications) {
    const row = el("article", null, "mini-card"),
      link = el("a", n.event.split(":")[0]);
    link.href = "#booking-" + n.booking_id;
    row.append(
      link,
      el("p", new Date(n.created_at).toLocaleString()),
      button(n.read_at ? "Mark unread" : "Mark read", async () => {
        await api("read", "POST", { id: n.id, read: !n.read_at });
        await refresh();
      }),
    );
    $("#inbox").append(row);
  }
  $("#delivery-log").replaceChildren();
  for (const d of dashboard.deliveries)
    $("#delivery-log").append(
      el(
        "p",
        `${d.channel}: ${d.status} · attempts ${d.attempts}${d.last_error ? " · " + d.last_error : ""}`,
      ),
    );
  $("#settings-json").value = JSON.stringify(dashboard.settings, null, 2);
  $("#service-editor").replaceChildren();
  for (const s of dashboard.services) {
    const f = el("form"),
      l = el("label", s.name),
      t = el("textarea");
    t.rows = 8;
    t.value = JSON.stringify(s, null, 2);
    l.append(t);
    f.append(l, el("button", "Save service"));
    f.onsubmit = safe(async (e) => {
      e.preventDefault();
      await api("service", "PUT", JSON.parse(t.value));
      await refresh();
      $("#status").textContent = "Service saved.";
    });
    $("#service-editor").append(f);
  }
  const id = new URL(location.href).searchParams.get("booking");
  if (id) document.getElementById("booking-" + id)?.scrollIntoView();
}
$("#login").onsubmit = safe(async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target)),
    r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    b = await r.json();
  if (!r.ok) throw Error(b.error);
  e.target.reset();
  await refresh();
});
$("#refresh").onclick = safe(refresh);
$("#logout").onclick = safe(async () => {
  await api("logout", "POST", {});
  location.reload();
});
$("#settings-form").onsubmit = safe(async (e) => {
  e.preventDefault();
  await api("settings", "PUT", JSON.parse($("#settings-json").value));
  await refresh();
  $("#status").textContent = "Settings saved.";
});
$("#enable-push").onclick = safe(async () => {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    throw Error(
      "Web push unsupported here. On iPhone, open the installed Home Screen app.",
    );
  if (!dashboard.vapidPublicKey)
    throw Error("Configure development VAPID keys on the server first.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw Error("Notification permission was not granted.");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    const key = Uint8Array.from(
      atob(dashboard.vapidPublicKey.replaceAll("-", "+").replaceAll("_", "/")),
      (c) => c.charCodeAt(0),
    );
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
  }
  await api("subscription", "POST", subscription.toJSON());
  $("#status").textContent =
    "Subscription saved. Real-device delivery is still unverified.";
});
refresh().catch((e) => {
  if (e.status !== 401) $("#status").textContent = e.message;
});
