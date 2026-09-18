/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & typeof globalThis & {
  __WB_MANIFEST: Array<unknown>;
};

self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/^\/\.well-known/],
  }),
);

self.addEventListener("push", (event) => {
  let payload: { title?: string; body?: string; url?: string; notificationId?: string } = {};

  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() ?? "You have a new IyanjuPay notification." };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "IyanjuPay", {
      body: payload.body || "You have a new notification.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/", notificationId: payload.notificationId },
      tag: payload.notificationId || `iyanjupay-${Date.now()}`,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients[0];
      if (existing) {
        existing.navigate(url);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
