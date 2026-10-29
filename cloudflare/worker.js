import { jobView, saveJob, stockMovement } from "./operations.js";
import { saveNativeDevice, nativeInbox } from "./native-push.js";
import { sessionCookie, sessionInfo, rotateSession } from "./sessions.js";
import { randomUUID } from "node:crypto";
import {
  hash,
  token,
  verifyPassword,
  requireThat,
  Problem,
} from "../src/security.js";
import { gateSession, validGateSession } from "../src/dev-access.js";
import { notice } from "../src/catalog.js";
import {
  saveMaterial,
  saveDocument,
  issueDocument,
  recordEvent,
  report,
} from "./finance.js";
import {
  directory,
  updateRecord,
  createRecord,
  customerHistory,
} from "./records.js";
import { CloudBookings } from "./bookings.js";
import {
  prepareMedia,
  mediaResponse,
  addPhotos,
  slots,
  saveWebsitePhoto,
} from "./media.js";
import { submitReview, moderateReview, reviewLinks } from "./reviews.js";
import { saveSubscription, drain, receipt } from "./notifications.js";
const staticPaths = {
  "/": "index.html",
  "/owner": "owner.html",
  "/booking": "booking.html",
  "/privacy": "privacy.html",
  "/terms": "terms.html",
  "/dev-access": "dev-access.html",
};
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};
function json(data, status = 200, extra = {}) {
  return Response.json(data, { status, headers: { ...headers, ...extra } });
}
function cookies(request) {
  return Object.fromEntries(
    (request.headers.get("Cookie") ?? "")
      .split(";")
      .map((c) => c.trim().split("=")),
  );
}
function validateEnv(env) {
  requireThat(
    ["local", "staging", "production"].includes(env.CLOUDFLARE_ENV),
    "Explicit Cloudflare environment required",
    503,
  );
  requireThat(
    env.DB &&
      env.MEDIA &&
      env.ASSETS &&
      env.DATA_NAMESPACE === env.CLOUDFLARE_ENV,
    "Isolated bindings and data namespace required",
    503,
  );
  requireThat(
    ["disabled", "test-only", "live"].includes(
      env.COMMUNICATIONS_MODE ?? "disabled",
    ),
    "Invalid communications mode",
    503,
  );
  if (env.COMMUNICATIONS_MODE === "disabled" || !env.COMMUNICATIONS_MODE)
    requireThat(
      env.ALLOW_PUSH_SEND !== "true" && env.ALLOW_EMAIL_SEND !== "true",
      "Disabled mode cannot enable channels",
      503,
    );
  if (env.CLOUDFLARE_ENV !== "local")
    requireThat(
      env.SITE_OPEN === "true" || env.SITE_OPEN === "false",
      "Explicit site publication state required",
      503,
    );
  if (env.SITE_OPEN !== "true")
    requireThat(
      env.PREVIEW_PASSWORD_HASH && env.PREVIEW_SIGNING_KEY?.length >= 43,
      "Private preview secrets required",
      503,
    );
  if (env.COMMUNICATIONS_MODE === "live")
    requireThat(
      env.SITE_OPEN === "true" && env.LIVE_COMMUNICATIONS_APPROVAL,
      "Live messaging requires explicit approval",
      503,
    );
}
async function limitedBody(request) {
  const limit = [
    "/api/bookings",
    "/api/owner/photos",
    "/api/owner/website-photos",
  ].includes(new URL(request.url).pathname)
    ? 24 * 1024 * 1024
    : 32768;
  requireThat(
    Number(request.headers.get("content-length") ?? 0) <= limit,
    "Request too large",
    413,
  );
  const reader = request.body?.getReader();
  let n = 0;
  const chunks = [];
  if (reader)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > limit) {
        await reader.cancel();
        throw new Problem(413, "Request too large");
      }
      chunks.push(value);
    }
  const bytes = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  const raw = new TextDecoder().decode(bytes);
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    throw new Problem(400, "Invalid JSON");
  }
  requireThat(
    body && typeof body === "object" && !Array.isArray(body),
    "Invalid request",
  );
  return { body, raw };
}
async function rate(s, key, max, window = 3600000) {
  const id = s.tenant + ":" + key,
    now = Date.now();
  const row = await s
    .statement(
      "INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count",
      id,
      now + window,
      now,
      now,
    )
    .first();
  requireThat(row.count <= max, "Too many requests. Try again later.", 429);
}
async function owner(s, request) {
  const row = await s.first(
    "SELECT o.* FROM sessions x JOIN owners o ON o.id=x.owner_id AND o.business_id=x.business_id WHERE x.business_id=? AND x.token_hash=? AND x.expires>?",
    s.tenant,
    hash(cookies(request).session ?? ""),
    Date.now(),
  );
  requireThat(row, "Owner login required", 401);
  return row;
}
const publicSettings = (s) => {
  const { notificationPreferences, ...rest } = s;
  return rest;
};
async function serveAsset(env, request, path) {
  const url = new URL(request.url);
  url.pathname = "/" + (staticPaths[path] ?? path.replace(/^\//, ""));
  return env.ASSETS.fetch(new Request(url, { method: "GET" }));
}
let uploads = 0;
export async function route(request, env, ctx) {
  validateEnv(env);
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  if (path === "/healthz" && method === "GET") {
    await env.DB.prepare("SELECT 1").first();
    return json({ status: "ok" });
  }
  const domain = await env.DB.prepare(
    "SELECT * FROM tenant_domains WHERE hostname=?",
  )
    .bind(url.host.toLowerCase())
    .first();
  requireThat(domain, "Unknown business hostname", 404);
  const origin = domain.canonical_origin;
  requireThat(
    env.CLOUDFLARE_ENV === "local"
      ? /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      : new URL(origin).protocol === "https:",
    "HTTPS origin required",
    503,
  );
  if (url.origin !== origin) {
    requireThat(method === "GET", "Canonical origin required", 403);
    return new Response(null, {
      status: 308,
      headers: { ...headers, Location: origin + url.pathname + url.search },
    });
  }
  const s = new CloudBookings(env.DB, domain.business_id),
    cookie = cookies(request),
    ip = request.headers.get("CF-Connecting-IP") ?? "local";
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (mutating)
    requireThat(
      path === "/api/webhooks/email" ||
        request.headers.get("Origin") === origin,
      "Request origin rejected",
      403,
    );
  const gateOpen =
    env.SITE_OPEN === "true" ||
    validGateSession(cookie.dev_access, env.PREVIEW_SIGNING_KEY);
  if (
    !gateOpen &&
    !["/dev-access", "/dev-access.js", "/api/webhooks/email"].includes(path)
  ) {
    if (method === "GET" && !path.startsWith("/api/"))
      return serveAsset(env, request, "/dev-access");
    throw new Problem(401, "Development tester access required");
  }
  const signedOwner = path.startsWith("/api/owner/")
    ? await owner(s, request)
    : null;
  let body = {},
    raw = "";
  if (mutating) {
    requireThat(
      request.headers.get("Content-Type")?.startsWith("application/json"),
      "JSON required",
      415,
    );
    ({ body, raw } = await limitedBody(request));
  }
  const bearer = (request.headers.get("Authorization") ?? "").replace(
    /^Bearer /,
    "",
  );
  if (path === "/dev-access" && method === "POST") {
    await rate(s, "gate:" + ip, 10, 900000);
    requireThat(
      typeof body.code === "string" &&
        body.code.length <= 200 &&
        verifyPassword(body.code, env.PREVIEW_PASSWORD_HASH),
      "Invalid development access code",
      401,
    );
    return json({ ok: true }, 200, {
      "Set-Cookie":
        "dev_access=" +
        gateSession(env.PREVIEW_SIGNING_KEY) +
        "; HttpOnly; SameSite=Lax; Path=/; Max-Age=172800" +
        (origin.startsWith("https:") ? "; Secure" : ""),
    });
  }
  if (path === "/api/webhooks/email" && method === "POST")
    return json(await receipt(s, raw, request.headers, env));
  if (path === "/api/catalog" && method === "GET")
    return json({
      settings: publicSettings(await s.settings()),
      services: (await s.catalog()).filter((p) => p.enabled),
      notice,
      runtime: {
        environment: env.CLOUDFLARE_ENV,
        siteOpen: env.SITE_OPEN === "true",
      },
    });
  if (path === "/api/availability" && method === "GET")
    return json(
      await s.availability(
        url.searchParams.get("day"),
        url.searchParams.get("packageId"),
        url.searchParams.getAll("addonId"),
      ),
    );
  if (path === "/api/bookings" && method === "POST") {
    await rate(s, "booking:" + ip, 20);
    const photos = await prepareMedia(env, s.tenant, body.photos ?? []),
      b = await s.create(body, request.headers.get("Idempotency-Key"), photos);
    ctx.waitUntil(drain(s, origin, env).catch((e) => logError(s, e)));
    return json(b, b.duplicate ? 200 : 201);
  }
  if (path === "/api/customer/booking") {
    requireThat(
      request.headers.get("Authorization")?.startsWith("Bearer "),
      "Customer access link required",
      403,
    );
    const b = await s.authorizeCustomer(
      body.id ?? url.searchParams.get("id"),
      bearer,
    );
    if (method === "GET") return json(s.view(b));
    if (method === "POST") {
      requireThat(
        ["accept", "cancel"].includes(body.action),
        "Invalid customer action",
      );
      const result = await s.transition(b.id, body.action, body, "customer");
      ctx.waitUntil(drain(s, origin, env).catch((e) => logError(s, e)));
      return json(result);
    }
  }
  if (path === "/api/login" && method === "POST") {
    await rate(s, "login:" + ip, 10, 900000);
    requireThat(
      typeof body.email === "string" &&
        typeof body.password === "string" &&
        body.password.length <= 200,
      "Login failed",
      401,
    );
    const user = await s.first(
      "SELECT * FROM owners WHERE business_id=? AND email=?",
      s.tenant,
      body.email.toLowerCase(),
    );
    requireThat(
      user && verifyPassword(body.password, user.password_hash),
      "Login failed",
      401,
    );
    const secret = token();
    await s
      .statement(
        "INSERT INTO sessions VALUES(?,?,?,?)",
        hash(secret),
        s.tenant,
        user.id,
        Date.now() + 12 * 3600000,
      )
      .run();
    return json({ ok: true }, 200, {
      "Set-Cookie":
        "session=" +
        secret +
        "; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200" +
        (origin.startsWith("https:") ? "; Secure" : ""),
    });
  }
  if (path === "/api/reviews" && method === "GET")
    return json({
      reviews: await s.all(
        "SELECT id,display_name,rating,feedback,created_at,CASE WHEN booking_id IS NOT NULL THEN 1 ELSE 0 END verified_job FROM reviews WHERE business_id=? AND status='approved' ORDER BY created_at DESC LIMIT 100",
        s.tenant,
      ),
      links: reviewLinks(await s.settings(), origin),
    });
  if (path === "/api/reviews" && method === "POST") {
    await rate(s, "review:" + ip, 10);
    return json(
      await submitReview(
        s,
        body,
        request.headers.get("Idempotency-Key"),
        bearer,
      ),
      201,
    );
  }
  if (path === "/api/website-photos" && method === "GET")
    return json(
      await s.all(
        "SELECT id,slot,alt,caption,updated_at FROM website_photos WHERE business_id=? AND status='published'",
        s.tenant,
      ),
    );
  if (path === "/api/website-photo" && method === "GET") {
    const p = await s.first(
      "SELECT * FROM website_photos WHERE business_id=? AND id=? AND status='published'",
      s.tenant,
      url.searchParams.get("id"),
    );
    requireThat(p, "Website photo not found", 404);
    return mediaResponse(env, s.tenant, p);
  }
  if (path.startsWith("/api/owner/")) {
    const user = signedOwner,
      id = url.searchParams.get("id");
    if (path === "/api/owner/inbox" && method === "GET")
      return json(await nativeInbox(s, url.searchParams));
    if (path === "/api/owner/native-device" && method === "POST") {
      await rate(s, "native-registration:" + user.id, 60);
      return json(await saveNativeDevice(s, body, user, cookie.session));
    }
    if (path === "/api/owner/native-device" && method === "DELETE") {
      await s.db.batch([
        s.statement(
          "UPDATE deliveries SET status='revoked' WHERE business_id=? AND channel='apns' AND target IN (SELECT id FROM native_devices WHERE business_id=? AND owner_id=? AND device_id=?) AND status IN ('queued','retry','blocked','sending')",
          s.tenant,
          s.tenant,
          user.id,
          body.deviceId,
        ),
        s.statement(
          "DELETE FROM native_devices WHERE business_id=? AND owner_id=? AND device_id=?",
          s.tenant,
          user.id,
          body.deviceId,
        ),
      ]);
      return json({ ok: true });
    }
    if (path === "/api/owner/native-push-config" && method === "GET")
      return json({
        transmissionEnabled:
          (env.COMMUNICATIONS_MODE ?? "disabled") !== "disabled" &&
          env.ALLOW_NATIVE_PUSH_SEND === "true",
        providerConfigured: Boolean(
          env.APNS_KEY_ID &&
            env.APNS_TEAM_ID &&
            env.APNS_PRIVATE_KEY &&
            env.APNS_TOPIC,
        ),
        environment: env.APNS_ENVIRONMENT ?? null,
      });
    if (path === "/api/owner/session" && method === "GET")
      return json(await sessionInfo(s, cookie.session, user));
    if (path === "/api/owner/session/refresh" && method === "POST") {
      await rate(s, "refresh:" + user.id, 60);
      const next = await rotateSession(s, cookie.session, user);
      return json({ expiresAt: next.expiresAt }, 200, {
        "Set-Cookie": sessionCookie(next.secret, origin),
      });
    }
    if (path === "/api/owner/session/revoke-all" && method === "POST") {
      await s.db.batch([
        s.statement(
          "UPDATE deliveries SET status='revoked' WHERE business_id=? AND channel='apns' AND target IN (SELECT id FROM native_devices WHERE business_id=? AND owner_id=?) AND status IN ('queued','retry','blocked','sending')",
          s.tenant,
          s.tenant,
          user.id,
        ),
        s.statement(
          "DELETE FROM native_devices WHERE business_id=? AND owner_id=?",
          s.tenant,
          user.id,
        ),
        s.statement(
          "DELETE FROM sessions WHERE business_id=? AND owner_id=?",
          s.tenant,
          user.id,
        ),
      ]);
      return json({ ok: true }, 200, {
        "Set-Cookie": sessionCookie("", origin, 0),
      });
    }
    const audited = async (event, record, commands) =>
      s.atomic(async (b, c) => {
        c.push(...commands);
        s.audit(c, user.id, event, record);
        return { ok: true };
      });
    if (["/api/owner/customers", "/api/owner/vehicles"].includes(path)) {
      const kind = path.split("/").pop();
      if (method === "GET")
        return json(await directory(s, kind, url.searchParams));
      if (method === "PUT")
        return json(await updateRecord(s, kind, body, user.id));
      if (method === "POST")
        return json(await createRecord(s, kind, body, user.id), 201);
    }
    if (path === "/api/owner/customer" && method === "GET")
      return json(await customerHistory(s, id));
    if (path === "/api/owner/jobs" && method === "GET")
      return json({
        records: await s.all(
          "SELECT j.*,b.status,b.start_ms,c.data customer FROM jobs j JOIN bookings b ON b.id=j.booking_id AND b.business_id=j.business_id JOIN customers c ON c.id=j.customer_id AND c.business_id=j.business_id WHERE j.business_id=? ORDER BY b.start_ms DESC LIMIT 300",
          s.tenant,
        ),
      });
    if (path === "/api/owner/job") {
      if (method === "GET") return json(await jobView(s, id));
      if (method === "PUT") return json(await saveJob(s, body, user.id));
    }
    if (path === "/api/owner/inventory" && method === "POST")
      return json(
        await stockMovement(
          s,
          body,
          user.id,
          request.headers.get("Idempotency-Key"),
        ),
        201,
      );
    if (path === "/api/owner/materials") {
      if (method === "GET")
        return json({
          records: await s.all(
            "SELECT m.*,coalesce(b.quantity_millis,0) available_quantity_millis,coalesce(b.version,0) stock_version FROM materials m LEFT JOIN inventory_balances b ON b.material_id=m.id AND b.business_id=m.business_id WHERE m.business_id=? ORDER BY m.rowid DESC LIMIT 300",
            s.tenant,
          ),
        });
      if (method === "POST")
        return json(await saveMaterial(s, body, user.id), 201);
    }
    if (path === "/api/owner/documents") {
      if (method === "GET")
        return json({
          records: await s.all(
            "SELECT d.*,coalesce((SELECT sum(amount_cents) FROM financial_events e WHERE e.business_id=d.business_id AND e.document_id=d.id AND e.kind='payment'),0) paid_cents FROM financial_documents d WHERE d.business_id=? ORDER BY d.created_at DESC LIMIT 300",
            s.tenant,
          ),
        });
      if (method === "POST")
        return json(await saveDocument(s, body, user.id), 201);
    }
    if (path === "/api/owner/document" && method === "GET") {
      const document = await s.first(
        "SELECT * FROM financial_documents WHERE business_id=? AND id=?",
        s.tenant,
        id,
      );
      requireThat(document, "Document not found", 404);
      const payments = await s.all(
        "SELECT * FROM financial_events WHERE business_id=? AND document_id=? ORDER BY occurred_at,id",
        s.tenant,
        id,
      );
      return json({
        ...document,
        payments,
        paid_cents: payments.reduce((n, p) => n + p.amount_cents, 0),
      });
    }
    if (path === "/api/owner/documents/issue" && method === "POST")
      return json(await issueDocument(s, body, user.id));
    if (path === "/api/owner/finance/events" && method === "POST")
      return json(
        await recordEvent(
          s,
          body,
          user.id,
          request.headers.get("Idempotency-Key"),
        ),
        201,
      );
    if (path === "/api/owner/finance/report" && method === "GET")
      return json(
        await report(
          s,
          url.searchParams.get("from"),
          url.searchParams.get("to"),
        ),
      );
    if (path === "/api/owner/logout" && method === "POST") {
      await s.db.batch([
        s.statement(
          "UPDATE deliveries SET status='revoked' WHERE business_id=? AND channel='apns' AND target IN (SELECT id FROM native_devices WHERE business_id=? AND owner_id=? AND session_hash=?) AND status IN ('queued','retry','blocked','sending')",
          s.tenant,
          s.tenant,
          user.id,
          hash(cookie.session ?? ""),
        ),
        s.statement(
          "DELETE FROM native_devices WHERE business_id=? AND owner_id=? AND session_hash=?",
          s.tenant,
          user.id,
          hash(cookie.session ?? ""),
        ),
        s.statement(
          "DELETE FROM sessions WHERE business_id=? AND token_hash=?",
          s.tenant,
          hash(cookie.session ?? ""),
        ),
      ]);
      return json({ ok: true }, 200, {
        "Set-Cookie":
          "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" +
          (origin.startsWith("https:") ? "; Secure" : ""),
      });
    }
    if (path === "/api/owner/booking" && method === "GET") {
      await s.get(id);
      return json(
        await s.first(
          "SELECT b.*,c.data customer,v.data vehicle FROM bookings b JOIN customers c ON c.id=b.customer_id AND c.business_id=b.business_id JOIN vehicles v ON v.id=b.vehicle_id AND v.business_id=b.business_id WHERE b.id=? AND b.business_id=?",
          id,
          s.tenant,
        ),
      );
    }
    if (path === "/api/owner/dashboard" && method === "GET") {
      const business = await s.first(
        "SELECT * FROM businesses WHERE id=?",
        s.tenant,
      );
      return json({
        bookings: await s.all(
          "SELECT b.*,c.data customer,v.data vehicle FROM bookings b JOIN customers c ON c.id=b.customer_id AND c.business_id=b.business_id JOIN vehicles v ON v.id=b.vehicle_id AND v.business_id=b.business_id WHERE b.business_id=? ORDER BY b.created_at DESC LIMIT 300",
          s.tenant,
        ),
        notifications: await s.all(
          "SELECT * FROM notifications WHERE business_id=? ORDER BY created_at DESC LIMIT 300",
          s.tenant,
        ),
        unread: (
          await s.first(
            "SELECT count(*) n FROM notifications WHERE business_id=? AND read_at IS NULL",
            s.tenant,
          )
        ).n,
        deliveries: await s.all(
          "SELECT * FROM deliveries WHERE business_id=? ORDER BY rowid DESC LIMIT 300",
          s.tenant,
        ),
        backupStatus: await s.all(
          "SELECT * FROM backup_runs WHERE business_id=? ORDER BY started_at DESC LIMIT 5",
          s.tenant,
        ),
        settings: JSON.parse(business.settings),
        services: await s.catalog(),
        vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null,
        recoveryHold: !!business.delivery_hold,
        notificationHealth: {
          pushConfigured: !!(
            env.VAPID_PUBLIC_KEY &&
            env.VAPID_PRIVATE_KEY &&
            env.VAPID_SUBJECT
          ),
          customerEmailConfigured: !!(env.RESEND_API_KEY && env.EMAIL_FROM),
          ownerFallbackConfigured: !!(
            env.RESEND_API_KEY &&
            env.EMAIL_FROM &&
            JSON.parse(business.settings).notificationPreferences?.ownerEmail
          ),
          activeSubscriptions: (
            await s.first(
              "SELECT count(*) n FROM subscriptions WHERE business_id=? AND active=1",
              s.tenant,
            )
          ).n,
          workerErrors: await s.all(
            "SELECT * FROM worker_errors WHERE business_id=? ORDER BY created_at DESC LIMIT 20",
            s.tenant,
          ),
        },
      });
    }
    if (path === "/api/owner/transition" && method === "POST") {
      const b = await s.transition(body.id, body.action, body);
      ctx.waitUntil(drain(s, origin, env).catch((e) => logError(s, e)));
      return json(b);
    }
    if (path === "/api/owner/settings" && method === "PUT")
      return json(await s.updateSettings(body, user.id));
    if (path === "/api/owner/service" && method === "PUT")
      return json(
        await s.atomic(async (b, commands) => {
          const catalog = await s.catalog(),
            old = catalog.find((p) => p.id === body.id);
          requireThat(
            old && old.version === body.version,
            "Service changed; refresh",
            409,
          );
          requireThat(
            typeof body.name === "string" &&
              body.name.length > 0 &&
              body.name.length < 120 &&
              typeof body.enabled === "boolean",
            "Invalid service",
          );
          requireThat(
            Array.isArray(body.items ?? []) &&
              (body.items ?? []).every(
                (x) => typeof x === "string" && x.length <= 500,
              ),
            "Invalid service items",
          );
          requireThat(
            body.min === null ||
              (Number.isSafeInteger(body.min) && body.min >= 0),
            "Invalid minimum",
          );
          requireThat(
            body.max === null ||
              (Number.isSafeInteger(body.max) && body.max >= body.min),
            "Invalid maximum",
          );
          requireThat(
            old.kind !== "package" || (body.min !== null && body.max !== null),
            "Package prices required",
          );
          requireThat(
            body.durationMinutes === null ||
              (Number.isInteger(body.durationMinutes) &&
                body.durationMinutes > 0 &&
                body.durationMinutes <= 720),
            "Invalid duration",
          );
          if (old.kind === "addon")
            requireThat(
              Array.isArray(body.packageIds) &&
                body.packageIds.every((id) =>
                  catalog.some((p) => p.kind === "package" && p.id === id),
                ),
              "Invalid package compatibility",
            );
          const { version, ...data } = body;
          data.kind = old.kind;
          commands.push(
            s.command(
              "UPDATE services SET data=?,version=version+1 WHERE id=? AND business_id=? AND version=?",
              JSON.stringify(data),
              body.id,
              s.tenant,
              version,
            ),
          );
          s.audit(commands, user.id, "service.updated", body.id);
          return { ok: true };
        }),
      );
    if (path === "/api/owner/schedule-settings" && method === "PUT")
      return json(await s.updateScheduleSettings(body, user.id));
    if (path === "/api/owner/calendar" && method === "GET")
      return json(
        await s.calendar(
          url.searchParams.get("from"),
          url.searchParams.get("to"),
        ),
      );
    if (path === "/api/owner/block" && method === "POST")
      return json(await s.addBlock(body, user.id), 201);
    if (path === "/api/owner/block" && method === "DELETE")
      return json(
        await audited("calendar.unblocked", body.id, [
          s.command(
            "DELETE FROM schedule_blocks WHERE id=? AND business_id=?",
            body.id,
            s.tenant,
          ),
        ]),
      );
    if (path === "/api/owner/history" && method === "GET") {
      await s.get(id);
      return json(
        await s.all(
          "SELECT * FROM history WHERE booking_id=? AND business_id=? ORDER BY created_at",
          id,
          s.tenant,
        ),
      );
    }
    if (path === "/api/owner/read" && method === "POST") {
      await s
        .statement(
          "UPDATE notifications SET read_at=? WHERE business_id=? AND id=?",
          body.read === false ? null : Date.now(),
          s.tenant,
          body.id,
        )
        .run();
      return json({ ok: true });
    }
    if (path === "/api/owner/push-config" && method === "GET")
      return json({ publicKey: env.VAPID_PUBLIC_KEY ?? null });
    if (path === "/api/owner/subscription" && method === "POST")
      return json(await saveSubscription(s, body, user, env.VAPID_PUBLIC_KEY));
    if (path === "/api/owner/retry-delivery" && method === "POST")
      return json(
        await s.atomic(async (b, c) => {
          const d = await s.first(
            "SELECT * FROM deliveries WHERE business_id=? AND id=?",
            s.tenant,
            body.id,
          );
          requireThat(
            d &&
              ["blocked", "retry", "failed", "recovery_hold"].includes(
                d.status,
              ),
            "Delivery cannot be retried in its current state",
            409,
          );
          c.push(
            s.command(
              "UPDATE deliveries SET status='queued',next_attempt=0,claimed_until=0,attempts=0 WHERE business_id=? AND id=?",
              s.tenant,
              d.id,
            ),
          );
          s.audit(c, user.id, "notification.retry-requested", d.id);
          return { ok: true };
        }),
      );
    if (path === "/api/owner/resume-delivery" && method === "POST")
      return json(
        await audited("recovery.delivery-resumed", s.tenant, [
          s.command(
            "UPDATE businesses SET delivery_hold=0 WHERE id=?",
            s.tenant,
          ),
        ]),
      );
    if (path === "/api/owner/reviews" && method === "GET")
      return json(
        await s.all(
          "SELECT * FROM reviews WHERE business_id=? ORDER BY created_at DESC LIMIT 300",
          s.tenant,
        ),
      );
    if (path === "/api/owner/reviews" && method === "PUT")
      return json(await moderateReview(s, body, user));
    if (path === "/api/owner/review-links" && method === "GET")
      return json(reviewLinks(await s.settings(), origin));
    if (path === "/api/owner/photos" && method === "GET") {
      const booking = url.searchParams.get("booking");
      await s.get(booking);
      return json(
        await s.all(
          "SELECT id,booking_id,job_id,kind,filename,original_bytes,preview_bytes,include_on_invoice,created_at FROM media WHERE business_id=? AND booking_id=? ORDER BY created_at",
          s.tenant,
          booking,
        ),
      );
    }
    if (path === "/api/owner/photos" && method === "POST")
      return json(
        await addPhotos(
          s,
          body,
          await prepareMedia(env, s.tenant, body.photos ?? []),
          user,
        ),
        201,
      );
    if (path === "/api/owner/photo" && method === "GET") {
      const p = await s.first(
        "SELECT * FROM media WHERE business_id=? AND id=?",
        s.tenant,
        id,
      );
      requireThat(p, "Photograph not found", 404);
      return mediaResponse(
        env,
        s.tenant,
        p,
        url.searchParams.get("original") === "1",
      );
    }
    if (path === "/api/owner/invoice-photo" && method === "PUT") {
      requireThat(
        typeof body.include === "boolean",
        "Invalid invoice selection",
      );
      requireThat(
        await s.first(
          "SELECT id FROM media WHERE business_id=? AND id=?",
          s.tenant,
          body.id,
        ),
        "Photograph not found",
        404,
      );
      return json(
        await audited("media.invoice-selection", body.id, [
          s.command(
            "UPDATE media SET include_on_invoice=? WHERE business_id=? AND id=?",
            body.include ? 1 : 0,
            s.tenant,
            body.id,
          ),
        ]),
      );
    }
    if (path === "/api/owner/invoice-photos" && method === "GET") {
      const booking = url.searchParams.get("booking");
      await s.get(booking);
      return json(
        await s.all(
          "SELECT id,job_id,kind,filename,'image/jpeg' mime,preview_bytes bytes FROM media WHERE business_id=? AND booking_id=? AND include_on_invoice=1 ORDER BY kind,created_at",
          s.tenant,
          booking,
        ),
      );
    }
    if (path === "/api/owner/website-photos" && method === "GET")
      return json({
        slots: slots(await s.catalog()),
        photos: await s.all(
          "SELECT id,slot,alt,caption,rights_note,status,updated_at FROM website_photos WHERE business_id=?",
          s.tenant,
        ),
      });
    if (path === "/api/owner/website-photos" && method === "POST")
      return json(
        await saveWebsitePhoto(
          s,
          body,
          await prepareMedia(env, s.tenant, body.photos ?? []),
          user,
        ),
        201,
      );
    if (path === "/api/owner/website-photo" && method === "GET") {
      const p = await s.first(
        "SELECT * FROM website_photos WHERE business_id=? AND id=?",
        s.tenant,
        id,
      );
      requireThat(p, "Website photo not found", 404);
      return mediaResponse(
        env,
        s.tenant,
        p,
        url.searchParams.get("original") === "1",
      );
    }
    if (path === "/api/owner/website-publish" && method === "PUT")
      return json(
        await s.atomic(async (b, c) => {
          requireThat(
            typeof body.publish === "boolean" &&
              (!body.publish || body.confirmPermission === true),
            "Explicit publication permission required",
          );
          const p = await s.first(
            "SELECT id FROM website_photos WHERE business_id=? AND slot=?",
            s.tenant,
            body.slot,
          );
          requireThat(p, "Upload this website photo first", 404);
          c.push(
            s.command(
              "UPDATE website_photos SET status=?,updated_at=? WHERE business_id=? AND id=?",
              body.publish ? "published" : "draft",
              Date.now(),
              s.tenant,
              p.id,
            ),
          );
          s.audit(
            c,
            user.id,
            body.publish
              ? "website-photo.published"
              : "website-photo.unpublished",
            p.id,
          );
          return { ok: true };
        }),
      );
  }
  if (path === "/robots.txt")
    return new Response(
      "User-agent: *\n" +
        (env.SITE_OPEN === "true" ? "Allow: /\n" : "Disallow: /\n"),
    );
  if (method === "GET" && !path.startsWith("/api/"))
    return serveAsset(env, request, path);
  throw new Problem(404, "Not found");
}
export async function logError(s, error) {
  await s
    .statement(
      "INSERT INTO worker_errors VALUES(?,?,?,?)",
      randomUUID(),
      s.tenant,
      "Notification worker failed; inspect redacted diagnostics",
      Date.now(),
    )
    .run();
}
export default {
  async fetch(request, env, ctx) {
    const upload =
      request.method === "POST" &&
      [
        "/api/bookings",
        "/api/owner/photos",
        "/api/owner/website-photos",
      ].includes(new URL(request.url).pathname);
    if (upload && uploads >= 1)
      return json(
        { error: "Photo upload capacity is busy; retry shortly" },
        503,
      );
    if (upload) uploads++;
    try {
      const r = await route(request, env, ctx),
        h = new Headers(r.headers);
      for (const [k, v] of Object.entries(headers)) h.set(k, v);
      if (env.CLOUDFLARE_ENV !== "local")
        h.set("Strict-Transport-Security", "max-age=31536000");
      if (env.SITE_OPEN !== "true") h.set("X-Robots-Tag", "noindex, nofollow");
      return new Response(r.body, { status: r.status, headers: h });
    } catch (e) {
      if (!e.status || e.status >= 500)
        console.error(
          JSON.stringify({
            event: "request.failed",
            path: new URL(request.url).pathname,
            status: e.status ?? 500,
            requestId: randomUUID(),
          }),
        );
      return json(
        {
          error: e.status
            ? e.message
            : "Request failed; no partial database transaction committed",
        },
        e.status ?? 500,
      );
    } finally {
      if (upload) uploads--;
    }
  },
  async scheduled(event, env, ctx) {
    validateEnv(env);
    const domains = (
      await env.DB.prepare(
        "SELECT business_id,min(canonical_origin) origin FROM tenant_domains GROUP BY business_id",
      ).all()
    ).results;
    for (const d of domains) {
      const s = new CloudBookings(env.DB, d.business_id);
      ctx.waitUntil(drain(s, d.origin, env).catch((e) => logError(s, e)));
    }
  },
};
