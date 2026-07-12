self.__meteoscopePendingNotificationTask = null;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil(schedulePendingNotifications());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/?tab=warnings", self.location.origin).href;
  event.waitUntil(openOrFocusClient(targetUrl));
});

async function showPendingNotifications() {
  const subscription = await self.registration.pushManager.getSubscription();
  if (!subscription?.endpoint) return;

  const response = await fetch("/api/push/pending", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint })
  });
  if (!response.ok) return;

  const payload = await response.json().catch(() => ({}));
  const messages = dedupePendingMessages(Array.isArray(payload.messages) ? payload.messages : []);
  await Promise.all(messages.map((message) => {
    const title = message.title || "MeteoScope";
    return self.registration.showNotification(title, {
      body: message.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: message.tag || message.id || "meteoscope-warning",
      renotify: true,
      data: {
        url: message.url || "/?tab=warnings",
        areaCode: message.areaCode || "",
        createdAt: message.createdAt || ""
      }
    });
  }));
}

function schedulePendingNotifications() {
  if (self.__meteoscopePendingNotificationTask) return self.__meteoscopePendingNotificationTask;
  self.__meteoscopePendingNotificationTask = showPendingNotifications()
    .finally(() => {
      self.__meteoscopePendingNotificationTask = null;
    });
  return self.__meteoscopePendingNotificationTask;
}

function dedupePendingMessages(messages) {
  const unique = new Map();
  messages.forEach((message) => {
    const contentKey = `${message?.tag || ""}\u0000${message?.title || ""}\u0000${message?.body || ""}`;
    const key = contentKey !== "\u0000\u0000" ? contentKey : message?.id;
    if (!unique.has(key)) unique.set(key, message);
  });
  return [...unique.values()];
}

async function openOrFocusClient(targetUrl) {
  const clientList = await clients.matchAll({ type: "window", includeUncontrolled: true });
  const target = new URL(targetUrl);
  for (const client of clientList) {
    const clientUrl = new URL(client.url);
    if (clientUrl.origin === target.origin) {
      await client.focus();
      if ("navigate" in client) return client.navigate(targetUrl);
      return;
    }
  }
  return clients.openWindow(targetUrl);
}
