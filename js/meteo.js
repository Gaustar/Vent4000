// ============================================================
// Vent4000 — Acquisition des données (v2.1)
//
//  1. MODÈLES — 5 modèles de 1,3 à 2,2 km (AROME HD, ICON-D2, HARMONIE
//     KNMI et DMI, UKMO 2 km) et 3 régionaux de 7 à 10 km pour la fin de
//     semaine, en une requête Open-Meteo : vent, rafales, couverture basse,
//     base des nuages (quand le modèle la calcule), visibilité, temps présent.
//  2. PROFIL — vent et température en altitude (ICON, affichage seul).
//  3. AÉRO — METAR et TAF de Charleroi (MET Norway), chargés à part :
//     l'affichage n'attend jamais ce serveur.
// Toutes ces sources sont gratuites, sans clé, ouvertes en CORS.
// ============================================================

import { DZ, MODELES, AERODROME } from "./config.js";
import { parseMetar, parseTaf, tousMessages } from "./metar.js";

const BASE = {
  latitude: DZ.lat,
  longitude: DZ.lon,
  timezone: "Europe/Brussels",
  wind_speed_unit: "kmh",
  forecast_days: "7",
};
const CHAMPS = {
  wind_speed_10m: "vent", wind_gusts_10m: "rafales", wind_direction_10m: "dir",
  cloud_cover_low: "nuagesBas", cloud_cover_mid: "nuagesMoyens", cloud_base: "base",
  visibility: "visibilite", weather_code: "code", precipitation: "precip",
};
export const NIVEAUX_PROFIL = [925, 850, 700, 600];
export const NIVEAUX_AGL = [180, 120, 80];

