import { socialLinks } from "../src/social-links.js";
import { requireThat, text } from "../src/security.js";
export const reserved = (b) =>
  ["confirmed", "rescheduled", "in_progress"].includes(b.status) ||
  (b.status === "awaiting_acceptance" && b.end_ms !== null);
export const dayKey = (at, zone = "America/Chicago") =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
export function googleReviewUrl(value) {
  if (value === null || value === "") return null;
  let u;
  try {
    u = new URL(value);
  } catch {
    requireThat(false, "Invalid Google review URL");
  }
  requireThat(
    u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      [
        "google.com",
        "www.google.com",
        "search.google.com",
        "maps.google.com",
        "g.page",
        "maps.app.goo.gl",
      ].includes(u.hostname),
    "Use an official HTTPS Google review link",
  );
  return u.href;
}
export function schedule(
  settings,
  bookings,
  blocks,
  start,
  duration,
  exclude = "",
) {
  requireThat(
    settings.scheduleConfirmed && settings.serviceAreaConfirmed,
    "Confirm working hours and service area before confirming",
    409,
  );
  requireThat(
    Number.isInteger(duration) && duration > 0 && duration <= 720,
    "Set a service duration between 1 and 720 minutes",
  );
  requireThat(start > Date.now(), "Appointment must be in the future");
  const end = start + duration * 60000,
    parts = (t) =>
      Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
          timeZone: settings.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .formatToParts(t)
          .map((p) => [p.type, p.value]),
      );
  const a = parts(start),
    z = parts(end),
    day = dayKey(start, settings.timezone);
  requireThat(
    settings.workingDays.includes(a.weekday) &&
      !settings.closedDates.includes(day) &&
      day === dayKey(end, settings.timezone) &&
      Number(a.hour) * 60 + Number(a.minute) >= settings.openMinute &&
      Number(z.hour) * 60 + Number(z.minute) <= settings.closeMinute,
    "Outside working hours or on a closed date",
    409,
  );
  const buffer = settings.bufferMinutes,
    active = bookings.filter((b) => b.id !== exclude && reserved(b));
  requireThat(
    !blocks.some((b) => b.start_ms < end + buffer * 60000 && b.end_ms > start),
    "Appointment overlaps blocked time",
    409,
  );
  requireThat(
    !active.some(
      (b) =>
        start < b.end_ms + b.buffer_minutes * 60000 &&
        end + buffer * 60000 > b.start_ms,
    ),
    "Appointment overlaps another confirmed booking or travel buffer",
    409,
  );
  requireThat(
    active.filter((b) => dayKey(b.start_ms, settings.timezone) === day).length <
      settings.maxDaily,
    "Daily capacity reached",
    409,
  );
  return { end, buffer };
}
export function validateSettings(s, bookings) {
  text(s.name, "Business name", 120);
  requireThat(
    s.contact === null ||
      s.contact === undefined ||
      (typeof s.contact === "string" && s.contact.length <= 500),
    "Contact details must be text up to 500 characters",
  );
  requireThat(
    typeof s.serviceArea === "string" && s.serviceArea.length <= 500,
    "Invalid service area",
  );
  try {
    new Intl.DateTimeFormat("en", { timeZone: s.timezone }).format();
  } catch {
    requireThat(false, "Invalid timezone");
  }
  requireThat(
    Array.isArray(s.workingDays) &&
      s.workingDays.every((d) =>
        ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].includes(d),
      ),
    "Invalid working days",
  );
  requireThat(
    Array.isArray(s.closedDates) &&
      s.closedDates.every(
        (d) =>
          /^\d{4}-\d{2}-\d{2}$/.test(d) &&
          Number.isFinite(Date.parse(d)) &&
          new Date(d).toISOString().slice(0, 10) === d,
      ),
    "Invalid closed dates",
  );
  requireThat(
    Number.isInteger(s.bufferMinutes) &&
      s.bufferMinutes >= 0 &&
      s.bufferMinutes <= 240,
    "Invalid travel buffer",
  );
  requireThat(
    typeof s.scheduleConfirmed === "boolean" &&
      typeof s.serviceAreaConfirmed === "boolean",
    "Invalid confirmation flags",
  );
  if (s.scheduleConfirmed)
    requireThat(
      s.workingDays.length &&
        Number.isInteger(s.openMinute) &&
        Number.isInteger(s.closeMinute) &&
        s.openMinute >= 0 &&
        s.closeMinute <= 1440 &&
        s.closeMinute > s.openMinute &&
        Number.isInteger(s.maxDaily) &&
        s.maxDaily > 0 &&
        s.maxDaily <= 100,
      "Set working days, opening/closing times, and daily capacity",
    );
  requireThat(
    !bookings.some(
      (b) =>
        reserved(b) && s.closedDates.includes(dayKey(b.start_ms, s.timezone)),
    ),
    "Reschedule or cancel confirmed appointments before closing their date",
    409,
  );
  if (s.notificationPreferences !== undefined) {
    const p = s.notificationPreferences;
    requireThat(
      p &&
        typeof p === "object" &&
        !Array.isArray(p) &&
        typeof p.pushEnabled === "boolean" &&
        typeof p.emailEnabled === "boolean",
      "Explicit tenant notification preferences required",
    );
    requireThat(
      p.ownerEmail === null ||
        (typeof p.ownerEmail === "string" &&
          p.ownerEmail.length <= 254 &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.ownerEmail)),
      "Valid owner notification email required",
    );
    s.notificationPreferences = {
      pushEnabled: p.pushEnabled,
      emailEnabled: p.emailEnabled,
      ownerEmail: p.ownerEmail,
    };
  }
  return {
    ...s,
    socialLinks: socialLinks(s.socialLinks),
    googleReviewUrl: googleReviewUrl(s.googleReviewUrl),
  };
}
