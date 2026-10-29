import test from "node:test";
import assert from "node:assert/strict";
import { runtime, seed, login, call } from "./helpers.mjs";
import { hash } from "../src/security.js";
test("actual D1 owner sessions rotate once, reject expired/revoked tokens and isolate owner-wide revocation", async () => {
  const { mf, db } = await runtime();
  try {
    await seed(db);
    await seed(db, "other", "localhost:4336");
    const first = await login(mf),
      second = await login(mf),
      other = await login(mf, "http://localhost:4336");
    const info = await call(mf, "/api/owner/session", { cookie: first });
    assert.equal(info.status, 200);
    assert.equal(info.data.businessId, "baucom");
    assert(info.data.expiresAt > Date.now());
    const race = await Promise.all(
      [1, 2].map(() =>
        call(mf, "/api/owner/session/refresh", {
          method: "POST",
          body: {},
          cookie: first,
        }),
      ),
    );
    assert.deepEqual(race.map((x) => x.status).sort(), [200, 401]);
    const rotated = race
      .find((x) => x.status === 200)
      .headers.get("set-cookie")
      .split(";")[0];
    assert.equal(
      (await call(mf, "/api/owner/dashboard", { cookie: first })).status,
      401,
    );
    assert.equal(
      (await call(mf, "/api/owner/session", { cookie: rotated })).status,
      200,
    );
    assert.equal(
      (
        await call(mf, "/api/owner/session", {
          cookie: rotated,
          host: "http://localhost:4336",
        })
      ).status,
      401,
    );
    await call(mf, "/api/owner/logout", {
      method: "POST",
      body: {},
      cookie: rotated,
    });
    assert.equal(
      (
        await call(mf, "/api/owner/session/refresh", {
          method: "POST",
          body: {},
          cookie: rotated,
        })
      ).status,
      401,
    );
    const fresh = await login(mf);
    await call(mf, "/api/owner/session/revoke-all", {
      method: "POST",
      body: {},
      cookie: second,
    });
    for (const cookie of [second, fresh])
      assert.equal(
        (await call(mf, "/api/owner/session", { cookie })).status,
        401,
      );
    assert.equal(
      (
        await call(mf, "/api/owner/session", {
          cookie: other,
          host: "http://localhost:4336",
        })
      ).status,
      200,
    );
    const expired = await login(mf);
    await db
      .prepare("UPDATE sessions SET expires=0 WHERE token_hash=?")
      .bind(hash(expired.slice("session=".length)))
      .run();
    assert.equal(
      (
        await call(mf, "/api/owner/session/refresh", {
          method: "POST",
          body: {},
          cookie: expired,
        })
      ).status,
      401,
    );
  } finally {
    await mf.dispose();
  }
});
