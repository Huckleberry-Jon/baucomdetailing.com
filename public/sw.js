self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || "Booking update", {
      body: data.body || "Open your dashboard.",
      tag: data.eventId || "booking",
      data: { url: data.url || "/owner" },
      icon: "/icon.svg",
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let u;
  try {
    u = new URL(event.notification.data?.url || "/owner", self.location.origin);
  } catch {
    u = new URL("/owner", self.location.origin);
  }
  if (u.origin !== self.location.origin || u.pathname !== "/owner")
    u = new URL("/owner", self.location.origin);
  event.waitUntil(clients.openWindow(u.href));
});
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const r = await fetch("/api/owner/push-config", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!r.ok) throw Error("Sign in to renew alerts");
        const { publicKey } = await r.json();
        if (!publicKey) throw Error("Push keys unavailable");
        const key = Uint8Array.from(
          atob(publicKey.replaceAll("-", "+").replaceAll("_", "/")),
          (c) => c.charCodeAt(0),
        );
        const subscription =
          event.newSubscription ??
          (await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          }));
        const saved = await fetch("/api/owner/subscription", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: subscription.toJSON(),
            replaces: event.oldSubscription?.endpoint,
          }),
        });
        if (!saved.ok) throw Error("Sign in to save subscription");
      } finally {
        for (const client of await clients.matchAll({ type: "window" }))
          client.postMessage({ type: "subscription-refresh-needed" });
      }
    })(),
  );
});
// Private responses are never cached. An expired owner session requires sign-in to renew.
