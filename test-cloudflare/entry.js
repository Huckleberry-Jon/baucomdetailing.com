import app from "../cloudflare/worker.js";
import { CloudBookings } from "../cloudflare/bookings.js";
import { drain, reconcile } from "../cloudflare/notifications.js";
// Test-only entrypoint, never used by the production builder/configuration.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (
      env.CLOUDFLARE_ENV === "local" &&
      url.pathname === "/__responsive" &&
      request.method === "GET"
    ) {
      const width = [320, 390, 430].includes(
        Number(url.searchParams.get("width")),
      )
        ? Number(url.searchParams.get("width"))
        : 390;
      return new Response(
        '<!doctype html><html><head><title>Local mobile booking verification</title></head><body style="margin:0;background:#ddd;font:16px system-ui"><p style="margin:12px">Local responsive fixture · ' +
          width +
          ' × 844 CSS pixels</p><iframe title="Mobile website" src="/#book" style="display:block;width:' +
          width +
          'px;height:844px;border:0;margin:12px"></iframe></body></html>',
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }

    if (url.pathname.startsWith("/__fixture/")) {
      if (request.headers.get("X-Fixture") !== "synthetic-local-only")
        return new Response("Forbidden", { status: 403 });
      const b = await request.json();
      try {
        if (url.pathname === "/__fixture/db") {
          if (b.op === "exec")
            return Response.json({ value: await env.DB.exec(b.sql) });
          if (b.op === "batch")
            return Response.json({
              value: await env.DB.batch(
                b.commands.map((c) => env.DB.prepare(c.sql).bind(...c.args)),
              ),
            });
          const stmt = env.DB.prepare(b.sql).bind(...b.args);
          return Response.json({ value: await stmt[b.op]() });
        }
        if (url.pathname === "/__fixture/r2") {
          if (b.op === "put")
            return Response.json({
              value: await env.MEDIA.put(b.key, Uint8Array.from(b.bytes)),
            });
          if (b.op === "get") {
            const p = await env.MEDIA.get(b.key);
            return Response.json({
              value: p
                ? { bytes: [...new Uint8Array(await p.arrayBuffer())] }
                : null,
            });
          }
          if (b.op === "list")
            return Response.json({
              value: await env.MEDIA.list(b.options ?? {}),
            });
        }
        if (url.pathname === "/__fixture/reconcile") {
          await reconcile(new CloudBookings(env.DB, b.tenant), b.provider);
          return Response.json({ value: true });
        }
        if (url.pathname === "/__fixture/drain") {
          await drain(new CloudBookings(env.DB, b.tenant), b.origin, {
            ...env,
            ...b.env,
          });
          return Response.json({ value: true });
        }
        return new Response("Not found", { status: 404 });
      } catch (e) {
        return Response.json({ error: String(e) }, { status: 500 });
      }
    }
    const response = await app.fetch(request, env, ctx);
    // Same-origin embedding is enabled only in the synthetic loopback visual fixture.
    // Production uses cloudflare/worker.js directly and retains DENY / frame-ancestors none.
    if (env.CLOUDFLARE_ENV === "local" && env.LOCAL_RESPONSIVE_QA === "true") {
      const headers = new Headers(response.headers);
      headers.set("X-Frame-Options", "SAMEORIGIN");
      headers.set(
        "Content-Security-Policy",
        (headers.get("Content-Security-Policy") ?? "").replace(
          "frame-ancestors 'none'",
          "frame-ancestors 'self'",
        ),
      );
      return new Response(response.body, { status: response.status, headers });
    }
    return response;
  },
};
