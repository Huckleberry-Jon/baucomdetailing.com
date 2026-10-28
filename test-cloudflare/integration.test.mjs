import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  runtime,
  seed,
  call,
  login,
  input,
  future,
  origin,
} from "./helpers.mjs";
import { passwordHash } from "../src/security.js";

test("actual workerd/D1: complete booking, scheduling and conflict lifecycle", async (t) => {
  const { mf, db } = await runtime();
  try {
    const { cfg } = await seed(db),
      cookie = await login(mf);
    const create = async (overrides = {}) => {
      const r = await call(mf, "/api/bookings", {
        method: "POST",
        body: input(overrides),
        key: randomUUID(),
      });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      return r.data;
    };
    const transition = (b, action, extra = {}, customer = false) =>
      call(mf, customer ? "/api/customer/booking" : "/api/owner/transition", {
        method: "POST",
        body: { id: b.id, version: b.version, action, ...extra },
        ...(customer ? { secret: b.accessToken } : { cookie }),
      });
    let a, b, confirmed;
    await t.test(
      "catalog retains exact prices and scoped business settings",
      async () => {
        const r = await call(mf, "/api/catalog");
        assert.equal(r.status, 200);
        assert.equal(
          r.data.services.find((s) => s.id === "dustoff").min,
          11900,
        );
      },
    );
    await t.test(
      "booking intake persists customer, vehicle, audit and notification atomically",
      async () => {
        a = await create();
        assert.equal(
          (
            await db
              .prepare("SELECT count(*) n FROM history WHERE booking_id=?")
              .bind(a.id)
              .first()
          ).n,
          1,
        );
        assert.equal(
          (
            await db
              .prepare(
                "SELECT count(*) n FROM notifications WHERE booking_id=?",
              )
              .bind(a.id)
              .first()
          ).n,
          1,
        );
      },
    );
    await t.test(
      "idempotency rejects changed payload and returns no new private token for duplicates",
      async () => {
        const key = randomUUID(),
          body = input({ requestedAt: future(300) }),
          one = await call(mf, "/api/bookings", { method: "POST", body, key }),
          two = await call(mf, "/api/bookings", { method: "POST", body, key });
        assert.equal(one.status, 201);
        assert.equal(two.status, 200);
        assert.equal(two.data.id, one.data.id);
        assert.equal(two.data.accessToken, undefined);
        assert.equal(
          (
            await call(mf, "/api/bookings", {
              method: "POST",
              body: { ...body, color: "Red" },
              key,
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "invalid input and invalid image leave no partial customer or booking",
      async () => {
        const before = await db
          .prepare("SELECT count(*) n FROM customers")
          .first();
        assert.equal(
          (
            await call(mf, "/api/bookings", {
              method: "POST",
              body: input({ email: "bad" }),
              key: randomUUID(),
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await call(mf, "/api/bookings", {
              method: "POST",
              body: input({
                photos: [
                  {
                    name: "x.svg",
                    base64: Buffer.from("<svg/>").toString("base64"),
                  },
                ],
              }),
              key: randomUUID(),
            })
          ).status,
          400,
        );
        assert.equal(
          (await db.prepare("SELECT count(*) n FROM customers").first()).n,
          before.n,
        );
      },
    );
    await t.test(
      "two simultaneous D1 confirmations have exactly one winner",
      async () => {
        b = await create();
        const results = await Promise.all([
          transition(a, "confirm", { durationMinutes: 90 }),
          transition(b, "confirm", { durationMinutes: 90 }),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        const i = results.findIndex((r) => r.status === 200);
        confirmed = { ...[a, b][i], ...results[i].data };
        assert.equal(
          (
            await db
              .prepare(
                "SELECT count(*) n FROM bookings WHERE status='confirmed'",
              )
              .first()
          ).n,
          1,
        );
      },
    );
    await t.test(
      "stale versions, buffers, daily capacity and business hours reject conflicting changes",
      async () => {
        assert.equal(
          (
            await transition({ ...confirmed, version: 1 }, "propose", {
              startAt: future(180),
              durationMinutes: 90,
              priceCents: 15000,
            })
          ).status,
          409,
        );
        const adjacent = await create({ requestedAt: future(90) });
        assert.equal(
          (await transition(adjacent, "confirm", { durationMinutes: 30 }))
            .status,
          409,
        );
        const night = await create({
          requestedAt: new Date(
            new Date(future()).setUTCHours(5),
          ).toISOString(),
        });
        assert.equal(
          (await transition(night, "confirm", { durationMinutes: 30 })).status,
          409,
        );
        const result = await call(mf, "/api/owner/settings", {
          method: "PUT",
          cookie,
          body: { ...cfg, maxDaily: 1 },
        });
        assert.equal(result.status, 200);
        const capacity = await create({ requestedAt: future(180) });
        assert.equal(
          (await transition(capacity, "confirm", { durationMinutes: 30 }))
            .status,
          409,
        );
        assert.equal(
          (
            await call(mf, "/api/owner/settings", {
              method: "PUT",
              cookie,
              body: cfg,
            })
          ).status,
          200,
        );
      },
    );
    await t.test(
      "proposal preserves old reservation; revised price needs private customer acceptance",
      async () => {
        const proposal = await transition(confirmed, "propose", {
          startAt: future(240),
          durationMinutes: 60,
          priceCents: 17000,
        });
        assert.equal(proposal.status, 200);
        confirmed = { ...confirmed, ...proposal.data };
        const old = await create();
        assert.equal(
          (await transition(old, "confirm", { durationMinutes: 30 })).status,
          409,
        );
        const accepted = await transition(confirmed, "accept", {}, true);
        assert.equal(accepted.status, 200);
        assert.equal(accepted.data.status, "rescheduled");
        assert.equal(accepted.data.proposal.priceCents, 17000);
        confirmed = { ...confirmed, ...accepted.data };
      },
    );
    await t.test(
      "calendar contains requests/confirmed/proposed and blocked time prevents confirmation",
      async () => {
        const block = await call(mf, "/api/owner/block", {
          method: "POST",
          cookie,
          body: {
            startAt: future(400),
            endAt: future(500),
            label: "Synthetic block",
          },
        });
        assert.equal(block.status, 201);
        const blocked = await create({ requestedAt: future(420) });
        assert.equal(
          (await transition(blocked, "confirm", { durationMinutes: 30 }))
            .status,
          409,
        );
        assert.equal(
          (
            await call(mf, "/api/owner/block", {
              method: "POST",
              cookie,
              body: {
                startAt: future(240),
                endAt: future(300),
                label: "Conflict",
              },
            })
          ).status,
          409,
        );
        const from = future().slice(0, 10),
          r = await call(
            mf,
            "/api/owner/calendar?from=" + from + "&to=" + from,
            { cookie },
          );
        assert.equal(r.status, 200);
        assert.ok(r.data.bookings.some((x) => x.id === confirmed.id));
        assert.equal(r.data.blocks.length, 1);
        const availability = await call(
          mf,
          "/api/availability?day=" + from + "&packageId=dustoff",
        );
        assert.equal(availability.status, 200);
        assert.ok(!availability.data.slots.includes(future(240)));
      },
    );
    await t.test(
      "closed dates and unknown service durations behave as the existing website",
      async () => {
        const day = future().slice(0, 10);
        assert.equal(
          (
            await call(mf, "/api/owner/settings", {
              method: "PUT",
              cookie,
              body: { ...cfg, closedDates: [day] },
            })
          ).status,
          409,
        );
        const service = (await call(mf, "/api/catalog")).data.services.find(
          (s) => s.id === "route66",
        );
        assert.equal(
          (
            await call(mf, "/api/owner/service", {
              method: "PUT",
              cookie,
              body: { ...service, durationMinutes: null },
            })
          ).status,
          200,
        );
        const r = await call(
          mf,
          "/api/availability?day=" + day + "&packageId=route66",
        );
        assert.equal(r.data.needsDuration, true);
        assert.equal(
          (await call(mf, "/api/availability?day=2026-02-31&packageId=route66"))
            .status,
          400,
        );
      },
    );
    await t.test(
      "customer token required, lifecycle complete and notification failures never erase booking",
      async () => {
        assert.equal(
          (
            await call(mf, "/api/customer/booking?id=" + confirmed.id, {
              secret: "wrong",
            })
          ).status,
          403,
        );
        let r = await transition(confirmed, "start");
        assert.equal(r.status, 200);
        confirmed = { ...confirmed, ...r.data };
        r = await transition(confirmed, "complete");
        assert.equal(r.data.status, "completed");
        assert.equal(
          (
            await call(mf, "/api/customer/booking?id=" + confirmed.id, {
              secret: confirmed.accessToken,
            })
          ).data.status,
          "completed",
        );
        const r2 = await create({ requestedAt: future(600) });
        assert.equal(
          (await transition(r2, "cancel", {}, true)).data.status,
          "cancelled",
        );
        const history = await call(
          mf,
          "/api/owner/history?id=" + confirmed.id,
          { cookie },
        );
        assert.ok(history.data.length >= 5);
        const rows = await db
          .prepare("SELECT * FROM bookings WHERE id=?")
          .bind(confirmed.id)
          .first();
        assert.equal(rows.status, "completed");
      },
    );
    await t.test(
      "signed customer receipt/review can attach only to its completed booking",
      async () => {
        const r = await call(mf, "/api/reviews", {
          method: "POST",
          key: randomUUID(),
          secret: confirmed.accessToken,
          body: {
            bookingId: confirmed.id,
            displayName: "Synthetic customer",
            rating: 1,
            feedback: "Synthetic legitimate detailed feedback",
            consent: true,
          },
        });
        assert.equal(r.status, 201);
        assert.equal((await call(mf, "/api/reviews")).data.reviews.length, 0);
        assert.equal(
          (
            await call(mf, "/api/owner/reviews", {
              method: "PUT",
              cookie,
              body: {
                id: r.data.id,
                version: 1,
                status: "rejected",
                reason: "low_rating",
              },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await call(mf, "/api/owner/reviews", {
              method: "PUT",
              cookie,
              body: { id: r.data.id, version: 1, status: "approved" },
            })
          ).status,
          200,
        );
        assert.equal(
          (await call(mf, "/api/reviews")).data.reviews[0].rating,
          1,
        );
      },
    );
  } finally {
    await mf.dispose();
  }
});

test("actual workerd/D1: tenant and owner authorization boundaries", async () => {
  const { mf, db } = await runtime();
  try {
    await seed(db);
    await seed(db, "other", "127.0.0.1:4334");
    const cookie = await login(mf),
      other = await login(mf, "http://127.0.0.1:4334");
    const b = await call(mf, "/api/bookings", {
      method: "POST",
      key: randomUUID(),
      body: input(),
    });
    assert.equal((await call(mf, "/api/owner/dashboard")).status, 401);
    assert.equal(
      (
        await call(mf, "/api/owner/dashboard", {
          cookie,
          host: "http://127.0.0.1:4334",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call(mf, "/api/owner/booking?id=" + b.data.id, {
          cookie: other,
          host: "http://127.0.0.1:4334",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await call(mf, "/api/customer/booking?id=" + b.data.id, {
          secret: b.data.accessToken,
          host: "http://127.0.0.1:4334",
        })
      ).status,
      404,
    );
    assert.equal(
      (await call(mf, "/api/catalog", { host: "http://unknown.invalid" }))
        .status,
      404,
    );
    assert.equal(
      (
        await call(mf, "/api/owner/settings", {
          method: "PUT",
          cookie,
          body: {},
          headers: { Origin: "https://evil.invalid" },
        })
      ).status,
      403,
    );
    const c = await db
      .prepare("SELECT id FROM customers WHERE business_id='baucom' LIMIT 1")
      .first();
    await assert.rejects(
      db
        .prepare("INSERT INTO vehicles VALUES('wrong','other',?,'{}')")
        .bind(c.id)
        .run(),
      /FOREIGN KEY/,
    );
    assert.equal(
      (
        await call(mf, "/api/owner/dashboard", {
          cookie: other,
          host: "http://127.0.0.1:4334",
        })
      ).data.bookings.length,
      0,
    );
    assert.equal(
      (
        await call(mf, "/api/owner/logout", {
          method: "POST",
          cookie,
          body: {},
        })
      ).status,
      200,
    );
    assert.equal(
      (await call(mf, "/api/owner/dashboard", { cookie })).status,
      401,
    );
  } finally {
    await mf.dispose();
  }
});

test("actual workerd/R2/Images: private originals, previews, job association and public consent", async () => {
  const { mf, db, bucket } = await runtime();
  try {
    await seed(db);
    const cookie = await login(mf),
      bytes = await sharp({
        create: {
          width: 2000,
          height: 500,
          channels: 3,
          background: "#215b40",
        },
      })
        .jpeg()
        .toBuffer(),
      photo = { name: "synthetic.jpg", base64: bytes.toString("base64") };
    const b = await call(mf, "/api/bookings", {
      method: "POST",
      key: randomUUID(),
      body: input({ photos: [photo] }),
    });
    assert.equal(b.status, 201, JSON.stringify(b.data));
    const rows = await call(mf, "/api/owner/photos?booking=" + b.data.id, {
      cookie,
    });
    assert.equal(rows.data.length, 1);
    const id = rows.data[0].id;
    assert.equal((await call(mf, "/api/owner/photo?id=" + id)).status, 401);
    const original = await mf.dispatchFetch(
      origin + "/api/owner/photo?id=" + id + "&original=1",
      { headers: { Cookie: cookie } },
    );
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
    const preview = await mf.dispatchFetch(
        origin + "/api/owner/photo?id=" + id,
        { headers: { Cookie: cookie } },
      ),
      meta = await sharp(Buffer.from(await preview.arrayBuffer())).metadata();
    assert.ok(meta.width <= 1600);
    assert.equal(meta.exif, undefined);
    assert.equal(
      (
        await call(mf, "/api/owner/transition", {
          method: "POST",
          cookie,
          body: {
            id: b.data.id,
            version: 1,
            action: "confirm",
            durationMinutes: 90,
          },
        })
      ).status,
      200,
    );
    assert.ok(
      (await call(mf, "/api/owner/photos?booking=" + b.data.id, { cookie }))
        .data[0].job_id,
    );
    assert.equal(
      (
        await call(mf, "/api/owner/invoice-photo", {
          method: "PUT",
          cookie,
          body: { id, include: true },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call(mf, "/api/owner/invoice-photos?booking=" + b.data.id, {
          cookie,
        })
      ).data.length,
      1,
    );
    const draft = await call(mf, "/api/owner/website-photos", {
      method: "POST",
      cookie,
      body: {
        slot: "hero",
        alt: "Synthetic test image",
        caption: "Fixture only",
        rightsNote: "Synthetic test permission",
        photos: [photo],
      },
    });
    assert.equal(draft.status, 201, JSON.stringify(draft.data));
    assert.equal((await call(mf, "/api/website-photos")).data.length, 0);
    assert.equal(
      (
        await call(mf, "/api/owner/website-publish", {
          method: "PUT",
          cookie,
          body: { slot: "hero", publish: true },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call(mf, "/api/owner/website-publish", {
          method: "PUT",
          cookie,
          body: { slot: "hero", publish: true, confirmPermission: true },
        })
      ).status,
      200,
    );
    const gallery = (await call(mf, "/api/website-photos")).data;
    assert.equal(gallery.length, 1);
    assert.equal(gallery[0].original_key, undefined);
    assert.equal(
      (await call(mf, "/api/website-photo?id=" + gallery[0].id)).status,
      200,
    );
    await call(mf, "/api/owner/website-photos", {
      method: "POST",
      cookie,
      body: {
        slot: "hero",
        alt: "Replacement",
        rightsNote: "Synthetic permission",
        photos: [photo],
      },
    });
    assert.equal(
      (await call(mf, "/api/website-photo?id=" + gallery[0].id)).status,
      404,
    );
    const row = await db
      .prepare("SELECT * FROM media WHERE id=?")
      .bind(id)
      .first();
    await bucket.put(row.original_key, new Uint8Array([1, 2, 3]));
    assert.equal(
      (await call(mf, "/api/owner/photo?id=" + id + "&original=1", { cookie }))
        .status,
      503,
    );
  } finally {
    await mf.dispose();
  }
});

test("actual workerd/D1: durable retries, channel controls and exact-booking fallback", async () => {
  const { mf, db, fixture } = await runtime();
  try {
    await seed(db);
    const cookie = await login(mf),
      b = await call(mf, "/api/bookings", {
        method: "POST",
        body: input(),
        key: randomUUID(),
      });
    await fixture("drain", { tenant: "baucom", origin, env: {} });
    const disabled = (await db.prepare("SELECT * FROM deliveries").all())
      .results;
    assert.ok(disabled.length > 0);
    assert.ok(disabled.every((d) => d.status === "blocked"));
    await db.prepare("UPDATE deliveries SET next_attempt=0").run();
    await fixture("drain", {
      tenant: "baucom",
      origin,
      env: {
        COMMUNICATIONS_MODE: "test-only",
        ALLOW_EMAIL_SEND: "true",
        TEST_EMAIL_RECIPIENTS: "owner@example.invalid",
        OWNER_NOTIFICATION_EMAIL: "owner@example.invalid",
        RESEND_API_KEY: "synthetic",
        EMAIL_FROM: "test@example.invalid",
      },
    });
    const after = (await db.prepare("SELECT * FROM deliveries").all()).results;
    // Destinations are captured with the durable event; absent owner email is blocked.
    assert.ok(after.every((d) => ["retry", "blocked"].includes(d.status)));
    assert.ok(JSON.parse(after[0].payload).url.includes(b.data.id));
    assert.ok(
      await db
        .prepare("SELECT id FROM bookings WHERE id=?")
        .bind(b.data.id)
        .first(),
    );
    const d = after[0];
    assert.equal(
      (
        await call(mf, "/api/owner/retry-delivery", {
          method: "POST",
          cookie,
          body: { id: d.id },
        })
      ).status,
      200,
    );
  } finally {
    await mf.dispose();
  }
});
