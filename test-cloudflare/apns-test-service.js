// Test-only service: never bundled into the application Worker, no external network.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/3/device/"))
      return Response.json(
        { error: "Synthetic provider outage" },
        { status: 503 },
      );
    const payload = await request.json();
    await env.DB.prepare(
      "INSERT INTO apns_test_requests(id,body,collapse_id) VALUES(?,?,?)",
    )
      .bind(
        crypto.randomUUID(),
        JSON.stringify(payload),
        request.headers.get("apns-collapse-id"),
      )
      .run();
    const row = await env.DB.prepare(
      "SELECT status FROM apns_test_status WHERE id=1",
    ).first();
    return new Response(
      row.status === 200
        ? null
        : JSON.stringify({
            reason:
              row.status === 400 ? "BadDeviceToken" : "ServiceUnavailable",
          }),
      {
        status: row.status,
        headers: {
          "apns-id": request.headers.get("apns-id") ?? "synthetic",
          "Content-Type": "application/json",
        },
      },
    );
  },
};
