import webpush from "web-push";
import { randomUUID } from "node:crypto";
import { BUSINESS } from "./catalog.js";
import { requireThat } from "./security.js";
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
  const u = new URL(s.endpoint);
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
}
export class NotificationWorker {
  constructor(db, config = {}, sendPush = null, sendEmail = null) {
    this.db = db;
    this.config = config;
    this.running = false;
    this.sendEmail =
      sendEmail ??
      (async (message) => {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + config.emailApiKey,
            "Content-Type": "application/json",
            "Idempotency-Key": message.eventId,
          },
          body: JSON.stringify({
            from: config.emailFrom,
            to: [message.to],
            subject: message.subject,
            text: message.text,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
          throw new Error("Email provider HTTP " + response.status);
        return response.json();
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
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const events = this.db
        .prepare("SELECT * FROM notifications WHERE business_id=?")
        .all(BUSINESS);
      for (const n of events) {
        for (const s of this.db
          .prepare(
            "SELECT * FROM subscriptions WHERE business_id=? AND active=1",
          )
          .all(BUSINESS))
          this.db
            .prepare(
              "INSERT OR IGNORE INTO deliveries(id,notification_id,channel,target,status) VALUES(?,?, 'push',?, 'queued')",
            )
            .run(randomUUID(), n.id, s.id);
        // Customer records are durable even when no outbound provider is configured.
        if (/booking\.(confirm|accept|propose|cancel):/.test(n.event))
          this.db
            .prepare(
              "INSERT OR IGNORE INTO deliveries(id,notification_id,channel,target,status,last_error) VALUES(?,?,'customer','customer','blocked','Customer email/SMS provider not configured')",
            )
            .run(randomUUID(), n.id);
      }
      const customerPending = this.db
        .prepare(
          "SELECT d.*,n.booking_id,n.event FROM deliveries d JOIN notifications n ON n.id=d.notification_id WHERE d.channel='customer' AND d.status IN ('queued','retry','blocked') AND d.next_attempt<=? AND d.attempts<5",
        )
        .all(Date.now());
      for (const d of customerPending) {
        if (!this.config.emailApiKey || !this.config.emailFrom) {
          this.db
            .prepare(
              "UPDATE deliveries SET status='blocked',next_attempt=?,last_error='Customer email provider not configured' WHERE id=?",
            )
            .run(Date.now() + 60000, d.id);
          continue;
        }
        const b = this.db
          .prepare(
            "SELECT b.*,c.data customer FROM bookings b JOIN customers c ON c.id=b.customer_id WHERE b.id=? AND b.business_id=?",
          )
          .get(d.booking_id, BUSINESS);
        const history = this.db
            .prepare("SELECT * FROM history WHERE id=?")
            .get(d.notification_id),
          event = JSON.parse(history.data),
          customer = JSON.parse(b.customer),
          proposal = d.event.startsWith("booking.propose:")
            ? event.proposal
            : null;
        const text = `Baucom's Mobile Detailing\nBooking reference: ${b.id}\nUpdate: ${d.event.split(":")[0]}\n${proposal ? "Proposed appointment: " + new Date(proposal.startAt).toLocaleString("en-US", { timeZone: "America/Chicago" }) + " America/Chicago\nRevised total: $" + (proposal.priceCents / 100).toFixed(2) + "\nCustomer acceptance is required before revised work proceeds." : "Status at this event: " + event.to + "\nAppointment: " + new Date(event.start_ms ?? b.start_ms).toLocaleString("en-US", { timeZone: "America/Chicago" }) + " America/Chicago"}\nUse the private booking link saved when you submitted your request to review, accept a proposal, or cancel.\nA requested appointment is not confirmed until approved.`;
        try {
          await this.sendEmail({
            eventId: d.id,
            to: customer.email,
            subject: "Baucom’s booking update",
            text,
          });
          this.db
            .prepare(
              "UPDATE deliveries SET status='accepted_by_provider',attempts=attempts+1,last_error=NULL WHERE id=?",
            )
            .run(d.id);
        } catch {
          this.db
            .prepare(
              "UPDATE deliveries SET status=?,attempts=attempts+1,last_error='Email provider request failed',next_attempt=? WHERE id=?",
            )
            .run(
              d.attempts >= 4 ? "failed" : "retry",
              Date.now() + 30000 * 2 ** d.attempts,
              d.id,
            );
        }
      }
      const pending = this.db
        .prepare(
          "SELECT d.*,n.booking_id FROM deliveries d JOIN notifications n ON n.id=d.notification_id WHERE d.channel='push' AND d.status IN ('queued','retry','blocked') AND d.next_attempt<=? AND d.attempts<5",
        )
        .all(Date.now());
      for (const d of pending) {
        if (
          !this.config.vapidPublicKey ||
          !this.config.vapidPrivateKey ||
          !this.config.vapidSubject
        ) {
          this.db
            .prepare(
              "UPDATE deliveries SET status='blocked',last_error='VAPID keys not configured',next_attempt=? WHERE id=?",
            )
            .run(Date.now() + 60000, d.id);
          continue;
        }
        const s = this.db
          .prepare("SELECT * FROM subscriptions WHERE id=? AND active=1")
          .get(d.target);
        if (!s) {
          this.db
            .prepare("UPDATE deliveries SET status='expired' WHERE id=?")
            .run(d.id);
          continue;
        }
        try {
          await this.sendPush(
            JSON.parse(s.data),
            JSON.stringify({
              title: "Booking update",
              body: "Open your private dashboard to review the booking.",
              url: "/owner?booking=" + d.booking_id,
              eventId: d.notification_id,
            }),
          );
          this.db
            .prepare(
              "UPDATE deliveries SET status='accepted_by_provider',attempts=attempts+1,last_error=NULL WHERE id=?",
            )
            .run(d.id);
        } catch (e) {
          const expired = [404, 410].includes(e.statusCode);
          if (expired)
            this.db
              .prepare("UPDATE subscriptions SET active=0 WHERE id=?")
              .run(s.id);
          this.db
            .prepare(
              "UPDATE deliveries SET status=?,attempts=attempts+1,last_error=?,next_attempt=? WHERE id=?",
            )
            .run(
              expired ? "expired" : d.attempts >= 4 ? "failed" : "retry",
              String(e.statusCode ?? "transport_failure"),
              Date.now() + Math.min(3600000, 30000 * 2 ** d.attempts),
              d.id,
            );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
