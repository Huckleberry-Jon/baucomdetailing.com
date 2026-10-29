import { apnsBlocked, sendAPNs, APNS_FAILURES } from "./native-push.js";
import { randomUUID } from "node:crypto";

import { hash, requireThat, Problem } from "../src/security.js";
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
export async function saveSubscription(s, body, owner, key) {
  const { subscription, replaces } = body.subscription
    ? body
    : { subscription: body };
  validateSubscription(subscription);
  return s.atomic(async (b, commands) => {
    const old = await s.first(
        "SELECT * FROM subscriptions WHERE business_id=? AND endpoint=?",
        s.tenant,
        subscription.endpoint,
      ),
      id = old?.id ?? randomUUID(),
      now = Date.now();
    requireThat(
      !old || old.owner_id === owner.id,
      "Subscription belongs to another owner",
      403,
    );
    commands.push(
      s.command(
        "INSERT INTO subscriptions VALUES(?,?,?,?,1,?,?,?,?,?) ON CONFLICT(business_id,endpoint) DO UPDATE SET data=excluded.data,active=1,last_seen=excluded.last_seen,expires_at=excluded.expires_at,key_fingerprint=excluded.key_fingerprint",
        id,
        s.tenant,
        subscription.endpoint,
        JSON.stringify(subscription),
        owner.id,
        now,
        now,
        subscription.expirationTime ?? null,
        hash(key ?? ""),
      ),
    );
    if (typeof replaces === "string" && replaces !== subscription.endpoint)
      commands.push(
        s.command(
          "UPDATE subscriptions SET active=0 WHERE business_id=? AND endpoint=? AND owner_id=?",
          s.tenant,
          replaces,
          owner.id,
        ),
      );
    return { id, registeredAt: now };
  });
}
export async function reminders(s) {
  const now = Date.now();
  return s.atomic(async (b, commands) => {
    if (b.delivery_hold) return;
    const rows = await s.all(
      "SELECT * FROM bookings WHERE business_id=? AND status IN ('confirmed','rescheduled') AND start_ms>? AND start_ms<=?",
      s.tenant,
      now,
      now + 3600000,
    );
    for (const booking of rows) {
      const id = hash(
        s.tenant + ":reminder:" + booking.id + ":" + booking.start_ms,
      );
      commands.push(
        s.command(
          "INSERT OR IGNORE INTO history VALUES(?,?,?,?,?,?,?)",
          id,
          s.tenant,
          booking.id,
          "system",
          "appointment.reminder",
          JSON.stringify({ start_ms: booking.start_ms }),
          now,
        ),
        s.command(
          "INSERT OR IGNORE INTO notifications(id,business_id,booking_id,event,read_at,created_at) VALUES(?,?,?,?,NULL,?)",
          id,
          s.tenant,
          booking.id,
          "appointment.reminder:" + id,
          now,
        ),
      );
    }
  });
}
export async function enqueue(s, origin, env) {
  return s.atomic(async (b, commands) => {
    if (b.delivery_hold) return;
    const settings = JSON.parse(b.settings),
      events = await s.all(
        "SELECT n.*,h.actor,h.data event_data FROM notifications n JOIN history h ON h.id=n.id AND h.business_id=n.business_id WHERE n.business_id=? AND n.enqueued_at IS NULL ORDER BY n.created_at LIMIT 50",
        s.tenant,
      ),
      subs = await s.all(
        "SELECT * FROM subscriptions WHERE business_id=? AND active=1",
        s.tenant,
      );
    const native = await s.all(
      "SELECT d.* FROM native_devices d JOIN sessions x ON x.business_id=d.business_id AND x.owner_id=d.owner_id AND x.token_hash=d.session_hash WHERE d.business_id=? AND d.active=1",
      s.tenant,
    );
    const queue = (n, channel, target, payload) =>
      commands.push(
        s.command(
          "INSERT OR IGNORE INTO deliveries(id,business_id,notification_id,channel,target,status,payload) VALUES(?,?,?,?,?,'queued',?)",
          randomUUID(),
          s.tenant,
          n.id,
          channel,
          target,
          JSON.stringify(payload),
        ),
      );
    for (const n of events) {
      commands.push(
        s.command(
          "UPDATE notifications SET enqueued_at=? WHERE business_id=? AND id=?",
          Date.now(),
          s.tenant,
          n.id,
        ),
      );
      const booking = await s.get(n.booking_id),
        data = JSON.parse(n.event_data),
        event = n.event.split(":")[0],
        customer = JSON.parse(
          (
            await s.first(
              "SELECT data FROM customers WHERE business_id=? AND id=?",
              s.tenant,
              booking.customer_id,
            )
          ).data,
        );
      const owner = {
        title:
          event === "booking.requested"
            ? "New booking request"
            : "Customer booking update",
        body: "Open your private dashboard to review the booking.",
        subject: "Booking update",
        text: event + "\nReview: " + origin + "/owner?booking=" + booking.id,
        url: "/owner?booking=" + booking.id + "&event=" + n.id,
        eventId: n.id,
        to: settings.notificationPreferences?.ownerEmail ?? null,
      };
      if (
        n.actor === "customer" ||
        event === "appointment.reminder" ||
        event === "payment.recorded"
      ) {
        for (const device of native) {
          if (device.registered_at <= n.created_at)
            queue(n, "apns", device.id, {
              ...owner,
              title:
                event === "appointment.reminder"
                  ? "Appointment reminder"
                  : owner.title,
              to: device.owner_id,
              bookingId: booking.id,
            });
        }
      }
      if (n.actor === "customer") {
        for (const sub of subs)
          if (
            sub.registered_at <= n.created_at &&
            (!sub.expires_at || sub.expires_at > Date.now()) &&
            sub.key_fingerprint === hash(env.VAPID_PUBLIC_KEY ?? "")
          )
            queue(n, "push", sub.id, owner);
        queue(n, "owner_email", "owner", owner);
      }
      if (
        [
          "booking.confirm",
          "booking.accept",
          "booking.propose",
          "booking.cancel",
        ].includes(event)
      ) {
        let message =
          settings.name +
          "\nBooking reference: " +
          booking.id +
          "\nStatus at this event: " +
          data.to +
          "\nAppointment: " +
          new Date(data.start_ms ?? booking.start_ms).toLocaleString("en-US", {
            timeZone: settings.timezone,
          }) +
          " " +
          settings.timezone;
        if (event === "booking.propose" && data.proposal)
          message +=
            "\nProposed appointment: " +
            new Date(data.proposal.startAt).toLocaleString("en-US", {
              timeZone: settings.timezone,
            }) +
            "\nRevised total: $" +
            (data.proposal.priceCents / 100).toFixed(2) +
            "\nAccept the proposal before revised work proceeds.";
        message +=
          booking.access_expires > Date.now()
            ? "\nPrivate booking link: " +
              origin +
              "/booking#" +
              booking.id +
              ":" +
              (await s.customerToken(booking))
            : "\nYour private link expired. Contact the business.";
        queue(n, "customer", "customer", {
          to: customer.email,
          subject: settings.name + " booking update",
          text: message,
        });
      }
    }
  });
}
function blocked(env, channel, to, settings) {
  const mode = env.COMMUNICATIONS_MODE ?? "disabled",
    prefs = settings.notificationPreferences ?? {};
  if (mode === "disabled") return "Outbound communications disabled";
  if (channel === "apns") return apnsBlocked(env, to);
  if (channel === "push") {
    if (env.ALLOW_PUSH_SEND !== "true" || prefs.pushEnabled !== true)
      return "Push disabled";
    return env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
      ? null
      : "VAPID keys not configured";
  }
  if (env.ALLOW_EMAIL_SEND !== "true" || prefs.emailEnabled !== true)
    return "Email disabled";
  if (!to) return "Recipient not configured";
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM)
    return "Email provider not configured";
  if (
    mode === "test-only" &&
    !(env.TEST_EMAIL_RECIPIENTS ?? "")
      .toLowerCase()
      .split(",")
      .map((x) => x.trim())
      .includes(to.toLowerCase())
  )
    return "Recipient not authorized";
  return null;
}
export async function drain(s, origin, env) {
  await reminders(s);
  await enqueue(s, origin, env);
  const business = await s.first(
    "SELECT * FROM businesses WHERE id=?",
    s.tenant,
  );
  if (business.delivery_hold) return;
  const settings = JSON.parse(business.settings),
    now = Date.now();
  await s
    .statement(
      "UPDATE deliveries SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'retry' END,claimed_until=0,last_error='Delivery lease expired' WHERE business_id=? AND status='sending' AND claimed_until<=?",
      s.tenant,
      now,
    )
    .run();
  const pending = await s.all(
    "SELECT * FROM deliveries WHERE business_id=? AND status IN ('queued','retry','blocked') AND next_attempt<=? AND attempts<5 ORDER BY rowid LIMIT 50",
    s.tenant,
    now,
  );
  for (const d of pending) {
    const payload = JSON.parse(d.payload),
      block = blocked(env, d.channel, payload.to, settings);
    if (block) {
      await s
        .statement(
          "UPDATE deliveries SET status='blocked',last_error=?,next_attempt=? WHERE id=? AND business_id=? AND status IN ('queued','retry','blocked')",
          block,
          Date.now() + 60000,
          d.id,
          s.tenant,
        )
        .run();
      continue;
    }
    const claim = randomUUID(),
      r = await s
        .statement(
          "UPDATE deliveries SET status='sending',attempts=attempts+1,claimed_until=?,claim_token=? WHERE id=? AND business_id=? AND status IN ('queued','retry','blocked') AND next_attempt<=?",
          Date.now() + 120000,
          claim,
          d.id,
          s.tenant,
          Date.now(),
        )
        .run();
    if (!r.meta.changes) continue;
    let state = "accepted_by_provider",
      error = null,
      provider = null;
    try {
      let response;
      if (d.channel === "apns") {
        response = await sendAPNs(s, env, d, payload);
        provider = response.headers.get("apns-id") ?? d.id;
      } else if (d.channel === "push") {
        requireThat(
          env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT,
          "VAPID keys not configured",
          503,
        );
        const sub = await s.first(
          "SELECT * FROM subscriptions WHERE business_id=? AND id=? AND active=1",
          s.tenant,
          d.target,
        );
        requireThat(
          sub && (!sub.expires_at || sub.expires_at > Date.now()),
          "Subscription inactive",
          410,
        );
        validateSubscription(JSON.parse(sub.data));
        const { default: webpush } = await import("web-push");
        const details = webpush.generateRequestDetails(
          JSON.parse(sub.data),
          JSON.stringify(payload),
          {
            TTL: 3600,
            vapidDetails: {
              subject: env.VAPID_SUBJECT,
              publicKey: env.VAPID_PUBLIC_KEY,
              privateKey: env.VAPID_PRIVATE_KEY,
            },
          },
        );
        response = await fetch(details.endpoint, {
          method: details.method,
          headers: details.headers,
          body: details.body,
          signal: AbortSignal.timeout(10000),
          redirect: "error",
        });
      } else {
        requireThat(
          env.RESEND_API_KEY && env.EMAIL_FROM,
          "Email provider not configured",
          503,
        );
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + env.RESEND_API_KEY,
            "Content-Type": "application/json",
            "Idempotency-Key": d.id,
          },
          body: JSON.stringify({
            from: env.EMAIL_FROM,
            to: [payload.to],
            subject: payload.subject,
            text: payload.text,
            tags: [
              { name: "business_id", value: s.tenant },
              { name: "delivery_id", value: d.id },
            ],
          }),
          signal: AbortSignal.timeout(10000),
          redirect: "error",
        });
      }
      if (!response.ok)
        throw Object.assign(Error("Provider request failed"), {
          status: response.status,
        });
      if (!["push", "apns"].includes(d.channel))
        provider = (await response.json()).id ?? null;
    } catch (e) {
      const expired =
        ["push", "apns"].includes(d.channel) && [404, 410].includes(e.status);
      state = expired ? "expired" : d.attempts + 1 >= 5 ? "failed" : "retry";
      error = expired
        ? "Subscription expired"
        : Number.isInteger(e.status)
          ? "Notification provider failed (HTTP " + e.status + ")"
          : "Notification transport failed";
      if (
        [
          "Native token decryption failed",
          "APNs credential import/signing failed",
        ].includes(e.apnsCategory)
      )
        error = e.apnsCategory;
      if (APNS_FAILURES.includes(e.apnsCategory)) error = e.apnsCategory;
      if (expired && d.channel === "apns")
        await s
          .statement(
            "UPDATE native_devices SET active=0 WHERE business_id=? AND id=?",
            s.tenant,
            d.target,
          )
          .run();
      if (expired && d.channel === "push")
        await s
          .statement(
            "UPDATE subscriptions SET active=0 WHERE business_id=? AND id=?",
            s.tenant,
            d.target,
          )
          .run();
    }
    // Claim token fences late attempts after a lease has been reclaimed.
    await s.db.batch([
      s.statement(
        "UPDATE deliveries SET status=?,provider_id=?,last_error=?,next_attempt=?,claimed_until=0 WHERE business_id=? AND id=? AND status='sending' AND claim_token=?",
        state,
        provider,
        error,
        Date.now() + Math.min(3600000, 30000 * 2 ** d.attempts),
        s.tenant,
        d.id,
        claim,
      ),
      s.statement(
        "INSERT INTO delivery_attempts SELECT ?,business_id,id,attempts,?,?,? FROM deliveries WHERE business_id=? AND id=? AND claim_token=?",
        randomUUID(),
        state,
        error,
        Date.now(),
        s.tenant,
        d.id,
        claim,
      ),
    ]);
    if (provider && !["push", "apns"].includes(d.channel))
      await reconcile(s, provider);
  }
}
export async function reconcile(s, provider) {
  const rows = await s.all(
    "SELECT * FROM webhook_receipts WHERE business_id=? AND provider_id=? ORDER BY created_at",
    s.tenant,
    provider,
  );
  for (const row of rows) {
    const state = {
      "email.delivered": "delivered_to_mail_server",
      "email.bounced": "bounced",
      "email.complained": "complained",
      "email.failed": "failed",
    }[row.type];
    if (state)
      await s
        .statement(
          "UPDATE deliveries SET status=?,last_error=? WHERE business_id=? AND provider_id=? AND status NOT IN ('bounced','complained')",
          state,
          ["bounced", "complained", "failed"].includes(state) ? row.type : null,
          s.tenant,
          provider,
        )
        .run();
  }
}
export async function receipt(s, raw, headers, env) {
  requireThat(env.RESEND_WEBHOOK_SECRET, "Email webhook not configured", 503);
  let event;
  try {
    const { Webhook } = await import("svix");
    event = new Webhook(env.RESEND_WEBHOOK_SECRET).verify(
      raw,
      Object.fromEntries(headers),
    );
  } catch {
    throw new Problem(401, "Invalid webhook signature");
  }
  requireThat(
    typeof event.data?.email_id === "string" && typeof event.type === "string",
    "Invalid receipt",
  );
  // Host-scoped endpoint and provider ID must resolve to this tenant, or arrive early with tenant tag.
  const delivery = await s.first(
    "SELECT id FROM deliveries WHERE business_id=? AND provider_id=?",
    s.tenant,
    event.data.email_id,
  );
  const tags = Array.isArray(event.data.tags)
    ? Object.fromEntries(event.data.tags.map((t) => [t.name, t.value]))
    : (event.data.tags ?? {});
  requireThat(
    delivery || tags.business_id === s.tenant,
    "Receipt tenant cannot be verified",
    403,
  );
  await s
    .statement(
      "INSERT OR IGNORE INTO webhook_receipts VALUES(?,?,?,?,?)",
      headers.get("svix-id"),
      s.tenant,
      event.data.email_id,
      event.type,
      Date.parse(event.created_at) || Date.now(),
    )
    .run();
  await reconcile(s, event.data.email_id);
  return { ok: true };
}
