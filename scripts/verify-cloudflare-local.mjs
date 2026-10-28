import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const root = "data/cloudflare-local/",
  credentials = JSON.parse(readFileSync(root + "owner.json", "utf8")),
  origin = "http://localhost:4334";
let cookie = "";
async function api(path, body, extra = {}) {
  const r = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: origin,
      Cookie: cookie,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (r.headers.get("set-cookie"))
    cookie = [cookie, r.headers.get("set-cookie").split(";")[0]]
      .filter(Boolean)
      .join("; ");
  return { status: r.status, data };
}
function check(ok, message) {
  if (!ok) throw Error(message);
}
check(
  (await api("/dev-access", { code: credentials.gateCode })).status === 200,
  "Private gate failed",
);
if (process.argv[2] === "check-restart") {
  const proof = JSON.parse(readFileSync(root + "restart-proof.json", "utf8")),
    r = await api("/api/customer/booking?id=" + proof.bookingId, null, {
      Authorization: "Bearer " + proof.token,
    });
  check(
    r.status === 200 && r.data.status === "cancelled",
    "Persisted booking/status missing after restart",
  );
  console.log(
    JSON.stringify({
      passed: true,
      check: "Booking and cancellation persist after actual Wrangler restart",
      communications: "disabled",
    }),
  );
  process.exit(0);
}
check(
  (await api("/api/owner/dashboard")).status === 401,
  "Gate alone allowed owner access",
);
check(
  (
    await api("/api/login", {
      email: credentials.email,
      password: credentials.password,
    })
  ).status === 200,
  "Owner login failed",
);
const original = (await api("/api/owner/dashboard")).data.settings;
async function settings(value) {
  const r = await fetch(origin + "/api/owner/settings", {
    method: "PUT",
    headers: {
      Origin: origin,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });
  check(r.status === 200, "Settings update failed");
}
const at = new Date(Date.now() + 7 * 86400000);
at.setUTCHours(16, 0, 0, 0);
const input = {
  packageId: "dustoff",
  addonIds: [],
  firstName: "Synthetic",
  lastName: "Runtime verification",
  phone: "8065550100",
  email: "cloud-runtime@example.invalid",
  address: "Synthetic local test address",
  year: 2022,
  make: "Test",
  model: "Sedan",
  color: "Blue",
  bodyType: "Sedan",
  requestedAt: at.toISOString(),
  acceptNotice: true,
};
let a,
  b,
  confirmed = false;
try {
  await settings({
    ...original,
    scheduleConfirmed: true,
    serviceAreaConfirmed: true,
    workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    openMinute: 480,
    closeMinute: 1080,
    bufferMinutes: 15,
    maxDaily: 10,
  });
  a = await api("/api/bookings", input, { "Idempotency-Key": randomUUID() });
  b = await api("/api/bookings", input, { "Idempotency-Key": randomUUID() });
  check(a.status === 201 && b.status === 201, "Booking intake failed");
  const result = await api("/api/owner/transition", {
    id: a.data.id,
    version: 1,
    action: "confirm",
    durationMinutes: 90,
  });
  check(result.status === 200, "Confirmation failed");
  confirmed = true;
  check(
    (
      await api("/api/owner/transition", {
        id: b.data.id,
        version: 1,
        action: "confirm",
        durationMinutes: 90,
      })
    ).status === 409,
    "Overlapping appointment was accepted",
  );
  check(
    (await api("/api/owner/history?id=" + a.data.id)).data.length >= 2,
    "History missing",
  );
} finally {
  if (a?.status === 201)
    await api("/api/owner/transition", {
      id: a.data.id,
      version: confirmed ? 2 : 1,
      action: "cancel",
    });
  if (b?.status === 201)
    await api("/api/owner/transition", {
      id: b.data.id,
      version: 1,
      action: "cancel",
    });
  await settings(original);
  await api("/api/owner/logout", {});
}
writeFileSync(
  root + "restart-proof.json",
  JSON.stringify({ bookingId: a.data.id, token: a.data.accessToken }),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    passed: true,
    checks: [
      "Private tester gate",
      "Separate owner authentication",
      "Durable intake/history",
      "Confirmation conflict prevention",
      "Settings restored and synthetic bookings cancelled",
    ],
    communications: "disabled",
  }),
);
