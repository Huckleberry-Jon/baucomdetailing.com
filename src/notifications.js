import webpush from "web-push";
import { Webhook } from "svix";
import { randomUUID } from "node:crypto";
import { BUSINESS } from "./catalog.js";
import { requireThat, Problem, hash } from "./security.js";
import { transaction } from "./db.js";
import { customerLink } from "./customer-links.js";
export function validateSubscription(s) {
  requireThat(
    s &&
      typeof s.endpoint === "string" &&
      s.endpoint.length < 2000 &&
      s.keys &&
      typeof s.keys.auth === "string" &&
      typeof s.keys.p256dh === "string",
    "Invalid push subscription",
  );
  let u;
  try {
    u = new URL(s.endpoint);
  } catch {
    throw new Problem(400, "Invalid push endpoint");
  }
  requireThat(
    u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      ([
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].includes(u.hostname) ||
        u.hostname.endsWith(".push.apple.com")),
    "Unsupported push service",
  );
  requireThat(
    /^[\w-]{20,30}$/.test(s.keys.auth) && /^[\w-]{80,100}$/.test(s.keys.p256dh),
    "Invalid subscription keys",
  );
  requireThat(
    s.expirationTime == null ||
      (Number.isFinite(s.expirationTime) && s.expirationTime > Date.now()),
    "Subscription expired",
  );
}
export function saveSubscription(db, body, owner, key) {
  const { subscription, replaces } = body.subscription
    ? body
    : { subscription: body };
  validateSubscription(subscription);
  return transaction(db, () => {
    let s = db
      .prepare(
        "SELECT id FROM subscriptions WHERE endpoint=? AND business_id=?",
      )
      .get(subscription.endpoint, BUSINESS);
    const id = s?.id ?? randomUUID(),
      now = Date.now();
    db.prepare(
      "INSERT INTO subscriptions VALUES(?,?,?,?,1) ON CONFLICT(endpoint) DO UPDATE SET data=excluded.data,active=1",
    ).run(id, BUSINESS, subscription.endpoint, JSON.stringify(subscription));
    db.prepare(
      "INSERT INTO subscription_meta VALUES(?,?,?,?,?,?) ON CONFLICT(subscription_id) DO UPDATE SET owner_id=excluded.owner_id,last_seen=excluded.last_seen,expires_at=excluded.expires_at,key_fingerprint=excluded.key_fingerprint",
    ).run(
      id,
      owner.id,
      now,
      now,
      subscription.expirationTime ?? null,
      hash(key ?? ""),
    );
    if (typeof replaces === "string" && replaces !== subscription.endpoint)
      db.prepare(
        "UPDATE subscriptions SET active=0 WHERE endpoint=? AND business_id=?",
      ).run(replaces, BUSINESS);
    return { id, registeredAt: now };
  });
}
export function recordEmailReceipt(db, raw, headers, secret) {
  requireThat(secret, "Email webhook is not configured", 503);
  let event;
  try {
    event = new Webhook(secret).verify(raw, headers);
  } catch {
    throw new Problem(401, "Invalid webhook signature");
  }
  requireThat(
    typeof event.data?.email_id === "string" && typeof event.type === "string",
    "Invalid receipt",
  );
  transaction(db, () => {
    db.prepare("INSERT OR IGNORE INTO webhook_receipts VALUES(?,?,?,?)").run(
      headers["svix-id"],
      event.data.email_id,
      event.type,
      Date.parse(event.created_at) || Date.now(),
    );
    applyReceipts(db, event.data.email_id);
  });
  return { ok: true };
}
export function applyReceipts(db, providerId) {
  const events = db
    .prepare(
      "SELECT * FROM webhook_receipts WHERE provider_id=? ORDER BY created_at",
    )
    .all(providerId);
  for (const event of events) {
    const state = {
      "email.delivered": "delivered_to_mail_server",
      "email.bounced": "bounced",
      "email.complained": "complained",
      "email.failed": "failed",
    }[event.type];
    if (state)
      db.prepare(
        "UPDATE deliveries SET status=?,last_error=? WHERE provider_id=? AND status NOT IN ('bounced','complained')",
      ).run(
        state,
        ["bounced", "complained", "failed"].includes(state) ? event.type : null,
        providerId,
      );
  }
}
export class NotificationWorker {
  constructor(db, config = {}, sendPush = null, sendEmail = null) {
    this.db = db;
    this.config = config;
    this.running = false;
    this.sendEmail =
      sendEmail ??
      (async (m) => {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + config.emailApiKey,
            "Content-Type": "application/json",
            "Idempotency-Key": m.eventId,
          },
          body: JSON.stringify({
            from: config.emailFrom,
            to: [m.to],
            subject: m.subject,
            text: m.text,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok)
          throw Object.assign(Error("Email request failed"), {
            statusCode: r.status,
          });
        return r.json();
      });
    this.sendPush =
      sendPush ??
      ((s, p) =>
        webpush.sendNotification(s, p, {
          TTL: 3600,
          vapidDetails: {
            subject: config.vapidSubject,
            publicKey: config.vapidPublicKey,
            privateKey: config.vapidPrivateKey,
          },
          timeout: 10000,
        }));
  }
  logError(error) {
    this.db
      .prepare("INSERT INTO worker_errors VALUES(?,?,?)")
      .run(
        randomUUID(),
        String(error?.message ?? error).slice(0, 200),
        Date.now(),
      );
  }
  queue(n, channel, target, payload) {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO deliveries(id,notification_id,channel,target,status,payload) VALUES(?,?,?,?,'queued',?)",
      )
      .run(randomUUID(), n.id, channel, target, JSON.stringify(payload));
  }
  enqueue() {
    const now = Date.now();
    this.db
      .prepare(
        "UPDATE subscriptions SET active=0 WHERE id IN (SELECT subscription_id FROM subscription_meta WHERE expires_at IS NOT NULL AND expires_at<=?)",
      )
      .run(now);
    const events = this.db
      .prepare(
        "SELECT n.*,h.actor,h.data event_data FROM notifications n JOIN history h ON h.id=n.id WHERE n.business_id=?",
      )
      .all(BUSINESS);
    for (const n of events) {
      const event = n.event.split(":")[0],
        data = JSON.parse(n.event_data),
        b = this.db
          .prepare(
            "SELECT b.*,c.data customer FROM bookings b JOIN customers c ON c.id=b.customer_id WHERE b.id=? AND b.business_id=?",
          )
          .get(n.booking_id, BUSINESS),
        isOwnerEvent = n.actor === "customer";
      const ownerPayload = {
        subject:
          event === "booking.requested"
            ? "New booking request"
            : "Customer booking update",
        text: `${event}\nReview this booking: ${this.config.origin ?? "http://localhost:4317"}/owner?booking=${b.id}`,
        url: "/owner?booking=" + b.id + "&event=" + n.id,
        eventId: n.id,
        title:
          event === "booking.requested"
            ? "New booking request"
            : "Customer booking update",
        body: "Open your private dashboard to review the booking.",
      };
      if (isOwnerEvent) {
        const subscriptions = this.db
          .prepare(
            "SELECT s.* FROM subscriptions s LEFT JOIN subscription_meta m ON m.subscription_id=s.id WHERE s.business_id=? AND s.active=1 AND (m.registered_at IS NULL OR m.registered_at<=?)",
          )
          .all(BUSINESS, n.created_at);
        for (const s of subscriptions)
          this.queue(n, "push", s.id, ownerPayload);
        const push = this.db
          .prepare(
            "SELECT status FROM deliveries WHERE notification_id=? AND channel='push'",
          )
          .all(n.id);
        if (
          this.config.ownerEmail ||
          !push.length ||
          push.every((d) => ["failed", "expired", "blocked"].includes(d.status))
        )
          this.queue(n, "owner_email", "owner", {
            ...ownerPayload,
            to: this.config.ownerEmail ?? null,
          });
      }
      if (
        [
          "booking.confirm",
          "booking.accept",
          "booking.propose",
          "booking.cancel",
        ].includes(event)
      ) {
        const proposal = event === "booking.propose" ? data.proposal : null;
        let text = `Baucom's Mobile Detailing\nBooking reference: ${b.id}\nStatus at this event: ${data.to}\nAppointment: ${new Date(data.start_ms ?? b.start_ms).toLocaleString("en-US", { timeZone: "America/Chicago" })} America/Chicago`;
        if (proposal)
          text += `\nProposed appointment: ${new Date(proposal.startAt).toLocaleString("en-US", { timeZone: "America/Chicago" })} America/Chicago\nRevised total: $${(proposal.priceCents / 100).toFixed(2)}\nAccept this proposal using your private link before revised work proceeds.`;
        if (b.access_expires > now)
          text +=
            "\nPrivate booking link: " +
            customerLink(
              this.db,
              b,
              this.config.origin ?? "http://localhost:4317",
            );
        else
          text +=
            "\nYour private access link expired. Contact the business for assistance.";
        this.queue(n, "customer", "customer", {
          to: JSON.parse(b.customer).email,
          subject: "Baucom’s booking update",
          text,
        });
      }
    }
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      this.enqueue();
      const now = Date.now();
      this.db
        .prepare(
          "UPDATE deliveries SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'retry' END,last_error='Delivery lease expired',claimed_until=0 WHERE status='sending' AND claimed_until<=?",
        )
        .run(now);
      const pending = this.db
        .prepare(
          "SELECT * FROM deliveries WHERE status IN ('queued','retry','blocked') AND next_attempt<=? AND attempts<5 ORDER BY rowid LIMIT 100",
        )
        .all(now);
      for (const d of pending) {
        const push = d.channel === "push";
        let payload = JSON.parse(d.payload ?? "{}");
        const configured = push
          ? this.config.vapidPublicKey &&
            this.config.vapidPrivateKey &&
            this.config.vapidSubject
          : this.config.emailApiKey &&
            this.config.emailFrom &&
            (d.channel !== "owner_email" || this.config.ownerEmail);
        if (!configured) {
          this.db
            .prepare(
              "UPDATE deliveries SET status='blocked',last_error=?,next_attempt=? WHERE id=? AND status IN ('queued','retry','blocked')",
            )
            .run(
              push
                ? "VAPID keys not configured"
                : d.channel === "owner_email"
                  ? "Owner fallback email not configured"
                  : "Customer email provider not configured",
              now + 60000,
              d.id,
            );
          continue;
        }
        const s = push
          ? this.db
              .prepare("SELECT * FROM subscriptions WHERE id=? AND active=1")
              .get(d.target)
          : null;
        if (push && !s) {
          this.db
            .prepare(
              "UPDATE deliveries SET status='expired',last_error='Subscription inactive' WHERE id=?",
            )
            .run(d.id);
          continue;
        }
        const claimed = this.db
          .prepare(
            "UPDATE deliveries SET status='sending',claimed_until=?,attempts=attempts+1 WHERE id=? AND status IN ('queued','retry','blocked') AND next_attempt<=?",
          )
          .run(Date.now() + 120000, d.id, Date.now());
        if (!claimed.changes) continue;
        try {
          let result;
          if (push)
            result = await this.sendPush(
              JSON.parse(s.data),
              JSON.stringify(payload),
            );
          else
            result = await this.sendEmail({
              ...payload,
              to:
                d.channel === "owner_email"
                  ? this.config.ownerEmail
                  : payload.to,
              eventId: d.id,
            });
          this.db
            .prepare(
              "UPDATE deliveries SET status='accepted_by_provider',provider_id=?,claimed_until=0,last_error=NULL WHERE id=?",
            )
            .run(result?.id ?? null, d.id);
          this.db
            .prepare("INSERT INTO delivery_attempts VALUES(?,?,?,?,?,?)")
            .run(
              randomUUID(),
              d.id,
              d.attempts + 1,
              "accepted_by_provider",
              null,
              Date.now(),
            );
          if (result?.id) applyReceipts(this.db, result.id);
        } catch (e) {
          const expired = push && [404, 410].includes(e.statusCode);
          if (expired)
            this.db
              .prepare("UPDATE subscriptions SET active=0 WHERE id=?")
              .run(s.id);
          const status = expired
              ? "expired"
              : d.attempts >= 4
                ? "failed"
                : "retry",
            reason = String(e.statusCode ?? "transport_failure");
          this.db
            .prepare(
              "UPDATE deliveries SET status=?,claimed_until=0,last_error=?,next_attempt=? WHERE id=?",
            )
            .run(
              status,
              reason,
              Date.now() + Math.min(3600000, 30000 * 2 ** d.attempts),
              d.id,
            );
          this.db
            .prepare("INSERT INTO delivery_attempts VALUES(?,?,?,?,?,?)")
            .run(
              randomUUID(),
              d.id,
              d.attempts + 1,
              status,
              reason,
              Date.now(),
            );
        }
      }
      this.enqueue();
    } catch (e) {
      this.logError(e);
    } finally {
      this.running = false;
    }
  }
}
