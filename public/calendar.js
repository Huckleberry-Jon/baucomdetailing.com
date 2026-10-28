function renderCalendarControls() {
  const s = dashboard.settings,
    f = document.querySelector("#schedule-form");
  for (const name of ["serviceArea", "bufferMinutes", "maxDaily"])
    f.elements[name].value = s[name] ?? "";
  for (const name of ["scheduleConfirmed", "serviceAreaConfirmed"])
    f.elements[name].checked = s[name];
  for (const input of f.querySelectorAll("[name=workingDays]"))
    input.checked = s.workingDays.includes(input.value);
  const time = (n) =>
    n == null
      ? ""
      : `${String(Math.floor((n === 1440 ? 0 : n) / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  f.elements.open.value = time(s.openMinute);
  f.elements.close.value = time(s.closeMinute);
  f.elements.closedDates.value = s.closedDates.join(", ");
  const durations = document.querySelector("#duration-controls");
  durations.replaceChildren();
  for (const service of dashboard.services) {
    const form = el("form", null, "duration-row");
    const input = field(
      form,
      service.name + " duration (minutes)",
      "duration",
      "number",
      service.durationMinutes ?? "",
    );
    input.min = 1;
    input.max = 720;
    form.append(el("button", "Save duration"));
    form.onsubmit = safe(async (e) => {
      e.preventDefault();
      await api("service", "PUT", {
        ...service,
        durationMinutes: input.value ? Number(input.value) : null,
      });
      await refresh();
    });
    durations.append(form);
  }
}
async function loadCalendar() {
  const month = document.querySelector("#calendar-month").value;
  if (!/^\d{4}-\d{2}$/.test(month)) return;
  const from = month + "-01",
    end = new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
    )
      .toISOString()
      .slice(0, 10);
  const data = await api(`calendar?from=${from}&to=${end}`),
    root = document.querySelector("#calendar-days");
  root.replaceChildren();
  const key = (ms) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(ms),
    clock = (ms) =>
      new Date(ms).toLocaleTimeString("en-US", {
        timeZone: "America/Chicago",
        hour: "numeric",
        minute: "2-digit",
      });
  for (let day = 1; day <= Number(end.slice(-2)); day++) {
    const date = month + "-" + String(day).padStart(2, "0"),
      section = el("article", null, "calendar-day"),
      weekday = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
        timeZone: "America/Chicago",
        weekday: "short",
      });
    const closed =
      data.settings.closedDates.includes(date) ||
      !data.settings.workingDays.includes(weekday);
    section.append(
      el("h3", date + " · " + weekday),
      el(
        "small",
        !data.settings.scheduleConfirmed
          ? "Hours unconfirmed"
          : closed
            ? "Closed / unavailable"
            : `${Math.floor(data.settings.openMinute / 60)}:${String(data.settings.openMinute % 60).padStart(2, "0")}–${Math.floor(data.settings.closeMinute / 60)}:${String(data.settings.closeMinute % 60).padStart(2, "0")}`,
      ),
    );
    if (closed) section.classList.add("closed");
    for (const b of data.bookings) {
      if (key(b.start_ms) === date) {
        const a = el(
          "a",
          `${clock(b.start_ms)}${b.end_ms ? "–" + clock(b.end_ms) : " · duration pending"} · ${b.customer.firstName} ${b.customer.lastName} · ${b.status.replaceAll("_", " ")}`,
          "calendar-entry " + b.status,
        );
        a.href = "#booking-" + b.id;
        a.onclick = safe(async (e) => {
          if (!document.getElementById("booking-" + b.id)) {
            e.preventDefault();
            location.href = "/owner?booking=" + b.id;
          }
        });
        section.append(a);
      }
      if (
        b.status === "awaiting_acceptance" &&
        b.proposal &&
        key(b.proposal.startAt) === date
      )
        section.append(
          el(
            "p",
            `${clock(b.proposal.startAt)} · Proposed to ${b.customer.firstName} · not reserved`,
            "proposed",
          ),
        );
    }
    for (const block of data.blocks) {
      if (key(block.start_ms) <= date && key(block.end_ms - 1) >= date) {
        const row = el("div", null, "blocked");
        row.append(
          el(
            "span",
            `${block.label} · ${new Date(block.start_ms).toLocaleString("en-US", { timeZone: "America/Chicago" })}–${new Date(block.end_ms).toLocaleString("en-US", { timeZone: "America/Chicago" })}`,
          ),
          button("Unblock", async () => {
            await api("block", "DELETE", { id: block.id });
            await loadCalendar();
          }),
        );
        section.append(row);
      }
    }
    root.append(section);
  }
}
document.querySelector("#calendar-month").value = new Intl.DateTimeFormat(
  "en-CA",
  { timeZone: "America/Chicago", year: "numeric", month: "2-digit" },
).format(Date.now());
document.querySelector("#calendar-month").onchange = safe(loadCalendar);
document.querySelector("#block-form").onsubmit = safe(async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  await api("block", "POST", {
    label: d.label,
    startAt: new Date(d.startAt).toISOString(),
    endAt: new Date(d.endAt).toISOString(),
  });
  e.target.reset();
  await loadCalendar();
});
document.querySelector("#schedule-form").onsubmit = safe(async (e) => {
  e.preventDefault();
  const f = new FormData(e.target),
    minute = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  await api("settings", "PUT", {
    ...dashboard.settings,
    serviceArea: f.get("serviceArea"),
    bufferMinutes: Number(f.get("bufferMinutes")),
    maxDaily: Number(f.get("maxDaily")),
    openMinute: f.get("open") ? minute(f.get("open")) : null,
    closeMinute: f.get("close")
      ? f.get("close") === "00:00"
        ? 1440
        : minute(f.get("close"))
      : null,
    workingDays: f.getAll("workingDays"),
    closedDates: f
      .get("closedDates")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    scheduleConfirmed: f.has("scheduleConfirmed"),
    serviceAreaConfirmed: f.has("serviceAreaConfirmed"),
  });
  await refresh();
  document.querySelector("#status").textContent = "Schedule saved.";
});
