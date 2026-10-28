import { randomUUID } from "node:crypto";
import { BUSINESS } from "./catalog.js";
import { transaction } from "./db.js";
import { requireThat, text } from "./security.js";
export const dateKey = (ms) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
export function validDay(day) {
  return (
    typeof day === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day)) &&
    new Date(day).toISOString().slice(0, 10) === day
  );
}
export function calendar(service, from, to) {
  requireThat(validDay(from) && validDay(to), "Valid calendar dates required");
  const begin = Date.parse(from),
    finish = Date.parse(to);
  requireThat(
    finish >= begin && finish - begin <= 62 * 86400000,
    "Calendar range must be 0–62 days",
  );
  const db = service.db;
  const bookings = db
    .prepare(
      "SELECT b.id,b.status,b.start_ms,b.end_ms,b.buffer_minutes,b.snapshot,b.proposal,c.data customer FROM bookings b JOIN customers c ON c.id=b.customer_id WHERE b.business_id=? AND ((b.start_ms>=? AND b.start_ms<?) OR b.status='awaiting_acceptance')",
    )
    .all(BUSINESS, begin - 86400000, finish + 2 * 86400000)
    .filter((b) => {
      const day = dateKey(b.start_ms),
        p = b.proposal ? dateKey(JSON.parse(b.proposal).startAt) : null;
      return (day >= from && day <= to) || (p && p >= from && p <= to);
    })
    .map((b) => ({
      ...b,
      customer: JSON.parse(b.customer),
      snapshot: JSON.parse(b.snapshot),
      proposal: b.proposal ? JSON.parse(b.proposal) : null,
    }));
  return {
    from,
    to,
    settings: service.settings(),
    bookings,
    blocks: db
      .prepare(
        "SELECT * FROM schedule_blocks WHERE business_id=? AND start_ms<? AND end_ms>?",
      )
      .all(BUSINESS, finish + 2 * 86400000, begin - 86400000),
  };
}
export function addBlock(service, input) {
  const start = Date.parse(input.startAt),
    end = Date.parse(input.endAt),
    label = text(input.label, "Block label", 120);
  requireThat(
    Number.isFinite(start) &&
      Number.isFinite(end) &&
      end > start &&
      end - start <= 366 * 86400000,
    "Invalid blocked interval",
  );
  return transaction(service.db, () => {
    const conflict = service.db
      .prepare(
        "SELECT id FROM bookings WHERE business_id=? AND (status IN ('confirmed','rescheduled','in_progress') OR(status='awaiting_acceptance' AND end_ms IS NOT NULL)) AND start_ms<? AND end_ms+buffer_minutes*60000>? LIMIT 1",
      )
      .get(BUSINESS, end, start);
    requireThat(
      !conflict,
      "Reschedule or cancel the confirmed appointment before blocking this time",
      409,
    );
    const id = randomUUID();
    service.db
      .prepare("INSERT INTO schedule_blocks VALUES(?,?,?,?,?,?)")
      .run(id, BUSINESS, start, end, label, Date.now());
    return { id };
  });
}
export function availability(service, day, packageId, addonIds = []) {
  requireThat(validDay(day), "Invalid requested day");
  requireThat(
    Date.parse(day) >= Date.now() - 2 * 86400000 &&
      Date.parse(day) < Date.now() + 366 * 86400000,
    "Date outside booking window",
  );
  const catalog = service.catalog(),
    p = catalog.find(
      (s) => s.id === packageId && s.kind === "package" && s.enabled,
    );
  requireThat(p, "Choose an available package");
  requireThat(
    Array.isArray(addonIds) && addonIds.length <= 20,
    "Invalid add-ons",
  );
  const add = [...new Set(addonIds)].map((id) => {
    const s = catalog.find(
      (a) =>
        a.id === id &&
        a.kind === "addon" &&
        a.enabled &&
        a.packageIds.includes(packageId),
    );
    requireThat(s, "Invalid add-on");
    return s;
  });
  const selected = [p, ...add];
  if (
    selected.some(
      (s) => !Number.isInteger(s.durationMinutes) || s.durationMinutes <= 0,
    )
  )
    return {
      slots: [],
      needsDuration: true,
      message:
        "Service durations are awaiting confirmation. You may submit a preferred time for owner review.",
    };
  const duration = selected.reduce((n, s) => n + s.durationMinutes, 0);
  requireThat(
    duration <= 720,
    "Combined service duration exceeds one appointment",
  );
  if (
    !service.settings().scheduleConfirmed ||
    !service.settings().serviceAreaConfirmed
  )
    return {
      slots: [],
      needsConfiguration: true,
      message:
        "Business availability is awaiting confirmation. You may request a preferred time.",
    };
  const slots = [];
  for (
    let at = Date.parse(day + "T00:00:00Z");
    at < Date.parse(day + "T00:00:00Z") + 48 * 3600000;
    at += 30 * 60000
  ) {
    if (dateKey(at) !== day || at <= Date.now()) continue;
    try {
      service.schedule(at, duration, "");
      slots.push(new Date(at).toISOString());
    } catch (e) {
      if (e.status !== 409 && e.status !== 400) throw e;
    }
  }
  return {
    slots,
    durationMinutes: duration,
    timezone: "America/Chicago",
    message:
      "Times are requests, not reservations. Availability is rechecked on confirmation.",
  };
}
