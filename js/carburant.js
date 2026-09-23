// ============================================================
// Vent4000 — Prix du carburant, source officielle
//
// Le coût d'un aller-retour ne doit pas être figé dans le code : le diesel
// belge a pris plus de 40 % en un an et a battu son record en septembre
// 2026. Un chiffre codé en dur devient faux en quelques semaines et rend
// l'arbitrage du déplacement trompeur.
//
// Source : API be.STAT de **Statbel**, vue « Tarif officiel des produits
// pétroliers en euros », alimentée par la Direction générale de l'Énergie
// du SPF Économie. C'est le prix MAXIMUM légal : une station peut vendre
// moins cher, jamais plus. Licence CC BY 4.0.
//
// Deux raisons de préférer cette source à un comparateur de prix :
//  - elle est officielle et stable (pas de scraping d'une page HTML) ;
//  - elle renvoie `Access-Control-Allow-Origin` reflétant l'origine
//    appelante, donc elle est utilisable directement depuis la PWA sur
//    GitHub Pages, sans proxy ni clé d'API. Vérifié le 2026-09-23.
//
// Le prix est un BONUS : toute panne (réseau, format, hors-ligne) retombe
// silencieusement sur la valeur de config.js. Jamais bloquant.
// ============================================================

const VUE_STATBEL = "9e9cf394-6c54-4d81-8013-7124a8c4bf15";
const URL_STATBEL = `https://bestat.statbel.fgov.be/bestat/api/views/${VUE_STATBEL}/result/JSON`;
const CLE_CACHE = "vent4000.carburant";
const DELAI_MS = 8000;

/** Produit exact dans le jeu de données Statbel. */
export const PRODUIT_DIESEL = "Diesel B7 (€/L)";

/**
 * Extrait le prix TTC d'un produit depuis la réponse Statbel.
 * @returns {{prix:number, jour:string}|null}
 */
export function lirePrix(donnees, produit = PRODUIT_DIESEL) {
  const faits = donnees?.facts;
  if (!Array.isArray(faits)) return null;
  const fait = faits.find((f) => f?.Produit === produit);
  const prix = fait?.["Prix TVA incl."];
  if (typeof prix !== "number" || !Number.isFinite(prix) || prix <= 0) return null;
  return { prix: Math.round(prix * 1000) / 1000, jour: fait.Jour ?? null };
}

function lireCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CLE_CACHE) || "null");
    return typeof c?.prix === "number" ? c : null;
  } catch {
    return null;
  }
}

function ecrireCache(valeur) {
  try { localStorage.setItem(CLE_CACHE, JSON.stringify(valeur)); } catch { /* mode privé */ }
}

/**
 * Prix du diesel du jour, avec repli en cascade :
 * réseau → cache local (dernier prix connu) → null (l'appelant retombe
 * alors sur la valeur de config.js).
 *
 * Le cache sert surtout au mode hors-ligne : le prix officiel ne change
 * qu'une fois par jour, une valeur de la veille reste pertinente pour
 * estimer un plein, contrairement à une prévision météo périmée.
 *
 * @returns {Promise<{prix:number, jour:string|null, source:"statbel"|"cache"}|null>}
 */
export async function prixDiesel(fetchImpl = fetch) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_MS);
  try {
    const rep = await fetchImpl(URL_STATBEL, { signal: controleur.signal });
    if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
    const lu = lirePrix(await rep.json());
    if (!lu) throw new Error("produit introuvable");
    const valeur = { ...lu, source: "statbel" };
    ecrireCache(valeur);
    return valeur;
  } catch {
    const cache = lireCache();
    return cache ? { ...cache, source: "cache" } : null;
  } finally {
    clearTimeout(minuteur);
  }
}
