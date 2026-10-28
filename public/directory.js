// Private owner records. Rendering uses text nodes; no customer HTML is trusted.
async function loadDirectory(kind) {
  const root = document.querySelector("#" + kind + "-list"),
    q = document.querySelector("#" + kind + "-search").value;
  root.replaceChildren();
  let result;
  try {
    result = await api(kind + "?q=" + encodeURIComponent(q));
  } catch (e) {
    if (e.status !== 404) throw e;
    root.append(
      el(
        "p",
        "Directory editing is available in the Cloudflare runtime. Booking details remain available below.",
      ),
    );
    return;
  }
  for (const row of result.records) {
    const card = el("article", null, "card"),
      form = el("form", null, "form-grid");
    card.append(el("small", row.id));
    for (const [name, value] of Object.entries(row.data)) {
      const i = field(
        form,
        name,
        name,
        name === "year" ? "number" : "text",
        value,
      );
      i.required = true;
    }
    form.append(
      button("Save record", async () => {
        const data = Object.fromEntries(new FormData(form));
        if (kind === "vehicles") data.year = Number(data.year);
        await api(kind, "PUT", { id: row.id, version: row.version, data });
        await loadDirectory(kind);
        await refresh();
      }),
    );
    card.append(form);
    root.append(card);
  }
  if (!result.records.length) root.append(el("p", "No matching records."));
  if (result.next)
    root.append(
      el("p", "Showing the first 50 matching records. Refine your search."),
    );
}
for (const kind of ["customers", "vehicles"]) {
  document.querySelector("#" + kind + "-form").onsubmit = safe(async (e) => {
    e.preventDefault();
    await loadDirectory(kind);
  });
}
function renderToday() {
  const zone = dashboard.settings.timezone || "America/Chicago";
  const day = (d) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const root = document.querySelector("#today-list");
  root.replaceChildren();
  const rows = dashboard.bookings.filter(
    (b) =>
      ["confirmed", "rescheduled", "in_progress"].includes(b.status) &&
      day(new Date(b.start_ms)) === day(new Date()),
  );
  for (const b of rows) {
    const c = JSON.parse(b.customer),
      a = el(
        "a",
        new Date(b.start_ms).toLocaleTimeString("en-US", {
          timeZone: zone,
          hour: "numeric",
          minute: "2-digit",
        }) +
          " · " +
          c.firstName +
          " " +
          c.lastName,
      );
    a.href = "#booking-" + b.id;
    const line = el("p");
    line.append(a);
    root.append(line);
  }
  if (!rows.length)
    root.append(el("p", "No confirmed appointments today · " + zone));
}
