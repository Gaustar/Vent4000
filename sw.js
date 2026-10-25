// ============================================================
// Vent4000 — Service worker
// Shell applicatif : cache-first. API météo (Open-Meteo, MET Norway) : network-first
// avec repli sur la dernière prévision en cache (mode hors-ligne).
// ============================================================

const CACHE = "vent4000-v25";
const SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/config.js",
  "./js/avion.js",
  "./js/carburant.js",
  "./js/club.js",
  "./js/deplacement.js",
  "./js/meteo.js",
  "./js/metar.js",
  "./js/ouverture.js",
  "./js/profil.js",
  "./js/regles.js",
  "./js/scoring.js",
  "./js/tendance.js",
  "./manifest.json",
  "./fonts/barlow-400.woff2",
  "./fonts/barlow-500.woff2",
  "./fonts/barlow-600.woff2",
  "./fonts/barlow-condensed-500.woff2",
  "./fonts/barlow-condensed-600.woff2",
  "./fonts/barlow-condensed-700.woff2",
  "./fonts/ibm-plex-mono-400.woff2",
  "./fonts/ibm-plex-mono-500.woff2",
  "./fonts/ibm-plex-mono-600.woff2",
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

  // API météo (prévisions, METAR, TAF) : réseau d'abord, cache en secours
  if (["api.open-meteo.com", "api.met.no"].includes(url.hostname)) {
    e.respondWith(
      fetch(e.request)
        .then((rep) => {
          if (rep.ok) {
            // L'en-tête HTTP `Date` est illisible en CORS : la copie en cache
            // porte donc l'heure de réception, pour que l'âge affiché hors-ligne
            // soit celui des données et non celui de l'ouverture de l'app.
            const copie = rep.clone();
            const entetes = new Headers(copie.headers);
            entetes.set("x-vent4000-recu", new Date().toISOString());
            const datee = new Response(copie.body, { status: copie.status, statusText: copie.statusText, headers: entetes });
            caches.open(CACHE).then((c) => c.put(e.request, datee));
          }
          return rep;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Shell (polices comprises) : cache d'abord, réseau en secours
  e.respondWith(
    caches.match(e.request).then((enCache) => {
      if (enCache) return enCache;
      return fetch(e.request).then((rep) => {
        if (rep.ok && url.origin === location.origin) {
          const copie = rep.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copie));
        }
        return rep;
      });
    })
  );
});
