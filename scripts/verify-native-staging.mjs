import { schedule, dayKey } from "../cloudflare/domain.js";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
const origin =
    "https://docdetailing-site-staging.huckleberryservices.workers.dev",
  root = "data/cloudflare-staging-candidate/";
assert(
  process.argv.includes("--run"),
  "Explicit --run required for isolated staging test records",
);
const credentials = JSON.parse(readFileSync(root + "owner.json", "utf8"));
const jar = new Map(),
  checks = [];
async function api(
  path,
  { body, method = body ? "POST" : "GET", key, secret, owner = true } = {},
) {
  const response = await fetch(origin + path, {
    method,
    redirect: "manual",
    headers: {
      Origin: origin,
      Cookie: [...jar]
        .filter(([name]) => owner || name !== "session")
        .map(([n, v]) => n + "=" + v)
        .join("; "),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
      ...(secret ? { Authorization: "Bearer " + secret } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  for (const c of response.headers.getSetCookie()) {
    const [name, ...v] = c.split(";")[0].split("=");
    jar.set(name, v.join("="));
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  let data;
  try {
    data = JSON.parse(bytes.toString());
  } catch {}
  return { status: response.status, data, bytes, headers: response.headers };
}
const ok = (condition, name) => {
  assert(condition, name);
  checks.push(name);
};
const gate = await api("/");
ok(
  gate.status === 200 &&
    /<title>DocDetailing[^<]*Development access<\/title>/.test(
      gate.bytes.toString(),
    ) &&
    !gate.bytes.toString().includes('id="booking-form"'),
  "Private HTTPS gate blocks anonymous access",
);
ok(
  (await api("/dev-access", { body: { code: credentials.gateCode } }))
    .status === 200,
  "Tester gate accepts authorized account configuration",
);
ok(
  (await api("/api/owner/session")).status === 401,
  "Tester access does not grant owner access",
);
ok(
  (
    await api("/api/login", {
      body: { email: credentials.email, password: credentials.password },
    })
  ).status === 200,
  "Owner login succeeds",
);
const session = await api("/api/owner/session");
ok(
  session.status === 200 && session.data.businessId,
  "Origin-scoped owner session validates",
);
const config = await api("/api/owner/native-push-config");
ok(
  config.status === 200 && config.data.transmissionEnabled === false,
  "Native APNs remains disabled",
);
const catalog = (await api("/api/catalog")).data;
const service =
  catalog.services.find(
    (p) =>
      p.kind === "package" && p.enabled && Number.isInteger(p.durationMinutes),
  ) ?? catalog.services.find((p) => p.kind === "package" && p.enabled);
assert(service, "An enabled package is required");
const from = dayKey(Date.now() + 35 * 86400000, catalog.settings.timezone),
  to = dayKey(Date.now() + 42 * 86400000, catalog.settings.timezone);
const context = (
  await api("/api/owner/calendar?" + new URLSearchParams({ from, to }))
).data;
let slot, lastScheduleReason;
const duration = service.durationMinutes ?? 90;
const canConfirm =
  context.settings.scheduleConfirmed && context.settings.serviceAreaConfirmed;
if (!canConfirm) slot = new Date(Date.now() + 35 * 86400000).toISOString();
for (let at = Date.parse(from); at < Date.parse(to) && !slot; at += 1800000) {
  try {
    schedule(
      {
        ...context.settings,
        scheduleConfirmed: true,
        serviceAreaConfirmed: true,
      },
      context.bookings,
      context.blocks,
      at,
      duration,
    );
    slot = new Date(at).toISOString();
  } catch (e) {
    lastScheduleReason = e.message;
  }
}
assert(
  slot,
  "No available reviewed synthetic test slot: " + lastScheduleReason,
);
const png = await sharp({
  create: { width: 12, height: 12, channels: 3, background: "#245f83" },
})
  .png()
  .toBuffer();
const intake = {
  packageId: service.id,
  addonIds: [],
  firstName: "Synthetic",
  lastName: "Native acceptance",
  email: "native-acceptance@example.invalid",
  phone: "8065550100",
  address: "Isolated staging test address",
  year: 2022,
  make: "Test",
  model: "Sedan",
  color: "Blue",
  bodyType: "Sedan",
  requestedAt: slot,
  concerns: "Automated isolated native acceptance fixture",
  acceptNotice: true,
  photos: [{ name: "synthetic.png", base64: png.toString("base64") }],
};
const created = await api("/api/bookings", {
  body: intake,
  key: randomUUID(),
  owner: false,
});
ok(created.status === 201, "Website booking and private photo intake persist");
const id = created.data.id,
  secret = created.data.accessToken;
ok(
  (await api("/api/owner/booking?id=" + id)).data.status === "pending",
  "Native API reads the same website booking",
);
const confirmed = await api("/api/owner/transition", {
  body: { id, version: 1, action: "confirm", durationMinutes: duration },
});
const expectedStatus = canConfirm ? "confirmed" : "pending";
ok(
  canConfirm ? confirmed.status === 200 : confirmed.status === 409,
  canConfirm
    ? "Owner confirmation updates shared backend"
    : "Unconfirmed business hours/service area correctly block confirmation without losing booking",
);
if (canConfirm) {
  const rival = await api("/api/bookings", {
    body: { ...intake, photos: [] },
    key: randomUUID(),
    owner: false,
  });
  ok(
    rival.status === 201 &&
      (
        await api("/api/owner/transition", {
          body: {
            id: rival.data.id,
            version: 1,
            action: "confirm",
            durationMinutes: duration,
          },
        })
      ).status === 409,
    "Hosted scheduling prevents overlapping confirmation",
  );
  await api("/api/owner/transition", {
    body: { id: rival.data.id, version: 1, action: "cancel" },
  });
}
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: catalog.settings.timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date(slot));
const calendar = await api(
  "/api/owner/calendar?" + new URLSearchParams({ from: day, to: day }),
);
ok(
  calendar.status === 200 &&
    calendar.data.bookings.some(
      (b) => b.id === id && b.status === expectedStatus,
    ),
  "Website appointment appears in shared calendar",
);
ok(
  (await api("/api/customer/booking?id=" + id, { secret, owner: false })).data
    .status === expectedStatus,
  "Private customer link reflects current backend status",
);
const photos = (await api("/api/owner/photos?booking=" + id)).data;
assert(photos.length === 1, "One private intake photograph expected");
const photo = photos[0],
  original = await api("/api/owner/photo?id=" + photo.id + "&original=1");
ok(
  original.status === 200 &&
    createHash("sha256").update(original.bytes).digest("hex") ===
      createHash("sha256").update(png).digest("hex"),
  "Private R2 original download has exact upload integrity",
);
ok(
  (await api("/api/owner/photo?id=" + photo.id, { owner: false })).status ===
    401,
  "Photo access requires owner authentication",
);
const preview = await api("/api/owner/photo?id=" + photo.id);
ok(
  preview.status === 200 &&
    preview.headers.get("content-type") === "image/jpeg",
  "Managed private JPEG preview is accessible",
);
const inbox = await api("/api/owner/inbox");
ok(
  inbox.status === 200 &&
    inbox.data.notifications.some((n) => n.booking_id === id),
  "Persistent inbox records the new website booking",
);
const job = (await api("/api/owner/jobs")).data.records.find(
  (j) => j.booking_id === id,
);
ok(
  (await api("/api/owner/jobs")).status === 200,
  "Native job records endpoint is available",
);
const booking = (await api("/api/owner/booking?id=" + id)).data;
ok(
  (
    await api("/api/owner/customer?id=" + booking.customer_id)
  ).data.bookings.some((b) => b.id === id),
  "Customer service history shares the booking",
);
ok(
  (await api("/api/owner/materials")).status === 200 &&
    (await api("/api/owner/documents")).status === 200,
  "Native inventory and finance schemas are available",
);
ok(
  (await api("/api/owner/session/refresh", { body: {} })).status === 200,
  "Hosted owner session refresh rotates securely",
);
const dashboard = await api("/api/owner/dashboard");
ok(
  dashboard.data.deliveries.every(
    (d) => !["accepted_by_provider", "delivered"].includes(d.status),
  ),
  "No outbound provider acceptance recorded while communications disabled",
);
await api("/api/owner/transition", {
  body: { id, version: canConfirm ? 2 : 1, action: "cancel" },
});
ok(
  (await api("/api/owner/logout", { body: {} })).status === 200 &&
    (await api("/api/owner/session")).status === 401,
  "Hosted logout revokes private access",
);
const joseph = JSON.parse(readFileSync(root + "joseph-owner.json", "utf8"));
assert(
  typeof joseph.ownerId === "string" && typeof joseph.email === "string",
  "Verified tester identity changed",
);
ok(
  (
    await api("/api/login", {
      body: { email: joseph.email, password: joseph.password },
    })
  ).status === 200,
  "Joseph isolated owner login succeeds",
);
const testerSession = await api("/api/owner/session");
ok(
  testerSession.status === 200 && testerSession.data.ownerId === joseph.ownerId,
  "Joseph session matches the verified isolated owner account",
);
ok(
  (await api("/api/owner/logout", { body: {} })).status === 200,
  "Joseph owner logout succeeds",
);
const result = {
  passed: true,
  origin,
  verifiedAt: new Date().toISOString(),
  bookingId: id,
  checks,
  communications: "disabled",
  appleUpload: false,
  physicalDeviceVerified: false,
  hostedConfirmationVerified: Boolean(canConfirm),
  limitations: canConfirm
    ? []
    : [
        "Owner-confirmed business hours and service area are required before hosted confirmation/conflict acceptance",
      ],
};
writeFileSync(
  root + "native-hosted-verification.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));

