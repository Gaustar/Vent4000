// ============================================================
// Vent4000 — Récupération météo Open-Meteo (modèle DWD ICON via
// l'API forecast standard, best_match automatique) : surface,
// niveaux bas AGL (80/120/180 m), niveaux de pression, nowcast.
// + Comparaison Météo-France AROME/ARPEGE (meteofrance_seamless)
// sur J0-J3 et ECMWF IFS (0.25°, open-data) sur les 7 jours,
// pour un indicateur de confiance multi-modèle sur toute la semaine.
// ============================================================

import { DZ, NIVEAUX_PRESSION, NIVEAUX_AGL } from "./config.js";

const HPA = NIVEAUX_PRESSION.map((n) => n.hpa);
const CURRENT = "temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m";

function variablesHoraires() {
  const surface = [
    "temperature_2m", "dew_point_2m",
    "precipitation", "precipitation_probability",
    "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high",
    "visibility", "cape",
    "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m",
  ];
  const agl = NIVEAUX_AGL.flatMap((m) => [`wind_speed_${m}m`, `wind_direction_${m}m`]);
  const altitude = HPA.flatMap((p) => [
    `wind_speed_${p}hPa`,
    `wind_direction_${p}hPa`,
    `temperature_${p}hPa`,
    `geopotential_height_${p}hPa`,
  ]);
  return [...surface, ...agl, ...altitude].join(",");
}

