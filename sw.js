// ============================================================
// Vent4000 — Service worker
// Shell applicatif : cache-first. API météo (Open-Meteo, IEM) : network-first
// avec repli sur la dernière prévision en cache (mode hors-ligne).
// ============================================================

const CACHE = "vent4000-v18";
const SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/config.js",
  "./js/carburant.js",
  "./js/deplacement.js",
  "./js/facteurs.js",
  "./js/meteo.js",
  "./js/metar.js",
  "./js/nuages.js",
  "./js/ouverture.js",
  "./js/probabilite.js",
  "./js/scoring.js",
  "./js/spot.js",
  "./js/tendance.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  // `cache: "reload"` est indispensable : GitHub Pages sert le shell avec
  // `Cache-Control: max-age=600`, donc un addAll classique peut piocher
  // dans le cache HTTP du navigateur et remettre en cache l'ANCIENNE
  // version sous le nouveau nom de cache — une mise à jour qui réussit
  // mais n'installe rien de neuf.
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(SHELL.map((url) => new Request(url, { cache: "reload" })))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((cles) =>
      Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // API météo (prévisions, ensembles, METAR) : réseau d'abord, cache en secours
  if (["api.open-meteo.com", "ensemble-api.open-meteo.com", "mesonet.agron.iastate.edu"].includes(url.hostname)) {
    e.respondWith(
      fetch(e.request)
        .then((rep) => {
          if (rep.ok) {
            const copie = rep.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copie));
          }
          return rep;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Shell + polices : cache d'abord, réseau en secours
  e.respondWith(
    caches.match(e.request).then((enCache) => {
      if (enCache) return enCache;
      return fetch(e.request).then((rep) => {
        if (rep.ok && (url.origin === location.origin || url.hostname.includes("gstatic") || url.hostname.includes("googleapis"))) {
          const copie = rep.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copie));
        }
        return rep;
      });
    })
  );
});
