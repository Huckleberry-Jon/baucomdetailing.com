import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { runtime, seed, login, call, input } from "./helpers.mjs";
test("owner directory: private tenant scope, literal search, safe edits and stale-write rejection", async () => {
  const { mf, db } = await runtime();
  try {
    await seed(db);
    await seed(db, "second", "localhost:4336");
    const cookie = await login(mf),
      other = await login(mf, "http://localhost:4336");
    assert.equal((await call(mf, "/api/owner/customers")).status, 401);
    const created = await call(mf, "/api/bookings", {
      method: "POST",
      key: randomUUID(),
      body: input(),
    });
    assert.equal(created.status, 201);
    let list = await call(mf, "/api/owner/customers?q=Synthetic", { cookie });
    assert.equal(list.status, 200);
    assert.equal(list.data.records.length, 1);
    assert.equal(
      (await call(mf, "/api/owner/customers?q=%25", { cookie })).data.records
        .length,
      0,
    );
    const row = list.data.records[0],
      body = {
        id: row.id,
        version: row.version,
        data: { ...row.data, firstName: "Updated" },
      };
    assert.equal(
      (
        await call(mf, "/api/owner/customers", {
          method: "PUT",
          cookie: other,
          host: "http://localhost:4336",
          body,
        })
      ).status,
      404,
    );
    assert.equal(
      (await call(mf, "/api/owner/customers", { method: "PUT", cookie, body }))
        .status,
      200,
    );
    assert.equal(
      (await call(mf, "/api/owner/customers", { method: "PUT", cookie, body }))
        .status,
      409,
    );
    assert.equal(
      (await call(mf, "/api/owner/customers?q=Updated", { cookie })).data
        .records.length,
      1,
    );
    const vehicles = (await call(mf, "/api/owner/vehicles", { cookie })).data
      .records;
    assert.equal(vehicles.length, 1);
    assert.equal(
      (
        await call(mf, "/api/owner/vehicles", {
          method: "PUT",
          cookie,
          body: { ...vehicles[0], data: { ...vehicles[0].data, year: 1 } },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call(mf, "/api/owner/customers", {
          cookie: other,
          host: "http://localhost:4336",
        })
      ).data.records.length,
      0,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT count(*) n FROM audit_events WHERE event='customers.updated'",
          )
          .first()
      ).n,
      1,
    );
    for (const path of ["/privacy", "/terms", "/booking"])
      assert.equal((await call(mf, path)).status, 200);
  } finally {
    await mf.dispose();
  }
});
