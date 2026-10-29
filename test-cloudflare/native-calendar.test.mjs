import test from "node:test";
import assert from "node:assert/strict";
import { runtime, seed, login, call, input } from "./helpers.mjs";
test("native partial schedule updates preserve business preferences and enforce confirmed appointment conflicts", async () => {
  const { mf, db } = await runtime();
  try {
    const { cfg } = await seed(db);
    const cookie = await login(mf);
    const changed = await call(mf, "/api/owner/schedule-settings", {
      method: "PUT",
      cookie,
      body: {
        workingDays: cfg.workingDays,
        openMinute: 540,
        closeMinute: 1020,
      },
    });
    assert.equal(changed.status, 200);
    assert.deepEqual(
      changed.data.notificationPreferences,
      cfg.notificationPreferences,
    );
    assert.equal(changed.data.timezone, cfg.timezone);
    assert.equal(changed.data.googleReviewUrl, cfg.googleReviewUrl);
    const invalid = await call(mf, "/api/owner/schedule-settings", {
      method: "PUT",
      cookie,
      body: { notificationPreferences: { emailEnabled: true } },
    });
    assert.equal(invalid.status, 400);
    const created = await call(mf, "/api/bookings", {
      method: "POST",
      body: input(),
      key: "native-calendar-fixture",
    });
    assert.equal(created.status, 201);
    const confirmed = await call(mf, "/api/owner/transition", {
      method: "POST",
      cookie,
      body: {
        id: created.data.id,
        version: 1,
        action: "confirm",
        durationMinutes: 90,
      },
    });
    assert.equal(confirmed.status, 200);
    const conflict = await call(mf, "/api/owner/schedule-settings", {
      method: "PUT",
      cookie,
      body: { closeMinute: 660 },
    });
    assert.equal(conflict.status, 409);
    const dashboard = await call(mf, "/api/owner/dashboard", { cookie });
    assert.equal(dashboard.data.settings.closeMinute, 1020);
    const details = await call(mf, "/api/owner/booking?id=" + created.data.id, {
      cookie,
    });
    assert.equal(
      JSON.parse(details.data.data).requestedAt,
      input().requestedAt,
    );
  } finally {
    await mf.dispose();
  }
});
