// ============================================================
// Vent4000 — Relais : page météo PUBLIQUE du Paraclub de Namur (/club)
// et avion de largage en direct (/avion)
//
// Le site du club n'a ni API ni en-tête CORS : l'app (GitHub Pages) ne
// peut pas le lire elle-même. Ce Worker lit https://paraclubnamur.be/fr/meteo,
// en extrait l'état des activités et le planning (js/club.js, le même
// code que l'app teste), et renvoie du JSON lisible par l'app.
//
// - Page publique uniquement : aucun identifiant, rien de l'espace membre.
// - Copie gardée 2 minutes : au plus ~720 lectures par jour chez le club,
//   quel que soit le nombre d'utilisateurs de l'app.
// - Se présente sous son nom (User-Agent) ; robots.txt du club : autorisé.
// ============================================================

import { lirePageClub } from "../js/club.js";
import { lireAvions, RAYON_NM } from "../js/avion.js";
import { DZ } from "../js/config.js";

const SOURCE = "https://paraclubnamur.be/fr/meteo";
const CACHE_S = 120;
const CACHE_AVION_S = 10;
// Réseaux ADS-B communautaires, sans clé ; CORS fermé, d'où le relais.
// adsb.lol : données ODbL ; adsb.fi : 1 requête/s max (le cache de 10 s la respecte).
const SOURCES_ADSB = [
  { nom: "adsb.lol", url: `https://api.adsb.lol/v2/point/${DZ.lat}/${DZ.lon}/${RAYON_NM}` },
  { nom: "adsb.fi", url: `https://opendata.adsb.fi/api/v2/lat/${DZ.lat}/lon/${DZ.lon}/dist/${RAYON_NM}` },
];
const UA = "Mozilla/5.0 (compatible; Vent4000-relais/1.0; +https://gaustar.github.io/Vent4000/)";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(corps, statut = 200, cacheS = 0) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheS ? `public, max-age=${cacheS}` : "no-store",
    },
  });
}

export default {
  async fetch(requete, env, ctx) {
    if (requete.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(requete.url);
    if (requete.method !== "GET" || !["/club", "/avion"].includes(url.pathname)) return json({ erreur: "introuvable" }, 404);

    const cle = new Request(`${url.origin}${url.pathname}`);
    const enCache = await caches.default.match(cle);
    if (enCache) return enCache;

    if (url.pathname === "/avion") {
      for (const src of SOURCES_ADSB) {
        try {
          const rep = await fetch(src.url, { headers: { "User-Agent": UA } });
          if (!rep.ok) continue;
          const avions = lireAvions(await rep.json());
          const reponse = json({ source: src.nom, recu: new Date().toISOString(), avions }, 200, CACHE_AVION_S);
          ctx.waitUntil(caches.default.put(cle, reponse.clone()));
          return reponse;
        } catch { /* source suivante */ }
      }
      return json({ erreur: "réseaux ADS-B injoignables" }, 502);
    }

    let html;
    try {
      const rep = await fetch(SOURCE, { headers: { "User-Agent": UA, "Accept-Language": "fr" } });
      if (!rep.ok) return json({ erreur: `site du club : HTTP ${rep.status}` }, 502);
      html = await rep.text();
    } catch (e) {
      return json({ erreur: `site du club injoignable : ${e.message}` }, 502);
    }

    const maintenant = new Date();
    const lu = lirePageClub(html, maintenant);
    if (!lu) return json({ erreur: "page du club au format inattendu" }, 502);

    const reponse = json({ source: SOURCE, recu: maintenant.toISOString(), ...lu }, 200, CACHE_S);
    ctx.waitUntil(caches.default.put(cle, reponse.clone()));
    return reponse;
  },
};
