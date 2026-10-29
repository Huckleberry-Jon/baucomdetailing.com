import test from "node:test";
import assert from "node:assert/strict";
import { runtime, seed, login, call } from "./helpers.mjs";
test("actual D1 social settings: owner-only, tenant-isolated, persistent, removable and safe", async () => {
  const { mf, db } = await runtime();
  try {
    await seed(db);
    await seed(db, "second", "localhost:4336");
    const cookie = await login(mf);
    const settings = (await call(mf, "/api/owner/dashboard", { cookie })).data
      .settings;
    const links = {
      instagram: "https://www.instagram.com/baucomdetailingllc/",
      facebook: "https://www.facebook.com/share/1BRoekry1L/?mibextid=wwXIfr",
      tiktok: "https://www.tiktok.com/@baucomdetaling",
    };
    const body = { ...settings, socialLinks: links };
    assert.equal(
      (await call(mf, "/api/owner/settings", { method: "PUT", body })).status,
      401,
    );
    assert.equal(
      (await call(mf, "/api/owner/settings", { method: "PUT", body, cookie }))
        .status,
      200,
    );
    assert.deepEqual(
      (await call(mf, "/api/catalog")).data.settings.socialLinks,
      links,
    );
    assert.equal(
      (await call(mf, "/api/catalog", { host: "http://localhost:4336" })).data
        .settings.socialLinks,
      undefined,
    );
    assert.equal(
      (
        await call(mf, "/api/owner/settings", {
          method: "PUT",
          cookie,
          body: { ...body, socialLinks: { instagram: "javascript:alert(1)" } },
        })
      ).status,
      400,
    );
    assert.deepEqual(
      (await call(mf, "/api/catalog")).data.settings.socialLinks,
      links,
    );
    const persisted = JSON.parse(
      (
        await db
          .prepare("SELECT settings FROM businesses WHERE id='baucom'")
          .first()
      ).settings,
    );
    assert.deepEqual(persisted.socialLinks, links);
    assert.deepEqual(persisted.workingDays, settings.workingDays);
    assert.deepEqual(
      persisted.notificationPreferences,
      settings.notificationPreferences,
    );
    assert.equal(
      (
        await call(mf, "/api/owner/settings", {
          method: "PUT",
          cookie,
          body: { ...body, socialLinks: { ...links, tiktok: null } },
        })
      ).status,
      200,
    );
    assert.equal(
      (await call(mf, "/api/catalog")).data.settings.socialLinks.tiktok,
      null,
    );
  } finally {
    await mf.dispose();
  }
});
