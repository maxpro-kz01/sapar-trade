// Sapar Trade — сервис-воркер. Нужен, чтобы программу можно было установить и чтобы она открывалась без связи.
// Кэшируем ТОЛЬКО оболочку (страницу и React). Данные (/api, сервер на другом адресе) не кэшируем никогда:
// цены, остатки и долги всегда берутся живыми с сервера.
const SHELL = "st-shell-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // страница: сначала сеть (всегда свежая версия), нет связи — последняя сохранённая
  if (req.mode === "navigate" && url.origin === self.location.origin) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put("/", copy)); }
      return res;
    }).catch(() => caches.match("/").then((r) => r || Response.error())));
    return;
  }
  // React со своего сайта: версия зафиксирована в адресе (/vendor/18.3.1/…), поэтому кэш первым делом
  if (url.origin === self.location.origin && url.pathname.startsWith("/vendor/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
  // всё остальное (API, проверка версии, иконки) — как обычно, мимо кэша
});
