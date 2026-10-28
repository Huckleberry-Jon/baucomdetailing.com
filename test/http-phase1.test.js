import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { fixture, requestInput } from "./helpers.js";
import { createApplication } from "../src/server.js";
import { hash, passwordHash } from "../src/security.js";
import { BUSINESS } from "../src/catalog.js";
import { Webhook } from "svix";
import { randomBytes } from "node:crypto";
test("HTTP workflow covers photos, authorization, review moderation, calendar and signed receipts", async (t) => {
  const { db } = fixture(),
    origin = "http://127.0.0.1:4322",
    app = createApplication(db, {
      origin,
      emailWebhookSecret: "whsec_" + randomBytes(32).toString("base64"),
    });
  await new Promise((resolve) => app.server.listen(4322, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    db.close();
  });
  db.prepare("INSERT INTO owners VALUES(?,?,?,?)").run(
    "owner",
    BUSINESS,
    "owner@example.invalid",
    passwordHash("Synthetic test owner password"),
  );
  const headers = { Origin: origin, "Content-Type": "application/json" },
    call = (path, options = {}) =>
      fetch(origin + path, {
        ...options,
        headers: { ...headers, ...options.headers },
      }),
    json = async (path, method, body, auth = {}) =>
      call(path, {
        method,
        headers: auth,
        body: body ? JSON.stringify(body) : undefined,
      });
  const photo = {
    name: "test.png",
    base64: (
      await sharp({
        create: { width: 50, height: 50, channels: 3, background: "blue" },
      })
        .png()
        .toBuffer()
    ).toString("base64"),
  };
  const bookingResponse = await json(
    "/api/bookings",
    "POST",
    { ...requestInput(), photos: [photo] },
    { "Idempotency-Key": "http-photos" },
  );
  assert.equal(bookingResponse.status, 201);
  const booking = await bookingResponse.json();
  assert.equal(
    (await call("/api/owner/photos?booking=" + booking.id)).status,
    401,
  );
  const login = await json("/api/login", "POST", {
    email: "owner@example.invalid",
    password: "Synthetic test owner password",
  });
  const auth = { Cookie: login.headers.get("set-cookie").split(";")[0] };
  const list = await (
    await call("/api/owner/photos?booking=" + booking.id, { headers: auth })
  ).json();
  assert.equal(list.length, 1);
  assert.equal((await call("/api/owner/photo?id=" + list[0].id)).status, 401);
  const image = await call("/api/owner/photo?id=" + list[0].id, {
    headers: auth,
  });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/jpeg");
  assert.equal(image.headers.get("cache-control"), "no-store");
  assert.equal(
    (await sharp(Buffer.from(await image.arrayBuffer())).metadata()).width,
    50,
  );
  assert.equal(
    (
      await json(
        "/api/owner/transition",
        "POST",
        { id: booking.id, version: 1, action: "confirm", durationMinutes: 60 },
        auth,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await json(
        "/api/owner/photos",
        "POST",
        { bookingId: booking.id, kind: "after", photos: [photo] },
        auth,
      )
    ).status,
    201,
  );
  const review = await (
    await json(
      "/api/reviews",
      "POST",
      {
        displayName: "HTTP reviewer",
        rating: 1,
        feedback: "Synthetic critical feedback for testing.",
        consent: true,
      },
      { "Idempotency-Key": "http-review" },
    )
  ).json();
  assert.equal((await (await call("/api/reviews")).json()).reviews.length, 0);
  assert.equal(
    (
      await json(
        "/api/owner/reviews",
        "PUT",
        { id: review.id, version: 1, status: "approved" },
        auth,
      )
    ).status,
    200,
  );
  assert.equal(
    (await (await call("/api/reviews")).json()).reviews[0].rating,
    1,
  );
  assert.equal(
    (
      await json(
        "/api/webhooks/email",
        "POST",
        { type: "email.delivered", data: { email_id: "fake" } },
        {
          "svix-id": "fake",
          "svix-timestamp": String(Math.floor(Date.now() / 1000)),
          "svix-signature": "fake",
        },
      )
    ).status,
    401,
  );
  const day = requestInput().requestedAt.slice(0, 10);
  const calendar = await (
    await call(`/api/owner/calendar?from=${day}&to=${day}`, { headers: auth })
  ).json();
  assert.equal(calendar.bookings[0].id, booking.id);
});
