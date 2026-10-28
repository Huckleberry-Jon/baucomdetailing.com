import { googleReviewUrl } from "./reviews.js";
import { storePhotos } from "./media.js";
import { randomUUID } from "node:crypto";
import { transaction } from "./db.js";
import { BUSINESS, notice } from "./catalog.js";
import { hash, token, text, requireThat } from "./security.js";
import { validCustomerToken } from "./customer-links.js";
export class BookingService {
  constructor(db) {
    this.db = db;
  }
  settings() {
    return JSON.parse(
      this.db
        .prepare("SELECT settings FROM businesses WHERE id=?")
        .get(BUSINESS).settings,
    );
  }
  catalog() {
    return this.db
      .prepare("SELECT * FROM services WHERE business_id=?")
      .all(BUSINESS)
      .map((s) => ({ ...JSON.parse(s.data), version: s.version }));
  }
  event(id, event, actor, data = {}) {
    const now = Date.now(),
      eid = randomUUID();
    this.db
      .prepare("INSERT INTO history VALUES(?,?,?,?,?,?,?)")
      .run(eid, BUSINESS, id, actor, event, JSON.stringify(data), now);
    this.db
      .prepare("INSERT INTO notifications VALUES(?,?,?,?,NULL,?)")
      .run(eid, BUSINESS, id, event + ":" + eid, now);
    return eid;
  }
  get(id) {
    const b = this.db
      .prepare("SELECT * FROM bookings WHERE id=? AND business_id=?")
      .get(id, BUSINESS);
    requireThat(b, "Booking not found", 404);
    return b;
  }
  publicView(b) {
    return {
      id: b.id,
      status: b.status,
      requestedAt: new Date(b.start_ms).toISOString(),
      snapshot: JSON.parse(b.snapshot),
      proposal: b.proposal ? JSON.parse(b.proposal) : null,
      version: b.version,
    };
  }
  authorizeCustomer(id, secret) {
    const b = this.get(id);
    requireThat(
      typeof secret === "string" &&
        b.access_expires > Date.now() &&
        (hash(secret) === b.access_hash ||
          validCustomerToken(this.db, b, secret)),
      "Link invalid or expired",
      403,
    );
    return b;
  }
  create(input, key, photos = []) {
    text(key, "Idempotency key", 100);
    requireThat(!input.website, "Request rejected");
    requireThat(input.acceptNotice === true, "Accept the pricing notice");
    const digest = hash(JSON.stringify(input));
    return transaction(this.db, () => {
      const existing = this.db
        .prepare(
          "SELECT * FROM bookings WHERE business_id=? AND idempotency_key=?",
        )
        .get(BUSINESS, key);
      if (existing) {
        requireThat(
          existing.request_hash === digest,
          "Submission key already used for a different request",
          409,
        );
        return { ...this.publicView(existing), duplicate: true };
      }
      const selected = this.catalog().find(
        (p) => p.id === input.packageId && p.kind === "package" && p.enabled,
      );
      requireThat(selected, "Choose an available package");
      requireThat(
        Array.isArray(input.addonIds) && input.addonIds.length <= 20,
        "Invalid add-ons",
      );
      const add = [...new Set(input.addonIds)].map((id) => {
        const a = this.catalog().find(
          (p) => p.id === id && p.kind === "addon" && p.enabled,
        );
        requireThat(
          a && a.packageIds.includes(selected.id),
          "Add-on unavailable for this package",
        );
        return a;
      });
      const customer = {
        firstName: text(input.firstName, "First name", 100),
        lastName: text(input.lastName, "Last name", 100),
        phone: text(input.phone, "Phone", 40),
        email: text(input.email, "Email", 254),
        address: text(input.address, "Service address", 500),
      };
      requireThat(
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email),
        "Enter a valid email",
      );
      requireThat(
        customer.phone.replace(/\D/g, "").length >= 10,
        "Enter a valid phone",
      );
      const vehicle = {
        year: Number(input.year),
        make: text(input.make, "Make", 100),
        model: text(input.model, "Model", 100),
        color: text(input.color, "Color", 80),
        bodyType: text(input.bodyType, "Body type", 80),
      };
      requireThat(
        Number.isInteger(vehicle.year) &&
          vehicle.year >= 1900 &&
          vehicle.year <= new Date().getFullYear() + 2,
        "Invalid vehicle year",
      );
      const start = Date.parse(input.requestedAt);
      requireThat(
        Number.isFinite(start) &&
          start > Date.now() &&
          start < Date.now() + 366 * 86400000,
        "Request a date within the next year",
      );
      const concerns = typeof input.concerns === "string" ? input.concerns : "";
      requireThat(concerns.length <= 3000, "Condition notes too long");
      const id = randomUUID(),
        cid = randomUUID(),
        vid = randomUUID(),
        secret = token(),
        now = Date.now();
      const snapshot = {
        package: selected,
        addons: add,
        notice,
        estimatedMin: selected.min + add.reduce((n, a) => n + (a.min ?? 0), 0),
        estimatedMax: add.some((a) => a.max === null)
          ? null
          : selected.max + add.reduce((n, a) => n + a.max, 0),
      };
      this.db
        .prepare("INSERT INTO customers VALUES(?,?,?)")
        .run(cid, BUSINESS, JSON.stringify(customer));
      this.db
        .prepare("INSERT INTO vehicles VALUES(?,?,?,?)")
        .run(vid, BUSINESS, cid, JSON.stringify(vehicle));
      this.db
        .prepare(
          "INSERT INTO bookings(id,business_id,customer_id,vehicle_id,idempotency_key,request_hash,status,start_ms,snapshot,data,access_hash,access_expires,created_at) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?,?)",
        )
        .run(
          id,
          BUSINESS,
          cid,
          vid,
          key,
          digest,
          start,
          JSON.stringify(snapshot),
          JSON.stringify({
            concerns,
            location: customer.address,
            noticeAcceptedAt: now,
          }),
          hash(secret),
          now + 30 * 86400000,
          now,
        );
      storePhotos(this.db, this.get(id), photos);
      this.event(id, "booking.requested", "customer", {
        noticeAcceptedAt: now,
      });
      return { ...this.publicView(this.get(id)), accessToken: secret };
    });
  }
  schedule(start, duration, exclude) {
    const s = this.settings();
    requireThat(
      s.scheduleConfirmed && s.serviceAreaConfirmed,
      "Confirm working hours and service area in settings before confirming appointments",
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
            timeZone: s.timezone,
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
      day = `${a.year}-${a.month}-${a.day}`,
      minute = Number(a.hour) * 60 + Number(a.minute);
    requireThat(
      s.workingDays.includes(a.weekday) &&
        !s.closedDates.includes(day) &&
        day === `${z.year}-${z.month}-${z.day}` &&
        minute >= s.openMinute &&
        Number(z.hour) * 60 + Number(z.minute) <= s.closeMinute,
      "Outside working hours or on a closed date",
      409,
    );
    const blocked = this.db
      .prepare(
        "SELECT id FROM schedule_blocks WHERE business_id=? AND start_ms<? AND end_ms>? LIMIT 1",
      )
      .get(BUSINESS, end + s.bufferMinutes * 60000, start);
    requireThat(!blocked, "Appointment overlaps blocked time", 409);
    const active = this.db
      .prepare(
        "SELECT * FROM bookings WHERE business_id=? AND id!=? AND (status IN ('confirmed','rescheduled','in_progress') OR (status='awaiting_acceptance' AND end_ms IS NOT NULL))",
      )
      .all(BUSINESS, exclude);
    requireThat(
      !active.some(
        (b) =>
          start < b.end_ms + b.buffer_minutes * 60000 &&
          end + s.bufferMinutes * 60000 > b.start_ms,
      ),
      "Appointment overlaps another confirmed booking or travel buffer",
      409,
    );
    requireThat(
      active.filter((b) => {
        const p = parts(b.start_ms);
        return `${p.year}-${p.month}-${p.day}` === day;
      }).length < s.maxDaily,
      "Daily capacity reached",
      409,
    );
    return { end, buffer: s.bufferMinutes };
  }
  transition(id, action, input, actor = "owner") {
    return transaction(this.db, () => {
      const b = this.get(id);
      requireThat(
        input.version === b.version,
        "Booking changed; refresh before trying again",
        409,
      );
      let status = b.status,
        start = b.start_ms,
        end = b.end_ms,
        buffer = b.buffer_minutes,
        proposal = b.proposal;
      if (action === "propose") {
        requireThat(
          actor === "owner" &&
            [
              "pending",
              "confirmed",
              "rescheduled",
              "awaiting_acceptance",
            ].includes(status),
          "Cannot propose now",
          409,
        );
        const at = Date.parse(input.startAt),
          duration = Number(input.durationMinutes),
          price = input.priceCents;
        requireThat(
          Number.isFinite(at) && Number.isSafeInteger(price) && price >= 0,
          "Enter a valid time and price",
        );
        this.schedule(at, duration, id);
        proposal = JSON.stringify({
          startAt: at,
          durationMinutes: duration,
          priceCents: price,
          previousStatus: status,
        });
        status = "awaiting_acceptance";
      } else if (action === "confirm" || action === "accept") {
        requireThat(
          action === "accept"
            ? actor === "customer" && status === "awaiting_acceptance"
            : actor === "owner" && status === "pending",
          "Invalid confirmation",
          409,
        );
        let duration = Number(input.durationMinutes);
        if (action === "accept") {
          const p = JSON.parse(proposal);
          start = p.startAt;
          duration = p.durationMinutes;
        }
        const slot = this.schedule(start, duration, id);
        end = slot.end;
        buffer = slot.buffer;
        status = action === "accept" ? "rescheduled" : "confirmed";
      } else if (action === "cancel") {
        requireThat(
          [
            "pending",
            "awaiting_acceptance",
            "confirmed",
            "rescheduled",
          ].includes(status),
          "Cannot cancel this booking",
          409,
        );
        status = "cancelled";
      } else if (action === "start") {
        requireThat(
          actor === "owner" && ["confirmed", "rescheduled"].includes(status),
          "Cannot start this booking",
          409,
        );
        status = "in_progress";
      } else if (action === "complete") {
        requireThat(
          actor === "owner" && status === "in_progress",
          "Cannot complete this booking",
          409,
        );
        status = "completed";
      } else if (action === "no_show") {
        requireThat(
          actor === "owner" &&
            ["confirmed", "rescheduled"].includes(status) &&
            start <= Date.now(),
          "Cannot mark no-show",
          409,
        );
        status = "no_show";
      } else requireThat(false, "Unknown action");
      this.db
        .prepare(
          "UPDATE bookings SET status=?,start_ms=?,end_ms=?,buffer_minutes=?,proposal=?,version=version+1 WHERE id=? AND business_id=?",
        )
        .run(status, start, end, buffer, proposal, id, BUSINESS);
      if (["confirmed", "rescheduled"].includes(status)) {
        this.db
          .prepare("INSERT OR IGNORE INTO jobs VALUES(?,?,?,?,?,?)")
          .run(
            randomUUID(),
            BUSINESS,
            id,
            b.customer_id,
            b.vehicle_id,
            Date.now(),
          );
        this.db
          .prepare(
            "UPDATE media SET job_id=(SELECT id FROM jobs WHERE booking_id=?) WHERE booking_id=? AND business_id=?",
          )
          .run(id, id, BUSINESS);
      }
      this.event(id, "booking." + action, actor, {
        from: b.status,
        to: status,
        start_ms: start,
        proposal: proposal ? JSON.parse(proposal) : null,
      });
      return this.publicView(this.get(id));
    });
  }
  updateSettings(s) {
    requireThat(
      s.timezone === "America/Chicago",
      "Use America/Chicago timezone",
    );
    requireThat(
      typeof s.name === "string" && s.name.length > 0 && s.name.length <= 120,
      "Business name required",
    );
    requireThat(
      typeof s.serviceArea === "string" && s.serviceArea.length <= 500,
      "Invalid service area",
    );
    requireThat(
      Array.isArray(s.workingDays) &&
        s.workingDays.every((d) =>
          ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].includes(d),
        ),
      "Invalid working days",
    );
    requireThat(
      Array.isArray(s.closedDates) &&
        s.closedDates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
      "Invalid closed dates",
    );
    requireThat(
      Number.isInteger(s.bufferMinutes) &&
        s.bufferMinutes >= 0 &&
        s.bufferMinutes <= 240,
      "Invalid travel buffer",
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
      typeof s.scheduleConfirmed === "boolean" &&
        typeof s.serviceAreaConfirmed === "boolean",
      "Invalid confirmation flags",
    );
    requireThat(
      s.googleReviewUrl === null ||
        (typeof s.googleReviewUrl === "string" &&
          /^https:\/\//.test(s.googleReviewUrl) &&
          s.googleReviewUrl.length <= 1000),
      "Review URL must use HTTPS",
    );
    const confirmed = this.db
      .prepare(
        "SELECT start_ms FROM bookings WHERE business_id=? AND (status IN ('confirmed','rescheduled','in_progress') OR(status='awaiting_acceptance' AND end_ms IS NOT NULL))",
      )
      .all(BUSINESS);
    for (const b of confirmed) {
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(b.start_ms);
      requireThat(
        !s.closedDates.includes(day),
        "Reschedule or cancel confirmed appointments before closing their date",
        409,
      );
    }
    s.googleReviewUrl = googleReviewUrl(s.googleReviewUrl);
    this.db
      .prepare("UPDATE businesses SET settings=? WHERE id=?")
      .run(JSON.stringify(s), BUSINESS);
    return s;
  }
}
