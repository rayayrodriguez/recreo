// Guarda la app para que abra al instante y sin conexión.
// Los datos del cole no pasan por aquí: van siempre directos al intermediario.
const VERSION = "recreo-1.0.0";
const ARCHIVOS = [
  "./",
  "index.html",
  "css/app.css",
  "js/app.js",
  "js/api.js",
  "js/almacen.js",
  "js/config.js",
  "js/demo.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/apple-touch-icon.png",
  "fonts/atkinson-hyperlegible-next-latin-400-normal.woff2",
  "fonts/atkinson-hyperlegible-next-latin-600-normal.woff2",
  "fonts/atkinson-hyperlegible-next-latin-800-normal.woff2",
  "fonts/cifras-400.woff2",
  "fonts/cifras-600.woff2",
  "fonts/cifras-800.woff2",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // La app primero desde la red, para recibir las mejoras; si no hay red, la guardada.
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copia = r.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copia));
        }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))),
  );
});