export function urlOpenMeteo() {
  const params = new URLSearchParams({
    latitude: DZ.lat,
    longitude: DZ.lon,
    hourly: variablesHoraires(),
    daily: "sunrise,sunset",
    current: CURRENT,
    timezone: "Europe/Brussels",
    wind_speed_unit: "kmh",
    forecast_days: "7",
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

/** Second modèle indépendant (Météo-France AROME/ARPEGE), 4 jours max. */
export function urlMeteoFrance() {
  const params = new URLSearchParams({
    latitude: DZ.lat,
    longitude: DZ.lon,
    hourly: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    models: "meteofrance_seamless",
    timezone: "Europe/Brussels",
    wind_speed_unit: "kmh",
    forecast_days: "4",
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

/** Troisième modèle indépendant (ECMWF IFS 0.25°, open-data), 7 jours. */
export function urlEcmwf() {
  const params = new URLSearchParams({
    latitude: DZ.lat,
    longitude: DZ.lon,
    hourly: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    models: "ecmwf_ifs025",
    timezone: "Europe/Brussels",
    wind_speed_unit: "kmh",
    forecast_days: "7",
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

/**
 * fetch() avec timeout — sans ça, une requête qui ne répond jamais (réseau
 * capricieux en plein champ) laisse l'app bloquée indéfiniment sur l'écran
 * de chargement, sans jamais basculer sur le cache hors-ligne.
 */
function fetchAvecTimeout(url, delaiMs) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), delaiMs);
  return fetch(url, { signal: controleur.signal }).finally(() => clearTimeout(minuteur));
}

/**
 * Date de la réponse HTTP (en-tête `Date`), pour savoir si les données
 * viennent d'être récupérées ou si elles proviennent d'un cache (hors-ligne
 * ou CDN) potentiellement ancien. Repli sur "maintenant" si l'en-tête est
 * absent (certains navigateurs/CDN ne le fournissent pas systématiquement).
 */
function dateReponse(rep) {
  const entete = rep?.headers?.get?.("date");
  const d = entete ? new Date(entete) : null;
  return d && !Number.isNaN(d.getTime()) ? d : new Date();
}

/**
 * Récupère et normalise les prévisions (3 modèles en parallèle).
 * @returns {Promise<{jours: Jour[], recupereLe: string, actuel: object|null}>}
 *   Jour = { date, sunrise, sunset, heures: Heure[] }
 *   Heure = { iso, heure, vent10, rafales10, direction10, t2m, pointRosee,
 *             precip, probaPluie, nuagesBas, nuagesMoyens, nuagesHauts,
 *             visibilite, cape, niveaux:{600:{...}}, niveauxAGL:{80:{...}},
 *             comparaisons: { arome: {vent,direction}|null, ecmwf: {vent,direction}|null } }
 *   `recupereLe` reflète la date **réelle** de la réponse (en-tête HTTP),
 *   pas l'heure locale de l'appareil : si le service worker a servi une
 *   réponse de secours en cache (hors-ligne), `recupereLe` reste celle du
 *   dernier succès réseau, pour ne jamais afficher un verdict périmé comme
 *   s'il venait d'être calculé.
 */
export async function chargerMeteo() {
  const DELAI_PRINCIPAL = 15000;
  const DELAI_SECONDAIRE = 10000;
  const [repPrincipale, repArome, repEcmwf] = await Promise.allSettled([
    fetchAvecTimeout(urlOpenMeteo(), DELAI_PRINCIPAL),
    fetchAvecTimeout(urlMeteoFrance(), DELAI_SECONDAIRE),
    fetchAvecTimeout(urlEcmwf(), DELAI_SECONDAIRE),
  ]);

  if (repPrincipale.status !== "fulfilled" || !repPrincipale.value.ok) {
    const cause = repPrincipale.status === "fulfilled"
      ? `HTTP ${repPrincipale.value.status}`
      : (repPrincipale.reason?.name === "AbortError" ? "délai dépassé" : repPrincipale.reason?.message ?? "erreur réseau");
    throw new Error(`Open-Meteo indisponible (${cause})`);
  }
  const recupereLe = dateReponse(repPrincipale.value).toISOString();
  const d = await repPrincipale.value.json();
  if (!d?.hourly?.time?.length || !d?.daily?.time?.length) {
    throw new Error("Réponse Open-Meteo incomplète");
  }

  // Les comparaisons sont un bonus : si elles échouent, l'app fonctionne quand
  // même (confiance = "unique", ou dégradée au nombre de modèles disponibles).
  async function mapModele(rep) {
    if (rep.status !== "fulfilled" || !rep.value.ok) return null;
    try {
      const c = await rep.value.json();
      return new Map(
        c.hourly.time.map((iso, i) => [
          iso,
          { vent: c.hourly.wind_speed_10m?.[i] ?? null, direction: c.hourly.wind_direction_10m?.[i] ?? null },
        ])
      );
    } catch {
      return null;
    }
  }
  const [arome, ecmwf] = await Promise.all([mapModele(repArome), mapModele(repEcmwf)]);

  const h = d.hourly;
  const parJour = new Map();

  for (let i = 0; i < h.time.length; i++) {
    const iso = h.time[i];               // "2026-07-11T14:00" (heure locale BE)
    const date = iso.slice(0, 10);
    const heure = parseInt(iso.slice(11, 13), 10);

    const niveaux = {};
    for (const p of HPA) {
      const gph = h[`geopotential_height_${p}hPa`]?.[i];
      niveaux[p] = {
        vent: h[`wind_speed_${p}hPa`]?.[i] ?? null,
        dir: h[`wind_direction_${p}hPa`]?.[i] ?? null,
        temp: h[`temperature_${p}hPa`]?.[i] ?? null,
        agl: gph != null ? Math.round(gph - DZ.altitudeTerrain) : null,
      };
    }

    const niveauxAGL = {};
    for (const m of NIVEAUX_AGL) {
      niveauxAGL[m] = {
        vent: h[`wind_speed_${m}m`]?.[i] ?? null,
        dir: h[`wind_direction_${m}m`]?.[i] ?? null,
      };
    }

    const heureObj = {
      iso, heure,
      vent10: h.wind_speed_10m?.[i] ?? null,
      rafales10: h.wind_gusts_10m?.[i] ?? null,
      direction10: h.wind_direction_10m?.[i] ?? null,
      t2m: h.temperature_2m?.[i] ?? null,
      pointRosee: h.dew_point_2m?.[i] ?? null,
      precip: h.precipitation?.[i] ?? null,
      probaPluie: h.precipitation_probability?.[i] ?? null,
      nuagesBas: h.cloud_cover_low?.[i] ?? null,
      nuagesMoyens: h.cloud_cover_mid?.[i] ?? null,
      nuagesHauts: h.cloud_cover_high?.[i] ?? null,
      visibilite: h.visibility?.[i] ?? null,
      cape: h.cape?.[i] ?? null,
      niveaux,
      niveauxAGL,
      comparaisons: {
        arome: arome?.get(iso) ?? null,
        ecmwf: ecmwf?.get(iso) ?? null,
      },
    };

    if (!parJour.has(date)) parJour.set(date, []);
    parJour.get(date).push(heureObj);
  }

  const jours = d.daily.time.map((date, i) => ({
    date,
    sunrise: d.daily.sunrise[i],
    sunset: d.daily.sunset[i],
    heures: parJour.get(date) ?? [],
  }));

  const actuel = d.current
    ? {
        iso: d.current.time,
        vent: d.current.wind_speed_10m ?? null,
        direction: d.current.wind_direction_10m ?? null,
        rafales: d.current.wind_gusts_10m ?? null,
        temp: d.current.temperature_2m ?? null,
      }
    : null;

  return { jours, recupereLe, actuel };
}
