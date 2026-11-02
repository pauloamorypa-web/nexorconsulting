/* Service worker do app de ponto: abre rápido e funciona como app instalado. A API nunca é guardada em cache
   (o ponto precisa do horário do servidor). */
const VERSAO = "nexor-ponto-v1";
const CASCA = ["/app/", "/app/app.js", "/app/app.css", "/app.css", "/js/ui.js", "/js/api.js", "/img/logo-mark.webp", "/img/favicon.png", "/app/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Rede primeiro (sempre a versão mais nova), cache se estiver sem internet
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok && CASCA.includes(url.pathname)) {
          const copia = r.clone();
          caches.open(VERSAO).then((c) => c.put(e.request, copia));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r ?? caches.match("/app/"))),
  );
});
