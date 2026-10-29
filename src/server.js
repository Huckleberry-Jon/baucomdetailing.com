import {
  websiteSlots,
  saveWebsitePhoto,
  publishWebsitePhoto,
  publicWebsitePhotos,
  websitePhoto,
} from "./website-photos.js";
import { HostedBackupRunner, hostedBackupSettings } from "./hosted-backups.js";
import { prepareStorage } from "./production-storage.js";
import { runtimeConfig } from "./runtime-config.js";
import { accessGate } from "./dev-access.js";
import {
  publicReviews,
  submitReview,
  moderateReview,
  reviewLinks,
  googleReviewUrl,
} from "./reviews.js";
import {
  preparePhotos,
  storePhotos,
  listPhotos,
  mediaRecord,
  selectInvoicePhoto,
  invoicePhotoManifest,
} from "./media.js";
import { calendar, addBlock, availability } from "./calendar.js";
import http from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { openDatabase, transaction } from "./db.js";
import { BookingService } from "./bookings.js";
import { BUSINESS, notice } from "./catalog.js";
import {
  hash,
  token,
  verifyPassword,
  Problem,
  requireThat,
  rateLimit,
} from "./security.js";
import {
  NotificationWorker,
  saveSubscription,
  recordEmailReceipt,
} from "./notifications.js";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
export function createApplication(db, config = {}) {
  const service = new BookingService(db),
    worker = new NotificationWorker(db, config);
  const origin = config.origin ?? "http://localhost:4317";
  const respond = (res, status, data) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  let activeUploads = 0;
  const server = http.createServer(async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      if (config.environment === "device-test") {
        res.setHeader("X-Robots-Tag", "noindex, nofollow");
        if (config.origin.startsWith("https:"))
          res.setHeader("Strict-Transport-Security", "max-age=86400");
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      );
      if (req.url === "/healthz" && req.method === "GET") {
        db.prepare("SELECT 1").get();
        return respond(res, 200, { status: "ok" });
      }
      if (config.environment === "production") {
        if (
          config.hostAliases?.includes(req.headers.host) &&
          req.method === "GET"
        ) {
          res.writeHead(308, { Location: origin + req.url });
          res.end();
          return;
        }
        res.setHeader("Strict-Transport-Security", "max-age=31536000");
      }
      requireThat(
        req.headers.host === new URL(origin).host,
        "Invalid host",
        400,
      );
      const url = new URL(req.url, origin),
        path = url.pathname;
      if (
        config.accessGate &&
        !["/dev-access", "/dev-access.js", "/api/webhooks/email"].includes(
          path,
        ) &&
        accessGate(req, res, path, db, config, {}, respond)
      )
        return;
      let body = {},
        raw = "";
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        requireThat(
          path === "/api/webhooks/email" || req.headers.origin === origin,
          "Request origin rejected",
          403,
        );
        requireThat(
          req.headers["content-type"]?.startsWith("application/json"),
          "JSON required",
          415,
        );
        if (
          path === "/api/bookings" ||
          path === "/api/owner/photos" ||
          path === "/api/owner/website-photos"
        ) {
          requireThat(
            activeUploads < 2,
            "Photo upload capacity is busy; retry shortly",
            503,
          );
          activeUploads++;
          let released = false;
          const release = () => {
            if (!released) {
              released = true;
              activeUploads--;
            }
          };
          res.once("finish", release);
          res.once("close", release);
        }
        const chunks = [];
        let size = 0;
        const limit =
          path === "/api/bookings" ||
          path === "/api/owner/photos" ||
          path === "/api/owner/website-photos"
            ? 24 * 1024 * 1024
            : 32768;
        for await (const chunk of req) {
          size += chunk.length;
          requireThat(size <= limit, "Request too large", 413);
          chunks.push(chunk);
        }
        raw = Buffer.concat(chunks).toString("utf8");
        try {
          body = JSON.parse(raw || "{}");
        } catch {
          throw new Problem(400, "Invalid JSON");
        }
        requireThat(
          body && typeof body === "object" && !Array.isArray(body),
          "Invalid request",
        );
      }
      if (accessGate(req, res, path, db, config, body, respond)) return;
      if (path === "/api/webhooks/email" && req.method === "POST")
        return respond(
          res,
          200,
          recordEmailReceipt(db, raw, req.headers, config.emailWebhookSecret),
        );
      const cookies = Object.fromEntries(
        (req.headers.cookie ?? "").split(";").map((c) => c.trim().split("=")),
      );
      const owner = () => {
        const s = db
          .prepare(
            "SELECT o.* FROM sessions s JOIN owners o ON o.id=s.owner_id WHERE s.token_hash=? AND s.expires>? AND o.business_id=?",
          )
          .get(hash(cookies.session ?? ""), Date.now(), BUSINESS);
        requireThat(s, "Owner login required", 401);
        return s;
      };
      if (path === "/api/website-photos" && req.method === "GET")
        return respond(res, 200, publicWebsitePhotos(db));
      if (path === "/api/website-photo" && req.method === "GET") {
        const photo = websitePhoto(db, url.searchParams.get("id"));
        res.setHeader("Content-Type", "image/jpeg");
        res.end(Buffer.from(photo.preview));
        return;
      }
      if (path === "/robots.txt" && req.method === "GET") {
        res.setHeader("Content-Type", "text/plain");
        res.end(
          "User-agent: *\n" +
            (config.siteOpen === true ? "Allow: /\n" : "Disallow: /\n"),
        );
        return;
      }
      if (path === "/api/reviews" && req.method === "GET")
        return respond(res, 200, {
          reviews: publicReviews(db),
          links: reviewLinks(service.settings(), origin),
        });
      if (path === "/api/reviews" && req.method === "POST") {
        rateLimit(db, "review:" + req.socket.remoteAddress, 10);
        return respond(
          res,
          201,
          submitReview(
            service,
            body,
            req.headers["idempotency-key"],
            req.headers.authorization?.slice(7),
          ),
        );
      }
      if (path === "/api/availability" && req.method === "GET") {
        rateLimit(db, "availability:" + req.socket.remoteAddress, 120);
        return respond(
          res,
          200,
          availability(
            service,
            url.searchParams.get("day"),
            url.searchParams.get("packageId"),
            url.searchParams.getAll("addonId"),
          ),
        );
      }
      if (path === "/api/catalog" && req.method === "GET")
        return respond(res, 200, {
          settings: service.settings(),
          services: service.catalog().filter((s) => s.enabled),
          notice,
          runtime: {
            environment: config.environment ?? "local",
            siteOpen: config.siteOpen === true,
          },
        });
      if (path === "/api/bookings" && req.method === "POST") {
        rateLimit(db, "booking:" + req.socket.remoteAddress, 20);
        const photos = await preparePhotos(body.photos ?? []);
        const b = service.create(body, req.headers["idempotency-key"], photos);
        respond(res, b.duplicate ? 200 : 201, b);
        void worker.tick().catch((e) => worker.logError(e));
        return;
      }
      if (path === "/api/customer/booking") {
        const auth = req.headers.authorization ?? "";
        requireThat(
          auth.startsWith("Bearer "),
          "Customer access link required",
          403,
        );
        const b = service.authorizeCustomer(
          body.id ?? url.searchParams.get("id"),
          auth.slice(7),
        );
        if (req.method === "GET")
          return respond(res, 200, service.publicView(b));
        if (req.method === "POST") {
          requireThat(
            ["accept", "cancel"].includes(body.action),
            "Invalid customer action",
          );
          const result = service.transition(
            b.id,
            body.action,
            body,
            "customer",
          );
          respond(res, 200, result);
          void worker.tick().catch((e) => worker.logError(e));
          return;
        }
      }
      if (path === "/api/login" && req.method === "POST") {
        rateLimit(db, "login:" + req.socket.remoteAddress, 10, 900000);
        requireThat(
          typeof body.email === "string" &&
            typeof body.password === "string" &&
            body.password.length <= 200,
          "Login failed",
          401,
        );
        const o = db
          .prepare("SELECT * FROM owners WHERE email=? AND business_id=?")
          .get(body.email.toLowerCase(), BUSINESS);
        requireThat(
          o && verifyPassword(body.password, o.password_hash),
          "Login failed",
          401,
        );
        const secret = token();
        db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
        db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
          hash(secret),
          o.id,
          Date.now() + 12 * 3600000,
        );
        res.setHeader(
          "Set-Cookie",
          `session=${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${origin.startsWith("https:") ? "; Secure" : ""}`,
        );
        return respond(res, 200, { ok: true });
      }
      if (path.startsWith("/api/owner/")) {
        const signedIn = owner();
        const audit = (event, id) =>
          db
            .prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?)")
            .run(randomUUID(), BUSINESS, signedIn.id, event, id, Date.now());
        if (path === "/api/owner/website-photos" && req.method === "GET")
          return respond(res, 200, {
            slots: websiteSlots,
            photos: db
              .prepare(
                "SELECT id,slot,alt,caption,rights_note,status,updated_at FROM website_photos WHERE business_id=?",
              )
              .all(BUSINESS),
          });
        if (path === "/api/owner/website-photos" && req.method === "POST") {
          const photos = await preparePhotos(body.photos);
          requireThat(
            photos.length === 1,
            "Upload one website photograph at a time",
          );
          return respond(
            res,
            201,
            saveWebsitePhoto(db, body, photos[0], signedIn),
          );
        }
        if (path === "/api/owner/website-publish" && req.method === "PUT")
          return respond(res, 200, publishWebsitePhoto(db, body, signedIn));
        if (path === "/api/owner/website-photo" && req.method === "GET") {
          const p = websitePhoto(db, url.searchParams.get("id"), true);
          res.setHeader(
            "Content-Type",
            url.searchParams.get("original") === "1"
              ? p.original_mime
              : "image/jpeg",
          );
          if (url.searchParams.get("original") === "1")
            res.setHeader(
              "Content-Disposition",
              'attachment; filename="website-original"',
            );
          res.end(
            Buffer.from(
              url.searchParams.get("original") === "1" ? p.original : p.preview,
            ),
          );
          return;
        }
        if (path === "/api/owner/resume-delivery" && req.method === "POST") {
          transaction(db, () => {
            db.prepare(
              "DELETE FROM private_keys WHERE name='delivery-recovery-hold'",
            ).run();
            audit("recovery.delivery-resumed", BUSINESS);
          });
          return respond(res, 200, { ok: true });
        }
        if (path === "/api/owner/retry-delivery" && req.method === "POST") {
          transaction(db, () => {
            const d = db
              .prepare(
                "SELECT d.* FROM deliveries d JOIN notifications n ON n.id=d.notification_id WHERE d.id=? AND n.business_id=?",
              )
              .get(body.id, BUSINESS);
            requireThat(
              d &&
                ["blocked", "retry", "failed", "recovery_hold"].includes(
                  d.status,
                ),
              "Delivery cannot be retried in its current state",
              409,
            );
            db.prepare(
              "UPDATE deliveries SET status='queued',next_attempt=0,claimed_until=0,attempts=0 WHERE id=?",
            ).run(d.id);
            audit("notification.retry-requested", d.id);
          });
          return respond(res, 200, { ok: true });
        }
        if (path === "/api/owner/reviews" && req.method === "GET")
          return respond(
            res,
            200,
            db
              .prepare(
                "SELECT * FROM reviews WHERE business_id=? ORDER BY created_at DESC LIMIT 300",
              )
              .all(BUSINESS),
          );
        if (path === "/api/owner/reviews" && req.method === "PUT")
          return respond(res, 200, moderateReview(db, body, signedIn));
        if (path === "/api/owner/review-links" && req.method === "GET")
          return respond(res, 200, reviewLinks(service.settings(), origin));
        if (path === "/api/owner/photos" && req.method === "GET") {
          service.get(url.searchParams.get("booking"));
          return respond(
            res,
            200,
            listPhotos(db, url.searchParams.get("booking")),
          );
        }
        if (path === "/api/owner/photos" && req.method === "POST") {
          requireThat(
            ["intake", "before", "after"].includes(body.kind),
            "Invalid photo kind",
          );
          const b = service.get(body.bookingId),
            photos = await preparePhotos(body.photos);
          const records = transaction(db, () => {
            const result = storePhotos(db, b, photos, body.kind);
            audit("media.uploaded", b.id);
            return result;
          });
          return respond(res, 201, records);
        }
        if (path === "/api/owner/photo" && req.method === "GET") {
          const p = mediaRecord(db, url.searchParams.get("id")),
            original = url.searchParams.get("original") === "1";
          res.setHeader(
            "Content-Type",
            original ? p.original_mime : "image/jpeg",
          );
          res.setHeader(
            "Content-Disposition",
            original ? 'attachment; filename="original-photo"' : "inline",
          );
          res.end(Buffer.from(original ? p.original : p.preview));
          return;
        }
        if (path === "/api/owner/invoice-photo" && req.method === "PUT") {
          selectInvoicePhoto(db, body.id, body.include);
          audit("media.invoice-selection", body.id);
          return respond(res, 200, { ok: true });
        }
        if (path === "/api/owner/invoice-photos" && req.method === "GET") {
          service.get(url.searchParams.get("booking"));
          return respond(
            res,
            200,
            invoicePhotoManifest(db, url.searchParams.get("booking")),
          );
        }
        if (path === "/api/owner/calendar" && req.method === "GET")
          return respond(
            res,
            200,
            calendar(
              service,
              url.searchParams.get("from"),
              url.searchParams.get("to"),
            ),
          );
        if (path === "/api/owner/block" && req.method === "POST") {
          const result = addBlock(service, body);
          audit("calendar.blocked", result.id);
          return respond(res, 201, result);
        }
        if (path === "/api/owner/block" && req.method === "DELETE") {
          transaction(db, () => {
            db.prepare(
              "DELETE FROM schedule_blocks WHERE id=? AND business_id=?",
            ).run(body.id, BUSINESS);
            audit("calendar.unblocked", body.id);
          });
          return respond(res, 200, { ok: true });
        }
        if (path === "/api/owner/push-config" && req.method === "GET")
          return respond(res, 200, {
            publicKey: config.vapidPublicKey ?? null,
          });
        if (path === "/api/owner/booking" && req.method === "GET") {
          service.get(url.searchParams.get("id"));
          return respond(
            res,
            200,
            db
              .prepare(
                "SELECT b.*,c.data customer,v.data vehicle FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN vehicles v ON v.id=b.vehicle_id WHERE b.id=? AND b.business_id=?",
              )
              .get(url.searchParams.get("id"), BUSINESS),
          );
        }
        if (path === "/api/owner/logout" && req.method === "POST") {
          db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
            hash(cookies.session ?? ""),
          );
          res.setHeader(
            "Set-Cookie",
            "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          );
          return respond(res, 200, { ok: true });
        }
        if (path === "/api/owner/dashboard" && req.method === "GET")
          return respond(res, 200, {
            bookings: db
              .prepare(
                "SELECT b.*,c.data customer,v.data vehicle FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN vehicles v ON v.id=b.vehicle_id WHERE b.business_id=? ORDER BY b.created_at DESC LIMIT 300",
              )
              .all(BUSINESS),
            notifications: db
              .prepare(
                "SELECT * FROM notifications WHERE business_id=? ORDER BY created_at DESC LIMIT 300",
              )
              .all(BUSINESS),
            unread: db
              .prepare(
                "SELECT count(*) n FROM notifications WHERE business_id=? AND read_at IS NULL",
              )
              .get(BUSINESS).n,
            deliveries: db
              .prepare(
                "SELECT d.* FROM deliveries d JOIN notifications n ON n.id=d.notification_id WHERE n.business_id=? ORDER BY n.created_at DESC LIMIT 300",
              )
              .all(BUSINESS),
            backupStatus: db
              .prepare(
                "SELECT id,started_at,finished_at,status,error FROM backup_runs WHERE business_id=? ORDER BY started_at DESC LIMIT 5",
              )
              .all(BUSINESS),
            settings: service.settings(),
            services: service.catalog(),
            vapidPublicKey: config.vapidPublicKey ?? null,
            recoveryHold:
              db
                .prepare(
                  "SELECT value FROM private_keys WHERE name='delivery-recovery-hold'",
                )
                .get()?.value === "1",
            notificationHealth: {
              pushConfigured: !!(
                config.vapidPublicKey &&
                config.vapidPrivateKey &&
                config.vapidSubject
              ),
              customerEmailConfigured: !!(
                config.emailApiKey && config.emailFrom
              ),
              ownerFallbackConfigured: !!(
                config.emailApiKey &&
                config.emailFrom &&
                config.ownerEmail
              ),
              activeSubscriptions: db
                .prepare(
                  "SELECT count(*) n FROM subscriptions WHERE business_id=? AND active=1",
                )
                .get(BUSINESS).n,
              workerErrors: db
                .prepare(
                  "SELECT * FROM worker_errors ORDER BY created_at DESC LIMIT 20",
                )
                .all(),
            },
          });
        if (path === "/api/owner/transition" && req.method === "POST") {
          const result = service.transition(body.id, body.action, body);
          respond(res, 200, result);
          void worker.tick().catch((e) => worker.logError(e));
          return;
        }
        if (path === "/api/owner/settings" && req.method === "PUT") {
          const settings = transaction(db, () => {
            const value = service.updateSettings(body);
            audit("settings.updated", BUSINESS);
            return value;
          });
          return respond(res, 200, settings);
        }
        if (path === "/api/owner/service" && req.method === "PUT") {
          const old = service.catalog().find((s) => s.id === body.id);
          requireThat(
            old && body.version === old.version,
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
          body.kind = old.kind;
          if (old.kind === "addon")
            requireThat(
              Array.isArray(body.packageIds) &&
                body.packageIds.every((id) =>
                  service
                    .catalog()
                    .some((s) => s.kind === "package" && s.id === id),
                ),
              "Invalid package compatibility",
            );
          const { version, ...data } = body;
          const result = db
            .prepare(
              "UPDATE services SET data=?,version=version+1 WHERE id=? AND business_id=? AND version=?",
            )
            .run(JSON.stringify(data), body.id, BUSINESS, version);
          requireThat(result.changes === 1, "Service changed; refresh", 409);
          audit("service.updated", body.id);
          return respond(res, 200, { ok: true });
        }
        if (path === "/api/owner/read" && req.method === "POST") {
          db.prepare(
            "UPDATE notifications SET read_at=? WHERE id=? AND business_id=?",
          ).run(body.read === false ? null : Date.now(), body.id, BUSINESS);
          return respond(res, 200, { ok: true });
        }
        if (path === "/api/owner/subscription" && req.method === "POST") {
          saveSubscription(db, body, signedIn, config.vapidPublicKey);
          return respond(res, 200, { ok: true });
        }
        if (path === "/api/owner/history" && req.method === "GET") {
          service.get(url.searchParams.get("id"));
          return respond(
            res,
            200,
            db
              .prepare(
                "SELECT * FROM history WHERE booking_id=? AND business_id=? ORDER BY created_at",
              )
              .all(url.searchParams.get("id"), BUSINESS),
          );
        }
      }
      if (req.method === "GET") {
        const files = {
          "/": "index.html",
          "/dev-access": "dev-access.html",
          "/dev-access.js": "dev-access.js",
          "/owner": "owner.html",
          "/booking": "booking.html",
          "/privacy": "privacy.html",
          "/terms": "terms.html",
          "/app.js": "app.js",
          "/social-links.js": "social-links.js",
          "/owner.js": "owner.js",
          "/directory.js": "directory.js",
          "/calendar.js": "calendar.js",
          "/photos.js": "photos.js",
          "/reviews.js": "reviews.js",
          "/customer.js": "customer.js",
          "/style.css": "style.css",
          "/sw.js": "sw.js",
          "/manifest.json": "manifest.json",
          "/icon.svg": "icon.svg",
          "/favicon.ico": "favicon.ico",
          "/favicon-16.png": "favicon-16.png",
          "/favicon-32.png": "favicon-32.png",
          "/website-photos.js": "website-photos.js",
          "/icon-192.png": "icon-192.png",
          "/icon-512.png": "icon-512.png",
          "/apple-touch-icon.png": "apple-touch-icon.png",
        };
        const file = files[path];
        if (file) {
          const ext = file.slice(file.lastIndexOf("."));
          res.setHeader("Content-Type", types[ext]);
          res.writeHead(200);
          res.end(readFileSync(new URL("../public/" + file, import.meta.url)));
          return;
        }
      }
      throw new Problem(404, "Not found");
    } catch (e) {
      if (!res.headersSent)
        respond(res, e.status ?? 500, {
          error: e.status ? e.message : "Server error",
        });
      else res.end();
    }
  });
  server.requestTimeout = 120000;
  server.headersTimeout = 30000;
  return { server, worker, service };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  mkdirSync("data", { recursive: true });
  const config = runtimeConfig();
  prepareStorage(config);
  const database = openDatabase(config.databasePath);
  const backupRunner = new HostedBackupRunner(
    database,
    hostedBackupSettings(process.env, config),
  );
  const { server, worker } = createApplication(database, config);
  server.listen(config.port, config.bindHost ?? "127.0.0.1", () =>
    console.log("Local: " + config.origin),
  );
  const notificationTimer = setInterval(
    () => void worker.tick().catch((e) => worker.logError(e)),
    15000,
  ).unref();
  const backupTimer = setInterval(
    () => void backupRunner.tick(),
    60000,
  ).unref();
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(notificationTimer);
    clearInterval(backupTimer);
    server.close(() => {
      const closeDb = () => {
        if (worker.running || backupRunner.running) {
          setTimeout(closeDb, 100).unref();
          return;
        }
        database.close();
        process.exit(0);
      };
      closeDb();
    });
    setTimeout(() => process.exit(1), 30000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
