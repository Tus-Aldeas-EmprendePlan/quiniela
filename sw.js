// Guarda la app en el móvil para que abra rápido, pero siempre pide la versión más nueva primero.
const VERSION = "pena-v13";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;   // Supabase, ESPN, fuentes: directo
  // Red primero y sin caché del navegador; si no hay conexión, la última copia guardada
  const req = e.request.mode === "navigate" ? fetch(u.href, { cache: "no-store", credentials: "same-origin" }) : fetch(e.request, { cache: "no-store" });
  e.respondWith(req.then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(m => m || caches.match("./"))));
});
