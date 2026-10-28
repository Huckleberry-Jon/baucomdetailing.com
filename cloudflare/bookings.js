import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { hash, token, text, requireThat } from "../src/security.js";
import { notice } from "../src/catalog.js";
import { TenantRepository } from "./repository.js";
import { schedule, validateSettings, reserved, dayKey } from "./domain.js";
export class CloudBookings extends TenantRepository {
  async settings() {
    return JSON.parse(
      (
        await this.first(
          "SELECT settings FROM businesses WHERE id=?",
          this.tenant,
        )
      ).settings,
    );
  }
  async catalog() {
    return (
      await this.all("SELECT * FROM services WHERE business_id=? ORDER BY rowid", this.tenant)
    ).map((s) => ({ ...JSON.parse(s.data), version: s.version }));
  }
  async get(id) {
    const b = await this.first(
      "SELECT * FROM bookings WHERE id=? AND business_id=?",
      id,
      this.tenant,
    );
    requireThat(b, "Booking not found", 404);
    return b;
  }
  view(b) {
    return {
      id: b.id,
      status: b.status,
      requestedAt: new Date(b.start_ms).toISOString(),
      snapshot: JSON.parse(b.snapshot),
      proposal: b.proposal ? JSON.parse(b.proposal) : null,
      version: b.version,
    };
  }
  async customerToken(b) {
    const t = await this.first(
      "SELECT link_key FROM businesses WHERE id=?",
      this.tenant,
    );
    return (
      "v1." +
      createHmac("sha256", t.link_key)
        .update(b.business_id + ":" + b.id + ":" + b.access_expires)
        .digest("base64url")
    );
  }
  async authorizeCustomer(id, secret) {
    const b = await this.get(id),
      expected = await this.customerToken(b);
    requireThat(
      typeof secret === "string" &&
        b.access_expires > Date.now() &&
        (hash(secret) === b.access_hash ||
          (secret.length === expected.length &&
            timingSafeEqual(Buffer.from(secret), Buffer.from(expected)))),
      "Link invalid or expired",
      403,
    );
    return b;
  }
  event(commands, id, event, actor, data = {}) {
    const eid = randomUUID(),
      now = Date.now();
    commands.push(
      this.command(
        "INSERT INTO history VALUES(?,?,?,?,?,?,?)",
        eid,
        this.tenant,
        id,
        actor,
        event,
        JSON.stringify(data),
        now,
      ),
      this.command(
        "INSERT INTO notifications(id,business_id,booking_id,event,read_at,created_at) VALUES(?,?,?,?,NULL,?)",
        eid,
        this.tenant,
        id,
        event + ":" + eid,
        now,
      ),
    );
  }
  async context() {
    const [bookings, blocks] = await Promise.all([
      this.all("SELECT * FROM bookings WHERE business_id=?", this.tenant),
      this.all(
        "SELECT * FROM schedule_blocks WHERE business_id=?",
        this.tenant,
      ),
    ]);
    return { bookings, blocks };
  }
  async create(input, key, photos = []) {
    text(key, "Idempotency key", 100);
    requireThat(!input.website, "Request rejected");
    requireThat(input.acceptNotice === true, "Accept the pricing notice");
    const digest = hash(JSON.stringify(input));
    return this.atomic(async (business, commands) => {
      const existing = await this.first(
        "SELECT * FROM bookings WHERE business_id=? AND idempotency_key=?",
        this.tenant,
        key,
      );
      if (existing) {
        requireThat(
          existing.request_hash === digest,
          "Submission key already used for a different request",
          409,
        );
        return { ...this.view(existing), duplicate: true };
      }
      const catalog = await this.catalog(),
        selected = catalog.find(
          (p) => p.id === input.packageId && p.kind === "package" && p.enabled,
        );
      requireThat(selected, "Choose an available package");
      requireThat(
        Array.isArray(input.addonIds) && input.addonIds.length <= 20,
        "Invalid add-ons",
      );
      const addons = [...new Set(input.addonIds)].map((id) => {
        const a = catalog.find(
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
      const start = Date.parse(input.requestedAt),
        now = Date.now();
      requireThat(
        Number.isFinite(start) && start > now && start < now + 366 * 86400000,
        "Request a date within the next year",
      );
      const concerns = typeof input.concerns === "string" ? input.concerns : "";
      requireThat(concerns.length <= 3000, "Condition notes too long");
      const id = randomUUID(),
        cid = randomUUID(),
        vid = randomUUID(),
        secret = token(),
        snapshot = {
          package: selected,
          addons,
          notice,
          estimatedMin:
            selected.min + addons.reduce((n, a) => n + (a.min ?? 0), 0),
          estimatedMax: addons.some((a) => a.max === null)
            ? null
            : selected.max + addons.reduce((n, a) => n + a.max, 0),
        };
      commands.push(
        this.command(
          "INSERT INTO customers VALUES(?,?,?)",
          cid,
          this.tenant,
          JSON.stringify(customer),
        ),
        this.command(
          "INSERT INTO vehicles VALUES(?,?,?,?)",
          vid,
          this.tenant,
          cid,
          JSON.stringify(vehicle),
        ),
        this.command(
          "INSERT INTO bookings(id,business_id,customer_id,vehicle_id,idempotency_key,request_hash,status,start_ms,snapshot,data,access_hash,access_expires,created_at) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?,?)",
          id,
          this.tenant,
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
        ),
      );
      this.mediaCommands(
        commands,
        { id, customer_id: cid, vehicle_id: vid },
        photos,
        "intake",
        null,
      );
      this.event(commands, id, "booking.requested", "customer", {
        noticeAcceptedAt: now,
      });
      return {
        id,
        status: "pending",
        requestedAt: new Date(start).toISOString(),
        snapshot,
        proposal: null,
        version: 1,
        accessToken: secret,
      };
    });
  }
  mediaCommands(commands, b, photos, kind, jobId) {
    for (const p of photos)
      commands.push(
        this.command(
          "INSERT OR IGNORE INTO media(id,business_id,booking_id,customer_id,vehicle_id,job_id,kind,filename,original_mime,original_key,preview_key,sha256,original_bytes,preview_bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          randomUUID(),
          this.tenant,
          b.id,
          b.customer_id,
          b.vehicle_id,
          jobId,
          kind,
          p.filename,
          p.mime,
          p.original_key,
          p.preview_key,
          p.sha,
          p.original_bytes,
          p.preview_bytes,
          Date.now(),
        ),
      );
  }
  async transition(id, action, input, actor = "owner") {
    return this.atomic(async (business, commands) => {
      const b = await this.get(id);
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
      const settings = JSON.parse(business.settings),
        ctx = await this.context();
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
        schedule(settings, ctx.bookings, ctx.blocks, at, duration, id);
        proposal = JSON.stringify({
          startAt: at,
          durationMinutes: duration,
          priceCents: price,
          previousStatus: status,
        });
        status = "awaiting_acceptance";
      } else if (["confirm", "accept"].includes(action)) {
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
        ({ end, buffer } = schedule(
          settings,
          ctx.bookings,
          ctx.blocks,
          start,
          duration,
          id,
        ));
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
      commands.push(
        this.command(
          "UPDATE bookings SET status=?,start_ms=?,end_ms=?,buffer_minutes=?,proposal=?,version=version+1 WHERE id=? AND business_id=?",
          status,
          start,
          end,
          buffer,
          proposal,
          id,
          this.tenant,
        ),
      );
      if (["confirmed", "rescheduled"].includes(status)) {
        commands.push(
          this.command(
            "INSERT OR IGNORE INTO jobs VALUES(?,?,?,?,?,?)",
            randomUUID(),
            this.tenant,
            id,
            b.customer_id,
            b.vehicle_id,
            Date.now(),
          ),
          this.command(
            "UPDATE media SET job_id=(SELECT id FROM jobs WHERE booking_id=? AND business_id=?) WHERE booking_id=? AND business_id=?",
            id,
            this.tenant,
            id,
            this.tenant,
          ),
        );
      }
      this.event(commands, id, "booking." + action, actor, {
        from: b.status,
        to: status,
        start_ms: start,
        proposal: proposal ? JSON.parse(proposal) : null,
      });
      return this.view({
        ...b,
        status,
        start_ms: start,
        end_ms: end,
        buffer_minutes: buffer,
        proposal,
        version: b.version + 1,
      });
    });
  }
  async updateSettings(input, actor) {
    return this.atomic(async (business, commands) => {
      const ctx = await this.context(),
        s = validateSettings({ ...input }, ctx.bookings);
      commands.push(
        this.command(
          "UPDATE businesses SET settings=? WHERE id=?",
          JSON.stringify(s),
          this.tenant,
        ),
      );
      this.audit(commands, actor, "settings.updated", this.tenant);
      return s;
    });
  }
  async addBlock(input, actor) {
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
    return this.atomic(async (b, commands) => {
      const { bookings } = await this.context();
      requireThat(
        !bookings.some(
          (b) =>
            reserved(b) &&
            b.start_ms < end &&
            b.end_ms + b.buffer_minutes * 60000 > start,
        ),
        "Reschedule or cancel the confirmed appointment before blocking this time",
        409,
      );
      const id = randomUUID();
      commands.push(
        this.command(
          "INSERT INTO schedule_blocks VALUES(?,?,?,?,?,?)",
          id,
          this.tenant,
          start,
          end,
          label,
          Date.now(),
        ),
      );
      this.audit(commands, actor, "calendar.blocked", id);
      return { id };
    });
  }
  async calendar(from, to) {
    requireThat(
      /^\d{4}-\d{2}-\d{2}$/.test(from) &&
        /^\d{4}-\d{2}-\d{2}$/.test(to) &&
        Number.isFinite(Date.parse(from)) &&
        Number.isFinite(Date.parse(to)) &&
        to >= from &&
        Date.parse(to) - Date.parse(from) <= 62 * 86400000,
      "Calendar range must be 0–62 days",
    );
    const settings = await this.settings(),
      bookings = (
        await this.all(
          "SELECT b.*,c.data customer FROM bookings b JOIN customers c ON c.id=b.customer_id AND c.business_id=b.business_id WHERE b.business_id=?",
          this.tenant,
        )
      )
        .filter((b) => {
          const day = dayKey(b.start_ms, settings.timezone),
            p = b.proposal
              ? dayKey(JSON.parse(b.proposal).startAt, settings.timezone)
              : null;
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
      settings,
      bookings,
      blocks: await this.all(
        "SELECT * FROM schedule_blocks WHERE business_id=? AND start_ms<? AND end_ms>?",
        this.tenant,
        Date.parse(to) + 2 * 86400000,
        Date.parse(from) - 86400000,
      ),
    };
  }
  async availability(day, packageId, addonIds = []) {
    requireThat(
      /^\d{4}-\d{2}-\d{2}$/.test(day) &&
        Number.isFinite(Date.parse(day)) &&
        new Date(day).toISOString().slice(0, 10) === day,
      "Invalid requested day",
    );
    requireThat(
      Date.parse(day) >= Date.now() - 2 * 86400000 &&
        Date.parse(day) < Date.now() + 366 * 86400000,
      "Date outside booking window",
    );
    const catalog = await this.catalog(),
      p = catalog.find(
        (s) => s.id === packageId && s.kind === "package" && s.enabled,
      );
    requireThat(p, "Choose an available package");
    requireThat(
      Array.isArray(addonIds) && addonIds.length <= 20,
      "Invalid add-ons",
    );
    const selected = [
      p,
      ...[...new Set(addonIds)].map((id) => {
        const a = catalog.find(
          (s) =>
            s.id === id &&
            s.kind === "addon" &&
            s.enabled &&
            s.packageIds.includes(packageId),
        );
        requireThat(a, "Invalid add-on");
        return a;
      }),
    ];
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
    const settings = await this.settings();
    if (!settings.scheduleConfirmed || !settings.serviceAreaConfirmed)
      return {
        slots: [],
        needsConfiguration: true,
        message:
          "Business availability is awaiting confirmation. You may request a preferred time.",
      };
    const ctx = await this.context(),
      slots = [];
    for (
      let at = Date.parse(day);
      at < Date.parse(day) + 48 * 3600000;
      at += 30 * 60000
    ) {
      if (at <= Date.now() || dayKey(at, settings.timezone) !== day) continue;
      try {
        schedule(settings, ctx.bookings, ctx.blocks, at, duration);
        slots.push(new Date(at).toISOString());
      } catch (e) {
        if (![400, 409].includes(e.status)) throw e;
      }
    }
    return {
      slots,
      durationMinutes: duration,
      timezone: settings.timezone,
      message:
        "Times are requests, not reservations. Availability is rechecked on confirmation.",
    };
  }
}
