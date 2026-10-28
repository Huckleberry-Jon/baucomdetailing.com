import * as mfLibrary from "miniflare";
const { Miniflare } = mfLibrary;
const convertV4MiniflareOptions =
  mfLibrary.convertV4MiniflareOptions ?? ((x) => x);
import { bundleWorker } from "../scripts/build-cloudflare.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { settings, packages, addons } from "../src/catalog.js";
import { passwordHash, token } from "../src/security.js";
export const origin = "http://localhost:4334";
export const password = "Synthetic-Cloudflare-owner-only-2026!";
export async function runtime(overrides = {}, options = {}) {
  const script = await bundleWorker("test-cloudflare/entry.js");
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      host: "127.0.0.1",
      port: options.port,
      modules: true,
      script,
      compatibilityDate: "2026-08-01",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["DB"],
      r2Buckets: ["MEDIA"],
      images: { binding: "IMAGES" },
      assets: {
        directory: resolve("public"),
        binding: "ASSETS",
        assetConfig: { html_handling: "none" },
        routerConfig: {
          has_user_worker: true,
          invoke_user_worker_ahead_of_assets: true,
        },
      },
      outboundService: async (request) =>
        new Response(JSON.stringify({ error: "Synthetic provider outage" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      bindings: {
        CLOUDFLARE_ENV: "local",
        DATA_NAMESPACE: "local",
        SITE_OPEN: "true",
        COMMUNICATIONS_MODE: "disabled",
        ALLOW_PUSH_SEND: "false",
        ALLOW_EMAIL_SEND: "false",
        ...overrides,
      },
    }),
  );
  const fixture = async (path, body) => {
    const response = await mf.dispatchFetch(origin + "/__fixture/" + path, {
      method: "POST",
      headers: {
        "X-Fixture": "synthetic-local-only",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const raw = await response.text();
    if (!raw)
      throw Error(
        "Empty fixture response " +
          response.status +
          " " +
          response.headers.get("location"),
      );
    const data = JSON.parse(raw);
    if (!response.ok) throw Error(data.error);
    return data.value;
  };
  const statement = (sql, args = []) => ({
    sql,
    args,
    bind: (...values) => statement(sql, values),
    first: () => fixture("db", { op: "first", sql, args }),
    all: () => fixture("db", { op: "all", sql, args }),
    run: () => fixture("db", { op: "run", sql, args }),
  });
  const db = {
    prepare: (sql) => statement(sql),
    exec: (sql) => fixture("db", { op: "exec", sql }),
    batch: (commands) => fixture("db", { op: "batch", commands }),
  };
  const bucket = {
    put: (key, bytes) =>
      fixture("r2", { op: "put", key, bytes: [...new Uint8Array(bytes)] }),
    get: async (key) => {
      const p = await fixture("r2", { op: "get", key });
      return p
        ? { arrayBuffer: async () => Uint8Array.from(p.bytes).buffer }
        : null;
    },
    list: (options) => fixture("r2", { op: "list", options }),
  };
  await db.exec(
    readdirSync("cloudflare/migrations")
      .sort()
      .map((f) => readFileSync("cloudflare/migrations/" + f, "utf8"))
      .join(" ")
      .replace(/\n/g, " "),
  );
  return { mf, db, bucket, fixture };
}
export async function seed(db, id = "baucom", host = "localhost:4334") {
  const ownerId = randomUUID(),
    cfg = {
      ...settings,
      notificationPreferences: {
        ownerEmail: "owner@example.invalid",
        emailEnabled: true,
        pushEnabled: true,
      },
      scheduleConfirmed: true,
      serviceAreaConfirmed: true,
      workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      openMinute: 480,
      closeMinute: 1080,
      closedDates: [],
      maxDaily: 10,
      bufferMinutes: 15,
    };
  await db.batch([
    db
      .prepare("INSERT INTO businesses VALUES(?,?,0,0,?)")
      .bind(id, JSON.stringify(cfg), token()),
    db
      .prepare("INSERT INTO tenant_domains VALUES(?,?,?)")
      .bind(host, id, "http://" + host),
    db
      .prepare("INSERT INTO owners VALUES(?,?,?,?)")
      .bind(ownerId, id, "owner@example.invalid", passwordHash(password)),
    ...[...packages, ...addons].map((p) =>
      db
        .prepare("INSERT INTO services VALUES(?,?,1,?)")
        .bind(
          p.id,
          id,
          JSON.stringify({
            ...p,
            durationMinutes: p.kind === "package" ? 90 : 30,
          }),
        ),
    ),
  ]);
  return { ownerId, cfg };
}
export function future(offset = 0) {
  const d = new Date(Date.now() + 7 * 86400000);
  d.setUTCHours(16, 0, 0, 0);
  return new Date(d.getTime() + offset * 60000).toISOString();
}
export const input = (overrides = {}) => ({
  packageId: "dustoff",
  addonIds: [],
  firstName: "Synthetic",
  lastName: "Tester",
  email: "customer@example.invalid",
  phone: "8065550100",
  address: "Synthetic address",
  year: 2022,
  make: "Test",
  model: "Sedan",
  color: "Blue",
  bodyType: "Sedan",
  requestedAt: future(),
  concerns: "Synthetic fixture",
  acceptNotice: true,
  ...overrides,
});
export async function call(
  mf,
  path,
  {
    method = "GET",
    body,
    cookie,
    secret,
    key,
    host = origin,
    headers = {},
  } = {},
) {
  const r = await mf.dispatchFetch(host + path, {
    method,
    headers: {
      Origin: host,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(secret ? { Authorization: "Bearer " + secret } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: r.status, data, headers: r.headers };
}
export async function login(mf, host = origin) {
  const r = await call(mf, "/api/login", {
    method: "POST",
    body: { email: "owner@example.invalid", password },
    host,
  });
  if (r.status !== 200) throw Error(JSON.stringify(r.data));
  return r.headers.get("set-cookie").split(";")[0];
}