export function urlModeles() {
  const params = new URLSearchParams({
    ...BASE,
    hourly: Object.keys(CHAMPS).join(","),
    models: MODELES.map((m) => m.id).join(","),
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

export function urlProfil() {
  const hourly = [
    "temperature_2m", "freezing_level_height", "cape",
    ...NIVEAUX_AGL.flatMap((m) => [`wind_speed_${m}m`, `wind_direction_${m}m`]),
    ...NIVEAUX_PROFIL.flatMap((p) => [`wind_speed_${p}hPa`, `wind_direction_${p}hPa`, `temperature_${p}hPa`, `geopotential_height_${p}hPa`]),
  ];
  const params = new URLSearchParams({
    ...BASE,
    hourly: hourly.join(","),
    daily: "sunrise,sunset",
    models: "icon_seamless",
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

export const URL_METAR = `https://api.met.no/weatherapi/tafmetar/1.0/metar?icao=${AERODROME.station}`;
export const URL_TAF = `https://api.met.no/weatherapi/tafmetar/1.0/taf?icao=${AERODROME.station}`;

function fetchAvecTimeout(url, delaiMs) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), delaiMs);
  return fetch(url, { signal: controleur.signal }).finally(() => clearTimeout(minuteur));
}

/** Date réelle de la réponse (en-tête HTTP) : l'âge affiché reste vrai hors-ligne. */
function dateReponse(rep) {
  const entete = rep?.headers?.get?.("date");
  const d = entete ? new Date(entete) : null;
  return d && !Number.isNaN(d.getTime()) ? d : new Date();
}

const FMT_BXL = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function decalageBruxelles(ms) {
  const p = Object.fromEntries(FMT_BXL.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ms;
}
/**
 * Instant UTC (ms) d'une heure locale Europe/Brussels « 2026-10-25T14:00 ».
 * Nécessaire pour croiser les prévisions (heure locale) avec le TAF (UTC),
 * y compris le jour du changement d'heure.
 */
export function utcDepuisLocal(iso) {
  const [d, t] = iso.split("T");
  const [Y, M, D] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  const naif = Date.UTC(Y, M - 1, D, h, mi);
  let ms = naif - decalageBruxelles(naif);
  const corr = decalageBruxelles(ms);
  if (naif - corr !== ms) ms = naif - corr;
  return ms;
}

const val = (tab, i) => (tab?.[i] ?? null);

/** Modèles → Map iso → { [idModele]: {vent, rafales, dir, nuagesBas, nuagesMoyens, base, visibilite, code, precip} }. */
export function lireModeles(json) {
  const h = json?.hourly;
  const res = new Map();
  if (!h?.time) return res;
  h.time.forEach((iso, i) => {
    const parModele = {};
    for (const m of MODELES) {
      const s = {};
      for (const [variable, champ] of Object.entries(CHAMPS)) s[champ] = val(h[`${variable}_${m.id}`], i);
      // Hors portée du modèle : toutes ses valeurs sont nulles → absent.
      if (s.vent != null || s.rafales != null) parModele[m.id] = s;
    }
    res.set(iso, parModele);
  });
  return res;
}

/**
 * Assemble jours/heures à partir du profil (axe temporel + lever/coucher)
 * et y greffe les modèles. Pur : testable sans réseau.
 */
export function normaliser(profil, modeles = new Map()) {
  const h = profil.hourly;
  const parJour = new Map();
  for (let i = 0; i < h.time.length; i++) {
    const iso = h.time[i];
    const date = iso.slice(0, 10);
    const niveaux = {};
    for (const p of NIVEAUX_PROFIL) {
      const gph = val(h[`geopotential_height_${p}hPa`], i);
      niveaux[p] = {
        vent: val(h[`wind_speed_${p}hPa`], i),
        dir: val(h[`wind_direction_${p}hPa`], i),
        temp: val(h[`temperature_${p}hPa`], i),
        agl: gph != null ? Math.round(gph - DZ.altitudeTerrain) : null,
      };
    }
    const niveauxAGL = {};
    for (const m of NIVEAUX_AGL) niveauxAGL[m] = { vent: val(h[`wind_speed_${m}m`], i), dir: val(h[`wind_direction_${m}m`], i) };
    const heure = {
      iso,
      heure: parseInt(iso.slice(11, 13), 10),
      utc: utcDepuisLocal(iso),
      t2m: val(h.temperature_2m, i),
      isoZero: val(h.freezing_level_height, i) != null ? Math.round(h.freezing_level_height[i] - DZ.altitudeTerrain) : null,
      cape: val(h.cape, i),
      niveaux,
      niveauxAGL,
      modeles: modeles.get(iso) ?? {},
    };
    if (!parJour.has(date)) parJour.set(date, []);
    parJour.get(date).push(heure);
  }
  return profil.daily.time.map((date, i) => ({
    date,
    sunrise: profil.daily.sunrise[i],
    sunset: profil.daily.sunset[i],
    heures: parJour.get(date) ?? [],
  }));
}

/**
 * Prévisions : modèles + profil.
 * @returns {Promise<{jours, recupereLe, sources:{modeles:boolean}}>}
 */
export async function chargerMeteo() {
  const [rP, rM] = await Promise.allSettled([
    fetchAvecTimeout(urlProfil(), 15000),
    fetchAvecTimeout(urlModeles(), 15000),
  ]);
  const cause = (r) => r.status === "fulfilled"
    ? `HTTP ${r.value.status}`
    : (r.reason?.name === "AbortError" ? "délai dépassé" : r.reason?.message ?? "erreur réseau");

  if (rM.status !== "fulfilled" || !rM.value.ok) throw new Error(`Open-Meteo indisponible (${cause(rM)})`);
  if (rP.status !== "fulfilled" || !rP.value.ok) throw new Error(`Open-Meteo indisponible (${cause(rP)})`);
  const recupereLe = dateReponse(rM.value).toISOString();
  const [jP, jM] = await Promise.all([rP.value.json(), rM.value.json()]);
  if (!jP?.hourly?.time?.length || !jP?.daily?.time?.length || !jM?.hourly?.time?.length) {
    throw new Error("Réponse Open-Meteo incomplète");
  }
  const modeles = lireModeles(jM);
  return { jours: normaliser(jP, modeles), recupereLe, sources: { modeles: modeles.size > 0 } };
}

/**
 * METAR + TAF de Charleroi. Ne lève jamais : null pour ce qui manque.
 * @returns {Promise<{metar:object|null, taf:object|null}>}
 */
export async function chargerAero(maintenant = new Date()) {
  async function texte(url) {
    try {
      const rep = await fetchAvecTimeout(url, 15000);
      return rep.ok ? await rep.text() : null;
    } catch {
      return null;
    }
  }
  const [m, t] = await Promise.all([texte(URL_METAR), texte(URL_TAF)]);
  // MET Norway renvoie l'historique récent : on garde le message le plus
  // récent d'après sa propre date, pas d'après sa position.
  const plusRecent = (texte, lire, date) => {
    const lus = tousMessages(texte).map((x) => { try { return lire(x, maintenant); } catch { return null; } }).filter(Boolean);
    return lus.sort((a, b) => date(b) - date(a))[0] ?? null;
  };
  return {
    metar: plusRecent(m, parseMetar, (x) => x.obs?.getTime() ?? 0),
    taf: plusRecent(t, parseTaf, (x) => x.emis.getTime()),
  };
}
