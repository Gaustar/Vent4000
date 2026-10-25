// ============================================================
// Vent4000 — L'avion de largage en direct (ADS-B)
//
// Source : le réseau communautaire adsb.lol (données ouvertes ODbL,
// gratuites, sans clé), adsb.fi en secours. Ni l'un ni l'autre n'ouvre
// le CORS : le relais (relais/worker.js) interroge, filtre avec ce module
// et renvoie du JSON à l'app.
//
// Ce qu'on affiche est un FAIT reçu, jamais une déduction : position,
// altitude, vitesse, montée/descente, âge du signal. Pas de signal ne
// veut PAS dire « au sol » : l'avion peut ne pas émettre, ou être hors
// de portée des récepteurs à basse altitude. L'app le dit.
//
// Module pur (aucune dépendance DOM) : relais, app et tests Node.
// ============================================================

import { DZ } from "./config.js";

/**
 * Avion(s) du club. Immatriculation relevée sur jetphotos.com (Cessna 208
 * Caravan photographié à Namur-Suarlée de 2022 à 2025) ; capacité
 * cohérente avec le site du club (« 14 parachutistes et maximum 4
 * tandems »). Confirmée par un membre du club le 2026-10-25.
 */
export const AVIONS_CLUB = ["F-GHGZ"];

/** Types d'avions de largage : un appareil de ce type près du terrain est montré, sans être donné pour l'avion du club. */
export const TYPES_LARGAGE = ["C208", "PC6T", "PC6P", "DHC6"];

export const RAYON_KM = 15;          // zone de largage et montée
export const RAYON_NM = 9;           // ≈ 16,7 km, demandé au réseau
export const PLAFOND_FT = 18000;     // au-dessus, ce n'est pas un largage
export const SIGNAL_PERIME_S = 60;   // au-delà, la position n'est plus « en direct »

const FT = 0.3048;
const KT = 1.852;

/** Distance en km entre deux points (haversine). */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Cap (°) du terrain vers un point : pour placer l'avion sur le radar. */
export function relevement(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * rad) * Math.cos(lat2 * rad);
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

const nombre = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Réponse ADS-B (format « readsb » : {ac:[{hex, r, t, lat, lon, alt_baro, gs, baro_rate, track, seen_pos}]})
 * → avions de largage près du terrain, les plus pertinents d'abord.
 * @returns {{hex:string, immat:string|null, type:string|null, club:boolean, lat:number, lon:number,
 *   altitudeFt:number|null, altitudeM:number|null, auSol:boolean, vitesseKmh:number|null,
 *   vario:number|null, cap:number|null, distanceKm:number, relevement:number, ageS:number|null}[]}
 */
export function lireAvions(donnees) {
  const liste = Array.isArray(donnees?.ac) ? donnees.ac : [];
  const avions = [];
  for (const a of liste) {
    const lat = nombre(a?.lat);
    const lon = nombre(a?.lon);
    if (lat == null || lon == null) continue;
    const immat = typeof a.r === "string" ? a.r.trim().toUpperCase() : null;
    const type = typeof a.t === "string" ? a.t.trim().toUpperCase() : null;
    const club = immat != null && AVIONS_CLUB.includes(immat);
    if (!club && !TYPES_LARGAGE.includes(type)) continue;
    const auSol = a.alt_baro === "ground";
    const altitudeFt = auSol ? 0 : nombre(a.alt_baro) ?? nombre(a.alt_geom);
    if (altitudeFt != null && altitudeFt > PLAFOND_FT) continue;
    const distance = distanceKm(DZ.lat, DZ.lon, lat, lon);
    if (distance > RAYON_KM) continue;
    const gs = nombre(a.gs);
    avions.push({
      hex: String(a.hex ?? "").replace(/^~/, ""),
      immat,
      type,
      club,
      lat,
      lon,
      altitudeFt: altitudeFt != null ? Math.round(altitudeFt) : null,
      altitudeM: altitudeFt != null ? Math.round(altitudeFt * FT) : null,
      auSol,
      vitesseKmh: gs != null ? Math.round(gs * KT) : null,
      vario: nombre(a.baro_rate) ?? nombre(a.geom_rate),
      cap: nombre(a.track),
      distanceKm: Math.round(distance * 10) / 10,
      relevement: Math.round(relevement(DZ.lat, DZ.lon, lat, lon)),
      ageS: nombre(a.seen_pos) ?? nombre(a.seen),
    });
  }
  return avions.sort((x, y) => Number(y.club) - Number(x.club) || x.distanceKm - y.distanceKm);
}

/** « en montée » / « en descente » / « en palier » / « au sol » d'après le variomètre (ft/min). */
export function phaseVol(avion) {
  if (!avion) return null;
  if (avion.auSol) return "au sol";
  if (avion.vario == null) return null;
  if (avion.vario > 300) return "en montée";
  if (avion.vario < -300) return "en descente";
  return "en palier";
}
