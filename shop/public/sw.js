/* eslint-disable no-undef */
/**
 * سرویس‌ورکر فندق.
 *
 * دو کار می‌کند و بس:
 *   ۱) اعلان پوش را نشان می‌دهد و با کلیک، صفحهٔ مربوطه را باز می‌کند
 *   ۲) یک صفحهٔ آفلاین ساده نگه می‌دارد تا وقتی اینترنت قطع است، به‌جای خطای
 *      مرورگر پیام فارسی دیده شود
 *
 * عمداً هیچ صفحه یا داده‌ای کش نمی‌شود: قیمت، مصرف و وضعیت سرویس باید همیشه
 * تازه باشند و کش‌کردنشان بیشتر ضرر دارد تا سود.
 */

const OFFLINE_CACHE = "fandogh-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      return (await cache.match(OFFLINE_URL)) ?? Response.error();
    }),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "فندق", body: "", url: "/dashboard", tag: "fandogh" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      dir: "rtl",
      lang: "fa",
      data: { url: data.url || "/dashboard" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
