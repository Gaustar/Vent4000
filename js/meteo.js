// ============================================================
// Vent4000 — Récupération météo Open-Meteo (modèle DWD ICON via
// l'API forecast standard) : surface + niveaux de pression.
// ============================================================

import { DZ, NIVEAUX_PRESSION } from "./config.js";

const HPA = NIVEAUX_PRESSION.map((n) => n.hpa);

function variablesHoraires() {
  const surface = [
    "temperature_2m", "dew_point_2m",
    "precipitation", "precipitation_probability",
    "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high",
    "visibility", "cape",
    "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m",
  ];
  const altitude = HPA.flatMap((p) => [
    `wind_speed_${p}hPa`,
    `wind_direction_${p}hPa`,
    `temperature_${p}hPa`,
    `geopotential_height_${p}hPa`,
  ]);
  return [...surface, ...altitude].join(",");
}

export function urlOpenMeteo() {
  const params = new URLSearchParams({
    latitude: DZ.lat,
    longitude: DZ.lon,
    hourly: variablesHoraires(),
    daily: "sunrise,sunset",
    timezone: "Europe/Brussels",
    wind_speed_unit: "kmh",
    forecast_days: "7",
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

/**
 * Récupère et normalise les prévisions.
 * @returns {Promise<{jours: Jour[], recupereLe: string}>}
 *   Jour = { date:"YYYY-MM-DD", sunrise, sunset, heures: Heure[] }
 *   Heure = { iso, heure, vent10, rafales10, direction10, t2m, pointRosee,
 *             precip, probaPluie, nuagesBas, nuagesMoyens, nuagesHauts,
 *             visibilite, cape, niveaux: {600:{vent,dir,temp,agl}, …} }
 */
export async function chargerMeteo() {
  const rep = await fetch(urlOpenMeteo());
  if (!rep.ok) throw new Error(`Open-Meteo HTTP ${rep.status}`);
  const d = await rep.json();

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

  return { jours, recupereLe: new Date().toISOString() };
}
