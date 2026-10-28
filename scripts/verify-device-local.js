import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { runtimeConfig } from "../src/runtime-config.js";
import { protectDeviceDirectory } from "../src/private-files.js";
const config = runtimeConfig();
assert.equal(config.environment, "device-test");
assert.equal(config.connectionMode, "local-only");
assert.equal(config.origin, "http://localhost:4324");
assert.equal(config.deliveryPolicy.pushEnabled, false);
assert.equal(config.deliveryPolicy.emailEnabled, false);
const credentials = JSON.parse(
    readFileSync("data/device-test/joseph-test-owner.json", "utf8"),
  ),
  code = readFileSync("data/device-test/access-code.txt", "utf8").trim(),
  bookingIds = [],
  runId = randomUUID();
let cookies = "",
  original = null,
  changed = false;
const results = {
  origin: config.origin,
  runId,
  startedAt: new Date().toISOString(),
  pushEnabled: false,
  emailEnabled: false,
  checks: [],
};
async function call(path, method = "GET", body, authenticated = true) {
  const response = await fetch(config.origin + path, {
    method,
    headers: {
      Origin: config.origin,
      "Content-Type": "application/json",
      ...(authenticated && cookies ? { Cookie: cookies } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  const content = await response.text();
  try {
    data = JSON.parse(content);
  } catch {
    data = content;
  }
  return { response, data };
}
function check(ok, name) {
  assert.ok(ok, name);
  results.checks.push(name);
}
const fileDb = new DatabaseSync(config.databasePath, { readOnly: true });
try {
  assert.equal(
    fileDb
      .prepare(
        "SELECT count(*) n FROM bookings WHERE status IN ('confirmed','rescheduled','in_progress','awaiting_acceptance')",
      )
      .get().n,
    0,
    "Do not run synthetic scheduling verification while active bookings exist",
  );
} finally {
  fileDb.close();
}
try {
  check(
    (await call("/api/catalog", "GET", undefined, false)).response.status ===
      401,
    "Tester gate rejects unauthenticated API access",
  );
  const wrong = await call(
    "/dev-access",
    "POST",
    { code: "intentionally-invalid-code" },
    false,
  );
  check(wrong.response.status === 401, "Invalid tester code rejected");
  const gate = await call("/dev-access", "POST", { code }, false);
  check(gate.response.status === 200, "Tester gate accepts private local code");
  cookies = gate.response.headers.get("set-cookie").split(";")[0];
  check(
    (await call("/api/owner/dashboard")).response.status === 401,
    "Tester gate alone cannot access owner records",
  );
  check(
    (
      await call("/api/login", "POST", {
        email: credentials.login,
        password: "intentionally-invalid-password",
      })
    ).response.status === 401,
    "Invalid owner password rejected",
  );
  const login = await call("/api/login", "POST", {
    email: credentials.login,
    password: credentials.password,
  });
  check(
    login.response.status === 200,
    "Joseph isolated test owner authenticates",
  );
  cookies += "; " + login.response.headers.get("set-cookie").split(";")[0];
  const dashboard = await call("/api/owner/dashboard");
  check(
    dashboard.response.status === 200,
    "Authenticated owner dashboard available",
  );
  original = dashboard.data.settings;
  const synthetic = {
    ...original,
    scheduleConfirmed: true,
    serviceAreaConfirmed: true,
    serviceArea: "SYNTHETIC LOCAL VERIFICATION ONLY — restored after test",
    workingDays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    openMinute: 0,
    closeMinute: 1440,
    closedDates: [],
    bufferMinutes: 30,
    maxDaily: 2,
  };
  const settings = await call("/api/owner/settings", "PUT", synthetic);
  check(
    settings.response.status === 200,
    "Synthetic schedule applied only to the isolated instance",
  );
  changed = true;
  const date = new Date(Date.now() + 7 * 86400000);
  date.setUTCHours(17, 0, 0, 0);
  const input = {
    packageId: "dustoff",
    addonIds: [],
    firstName: "Synthetic",
    lastName: "Local verification",
    phone: "8065550100",
    email: "synthetic-local@example.invalid",
    address: "TEST ONLY — no real service address",
    year: 2020,
    make: "Test",
    model: "Verification",
    color: "Blue",
    bodyType: "Sedan",
    requestedAt: date.toISOString(),
    concerns: "Synthetic local readiness check; cancelled after verification.",
    acceptNotice: true,
    website: "",
  };
  async function book(key) {
    const response = await fetch(config.origin + "/api/bookings", {
        method: "POST",
        headers: {
          Origin: config.origin,
          "Content-Type": "application/json",
          Cookie: cookies,
          "Idempotency-Key": key,
        },
        body: JSON.stringify(input),
      }),
      data = await response.json();
    assert.equal(response.status, 201, "Synthetic request must be saved");
    bookingIds.push(data.id);
    return data;
  }
  const first = await book(runId + "-first"),
    second = await book(runId + "-second");
  check(
    first.status === "pending" && second.status === "pending",
    "Two synthetic requests persist as pending",
  );
  const confirmed = await call("/api/owner/transition", "POST", {
    id: first.id,
    version: 1,
    action: "confirm",
    durationMinutes: 90,
  });
  check(
    confirmed.response.status === 200 && confirmed.data.status === "confirmed",
    "Owner confirms the first appointment",
  );
  const conflict = await call("/api/owner/transition", "POST", {
    id: second.id,
    version: 1,
    action: "confirm",
    durationMinutes: 90,
  });
  check(
    conflict.response.status === 409,
    "Overlapping confirmed appointment is rejected",
  );
  const day = date.toISOString().slice(0, 10),
    calendar = await call("/api/owner/calendar?from=" + day + "&to=" + day);
  check(
    calendar.response.status === 200 &&
      calendar.data.bookings.some(
        (b) => b.id === first.id && b.status === "confirmed",
      ),
    "Calendar contains the confirmed appointment",
  );
  const persisted = new DatabaseSync(config.databasePath, { readOnly: true });
  try {
    check(
      persisted.prepare("SELECT status FROM bookings WHERE id=?").get(first.id)
        .status === "confirmed",
      "Independent database connection verifies persisted confirmed status",
    );
    check(
      persisted
        .prepare("SELECT count(*) n FROM history WHERE booking_id=?")
        .get(first.id).n === 2,
      "Booking request and confirmation history persist",
    );
    check(
      persisted
        .prepare(
          "SELECT count(*) n FROM deliveries WHERE status IN ('accepted_by_provider','delivered_to_mail_server')",
        )
        .get().n === 0,
      "No notification was accepted by any provider",
    );
  } finally {
    persisted.close();
  }
} finally {
  let cleanupFailure;
  for (const id of bookingIds) {
    try {
      const current = await call("/api/owner/booking?id=" + id);
      if (
        current.response.status === 200 &&
        ["pending", "confirmed", "rescheduled", "awaiting_acceptance"].includes(
          current.data.status,
        )
      ) {
        const cancelled = await call("/api/owner/transition", "POST", {
          id,
          version: current.data.version,
          action: "cancel",
        });
        assert.equal(cancelled.response.status, 200);
      }
    } catch (error) {
      cleanupFailure = error;
    }
  }
  if (changed) {
    const restored = await call("/api/owner/settings", "PUT", original);
    assert.equal(
      restored.response.status,
      200,
      "Restore original unconfirmed business settings",
    );
    results.checks.push(
      "Original business settings restored; synthetic requests cancelled",
    );
  }
  if (cookies) {
    await call("/api/owner/logout", "POST", {});
    check(
      (await call("/api/owner/dashboard")).response.status === 401,
      "Owner logout revokes the verification session",
    );
  }
  if (cleanupFailure) throw cleanupFailure;
  results.bookingIds = bookingIds;
  results.finishedAt = new Date().toISOString();
  writeFileSync(
    "data/device-test/local-verification.json",
    JSON.stringify(results, null, 2),
    { mode: 0o600 },
  );
  protectDeviceDirectory();
}
console.log(
  JSON.stringify(
    {
      passed: true,
      checks: results.checks,
      syntheticBookings: bookingIds.length,
      settingsRestored: true,
      communications: "disabled",
      report: "data/device-test/local-verification.json",
    },
    null,
    2,
  ),
);
