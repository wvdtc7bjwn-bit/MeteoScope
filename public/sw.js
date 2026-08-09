self.__meteoscopePendingNotificationTask = null;
const APP_SHELL_CACHE = "meteoscope-shell-v8";
const APP_SHELL_URLS = [
  "/",
  "/index.html",
  "/site.webmanifest",
  "/icons/icon-32.png",
  "/icons/icon-180.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => Promise.all(APP_SHELL_URLS.map(async (url) => {
        try {
          const response = await fetch(url, { cache: "reload" });
          if (response.ok) await cache.put(url, response);
        } catch {
          // A partial shell is still useful; failed entries are retried on the next visit.
        }
      })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("meteoscope-shell-") && key !== APP_SHELL_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    if (url.pathname === "/" || url.pathname === "/index.html") {
      event.respondWith(networkFirstNavigation(request));
    }
    return;
  }

  if (
    url.pathname.startsWith("/assets/")
    || url.pathname.startsWith("/icons/")
    || url.pathname === "/site.webmanifest"
  ) {
    event.respondWith(cacheFirstStatic(request));
  }
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

async function networkFirstNavigation(request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put("/index.html", response.clone());
    return response;
  } catch {
    return await cache.match("/index.html")
      || await cache.match("/")
      || new Response("MeteoScope is offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
  }
}

async function cacheFirstStatic(request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
