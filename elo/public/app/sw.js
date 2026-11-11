/* Service worker do app do instalador: guarda as telas para abrir rápido e sem rede.
   A API (/api/*) NUNCA é guardada: dados sempre frescos e nada sensível fica no cache. */
const VERSAO = "elo-app-v2";
const TELAS = ["/app/", "/app/app.css", "/app/app.js", "/app/nucleo.js", "/app/estado.js", "/app/proposta.js", "/app/os.js", "/app/telas.js", "/app/confirmar.js", "/publico/demo-faixa.js", "/app/manifest.webmanifest", "/app/icone.svg", "/app/icone-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(TELAS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/demo") || url.pathname.startsWith("/webhook")) return;
  // Telas do app: rede primeiro (sempre a versão nova); sem rede, a cópia guardada
  if (req.mode === "navigate") {
    if (!url.pathname.startsWith("/app")) return;
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) {
            const copia = r.clone();
            caches.open(VERSAO).then((c) => c.put("/app/", copia));
          }
          return r;
        })
        .catch(() => caches.match("/app/")),
    );
    return;
  }
  if (!TELAS.includes(url.pathname)) return;
  // Arquivos do app: responde do cache e atualiza por trás
  e.respondWith(
    caches.open(VERSAO).then(async (c) => {
      const guardado = await c.match(req);
      const novo = fetch(req).then((r) => (r.ok && c.put(req, r.clone()), r)).catch(() => guardado);
      return guardado ?? novo;
    }),
  );
});
