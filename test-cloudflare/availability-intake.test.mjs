import test from "node:test";
import assert from "node:assert/strict";
import { runtime, seed, login, call, input, future } from "./helpers.mjs";
function monday() {
  let d = new Date(future());
  while (d.getUTCDay() !== 1) d = new Date(d.getTime() + 86400000);
  return d;
}
test("actual D1 closed Monday is unavailable and cannot create a customer or request", async () => {
  const f = await runtime();
  try {
    await seed(f.db);
    const cookie = await login(f.mf);
    const m = monday(),
      day = m.toISOString().slice(0, 10);
    assert.equal(
      (
        await call(f.mf, "/api/owner/schedule-settings", {
          cookie,
          method: "PUT",
          body: {
            workingDays: ["Sat", "Sun"],
            openMinute: 480,
            closeMinute: 1200,
          },
        })
      ).status,
      200,
    );
    const slots = await call(
      f.mf,
      "/api/availability?day=" + day + "&packageId=dustoff",
    );
    assert.equal(slots.data.slots.length, 0);
    const request = await call(f.mf, "/api/bookings", {
      method: "POST",
      key: "closed-monday",
      body: input({ requestedAt: m.toISOString() }),
    });
    assert.equal(request.status, 409);
    assert.equal(
      (await f.db.prepare("SELECT count(*) n FROM customers").first()).n,
      0,
    );
  } finally {
    await f.mf.dispose();
  }
});
test("actual D1 full-day block appears as closed without private labels and invalidates stale availability", async () => {
  const f = await runtime();
  try {
    await seed(f.db);
    const cookie = await login(f.mf),
      m = monday(),
      day = m.toISOString().slice(0, 10);
    let slots = await call(
      f.mf,
      "/api/availability?day=" + day + "&packageId=dustoff",
    );
    assert(slots.data.slots.length > 0);
    const at = slots.data.slots[0];
    const begin = Date.parse(day),
      end = begin + 32 * 3600000;
    assert.equal(
      (
        await call(f.mf, "/api/owner/block", {
          cookie,
          method: "POST",
          body: {
            startAt: new Date(begin).toISOString(),
            endAt: new Date(end).toISOString(),
            label: "Private blocked Monday",
          },
        })
      ).status,
      201,
    );
    const catalog = await call(f.mf, "/api/catalog");
    assert(catalog.data.settings.closedDates.includes(day));
    assert(!JSON.stringify(catalog.data).includes("Private blocked Monday"));
    slots = await call(
      f.mf,
      "/api/availability?day=" + day + "&packageId=dustoff",
    );
    assert.equal(slots.data.slots.length, 0);
    const rejected = await call(f.mf, "/api/bookings", {
      method: "POST",
      key: "stale-slot",
      body: input({ requestedAt: at }),
    });
    assert.equal(rejected.status, 409);
    const service = await f.db
      .prepare(
        "SELECT data FROM services WHERE id='dustoff' AND business_id='baucom'",
      )
      .first();
    const data = JSON.parse(service.data);
    data.durationMinutes = null;
    await f.db
      .prepare(
        "UPDATE services SET data=? WHERE id='dustoff' AND business_id='baucom'",
      )
      .bind(JSON.stringify(data))
      .run();
    slots = await call(
      f.mf,
      "/api/availability?day=" + day + "&packageId=dustoff",
    );
    assert.equal(slots.data.needsDuration, true);
    assert.equal(slots.data.slots.length, 0);
    assert.equal(
      (await f.db.prepare("SELECT count(*) n FROM bookings").first()).n,
      0,
    );
  } finally {
    await f.mf.dispose();
  }
});
