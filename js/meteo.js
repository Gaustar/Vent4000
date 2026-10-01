// ============================================================
// Vent4000 — Acquisition météo (v2.0)
//
// Quatre sources, récupérées en parallèle, toutes gratuites, sans clé
// et ouvertes en CORS (utilisables directement depuis GitHub Pages) :
//
//  1. PRINCIPALE — Open-Meteo « best match » (ICON-D2 2 km sur 48 h puis
//     ICON-EU/global) : TOUTES les variables utiles au saut — vent sol et
//     basse couche, rafales, 9 niveaux de pression (vent, température,
//     humidité, couverture nuageuse, géopotentiel), visibilité, code
//     temps présent, pluie/averses, CAPE/CIN/indice de soulèvement,
//     potentiel d'éclairs, isotherme 0 °C, couche limite.
//  2. MODÈLES — 7 modèles déterministes indépendants (3 haute résolution
//     + 4 globaux), sur les critères qui décident d'un saut.
//  3. ENSEMBLES — 122 membres (ICON-EPS, ECMWF-ENS, GEFS) : la dispersion
//     réelle de la prévision, donc une vraie probabilité.
//  4. METAR — observation de Charleroi (EBCI) pour l'heure en cours,
//     chargée à part (chargerMetar) pour ne jamais retarder l'affichage.
//
// Seule la source principale est indispensable : les trois autres
// enrichissent la décision et l'app reste fonctionnelle sans elles.
// ============================================================

import { DZ, NIVEAUX_PRESSION, NIVEAUX_AGL, MODELES, ENSEMBLES, METAR } from "./config.js";
import { parseMetar } from "./metar.js";

const HPA = NIVEAUX_PRESSION.map((n) => n.hpa);
const BASE = {
  latitude: DZ.lat,
  longitude: DZ.lon,
  timezone: "Europe/Brussels",
  wind_speed_unit: "kmh",
  forecast_days: "7",
};
const VARIABLES_VOTE = ["wind_speed_10m", "wind_gusts_10m", "precipitation", "cloud_cover_low"];

export function urlPrincipale() {
  const surface = [
    "temperature_2m", "dew_point_2m", "relative_humidity_2m",
    "precipitation", "showers", "precipitation_probability", "weather_code",
    "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high",
    "visibility", "cape", "convective_inhibition", "lifted_index", "lightning_potential",
    "freezing_level_height", "boundary_layer_height",
    "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m",
  ];
  const agl = NIVEAUX_AGL.flatMap((m) => [`wind_speed_${m}m`, `wind_direction_${m}m`]);
  const altitude = HPA.flatMap((p) => [
    `wind_speed_${p}hPa`, `wind_direction_${p}hPa`, `temperature_${p}hPa`,
    `relative_humidity_${p}hPa`, `cloud_cover_${p}hPa`, `geopotential_height_${p}hPa`,
  ]);
  const params = new URLSearchParams({
    ...BASE,
    hourly: [...surface, ...agl, ...altitude].join(","),
    daily: "sunrise,sunset",
    current: "temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

export function urlModeles() {
  const params = new URLSearchParams({
    ...BASE,
    hourly: VARIABLES_VOTE.join(","),
    models: MODELES.map((m) => m.id).join(","),
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

export function urlEnsembles() {
  const params = new URLSearchParams({
    ...BASE,
    hourly: VARIABLES_VOTE.join(","),
    models: ENSEMBLES.map((e) => e.id).join(","),
  });
  return `https://ensemble-api.open-meteo.com/v1/ensemble?${params}`;
}

export function urlMetar() {
  const params = new URLSearchParams({
    station: METAR.station, data: "metar", hours: "3", format: "onlycomma", tz: "UTC",
  });
  return `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?${params}`;
}

/**
 * fetch() avec timeout — sans ça, une requête qui ne répond jamais (réseau
 * capricieux en plein champ) laisse l'app bloquée indéfiniment.
 */
function fetchAvecTimeout(url, delaiMs) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), delaiMs);
  return fetch(url, { signal: controleur.signal }).finally(() => clearTimeout(minuteur));
}

/**
 * Date réelle de la réponse (en-tête HTTP `Date`) : si le service worker
 * sert une réponse de secours hors-ligne, l'âge affiché reste vrai.
 */
function dateReponse(rep) {
  const entete = rep?.headers?.get?.("date");
  const d = entete ? new Date(entete) : null;
  return d && !Number.isNaN(d.getTime()) ? d : new Date();
}

const val = (tab, i) => (tab?.[i] ?? null);

/**
 * Modèles déterministes → Map iso → { [idModele]: {vent, rafales, precip, nuagesBas} }.
 * Un modèle dont l'horizon est dépassé renvoie null : il est simplement
 * absent du vote à cette heure (cf. probabilite.js).
 */
export function lireModeles(json) {
  const h = json?.hourly;
  const res = new Map();
  if (!h?.time) return res;
  h.time.forEach((iso, i) => {
    const parModele = {};
    for (const m of MODELES) {
      const s = {
        vent: val(h[`wind_speed_10m_${m.id}`], i),
        rafales: val(h[`wind_gusts_10m_${m.id}`], i),
        precip: val(h[`precipitation_${m.id}`], i),
        nuagesBas: val(h[`cloud_cover_low_${m.id}`], i),
      };
      if (s.vent != null || s.rafales != null) parModele[m.id] = s;
    }
    res.set(iso, parModele);
  });
  return res;
}

/**
 * Ensembles → Map iso → [{ ens, vent, rafales, precip, nuagesBas }].
 * Les clés Open-Meteo sont `<variable>[_memberNN]_<suffixe>` ; le run de
 * contrôle n'a pas de numéro de membre.
 */
export function lireEnsembles(json) {
  const h = json?.hourly;
  const res = new Map();
  if (!h?.time) return res;
  const CHAMP = { wind_speed_10m: "vent", wind_gusts_10m: "rafales", precipitation: "precip", cloud_cover_low: "nuagesBas" };
  const re = /^(wind_speed_10m|wind_gusts_10m|precipitation|cloud_cover_low)_(?:member(\d+)_)?(.+)$/;
  const membres = new Map(); // "ens|nn" → { ens, champs: {vent: tab, …} }
  for (const [cle, tab] of Object.entries(h)) {
    const m = re.exec(cle);
    if (!m) continue;
    const ens = ENSEMBLES.find((e) => e.suffixe === m[3]);
    if (!ens) continue;
    const id = `${ens.id}|${m[2] ?? "00"}`;
    if (!membres.has(id)) membres.set(id, { ens: ens.id, champs: {} });
    membres.get(id).champs[CHAMP[m[1]]] = tab;
  }
  h.time.forEach((iso, i) => {
    const liste = [];
    for (const { ens, champs } of membres.values()) {
      const s = {
        ens,
        vent: val(champs.vent, i),
        rafales: val(champs.rafales, i),
        precip: val(champs.precip, i),
        nuagesBas: val(champs.nuagesBas, i),
      };
      // Un membre sans rafale ne peut pas juger le critère décisif : on
      // l'écarte plutôt que de le compter comme un « oui ».
      if (s.rafales != null && s.vent != null) liste.push(s);
    }
    res.set(iso, liste);
  });
  return res;
}

/**
 * Normalise la réponse principale en jours/heures et y greffe, heure par
 * heure, les votes des modèles et des membres d'ensemble.
 * Pur : testable sans réseau.
 */
export function normaliser(d, modeles = new Map(), ensembles = new Map()) {
  const h = d.hourly;
  const parJour = new Map();

  for (let i = 0; i < h.time.length; i++) {
    const iso = h.time[i];               // "2026-07-11T14:00" (heure locale BE)
    const date = iso.slice(0, 10);
    const heure = parseInt(iso.slice(11, 13), 10);

    const niveaux = {};
    for (const p of HPA) {
      const gph = val(h[`geopotential_height_${p}hPa`], i);
      niveaux[p] = {
        vent: val(h[`wind_speed_${p}hPa`], i),
        dir: val(h[`wind_direction_${p}hPa`], i),
        temp: val(h[`temperature_${p}hPa`], i),
        humidite: val(h[`relative_humidity_${p}hPa`], i),
        nuages: val(h[`cloud_cover_${p}hPa`], i),
        agl: gph != null ? Math.round(gph - DZ.altitudeTerrain) : null,
      };
    }

    const niveauxAGL = {};
    for (const m of NIVEAUX_AGL) {
      niveauxAGL[m] = { vent: val(h[`wind_speed_${m}m`], i), dir: val(h[`wind_direction_${m}m`], i) };
    }

    const heureObj = {
      iso, heure,
      vent10: val(h.wind_speed_10m, i),
      rafales10: val(h.wind_gusts_10m, i),
      direction10: val(h.wind_direction_10m, i),
      t2m: val(h.temperature_2m, i),
      pointRosee: val(h.dew_point_2m, i),
      humidite: val(h.relative_humidity_2m, i),
      precip: val(h.precipitation, i),
      averses: val(h.showers, i),
      probaPluie: val(h.precipitation_probability, i),
      codeTemps: val(h.weather_code, i),
      nuagesTotal: val(h.cloud_cover, i),
      nuagesBas: val(h.cloud_cover_low, i),
      nuagesMoyens: val(h.cloud_cover_mid, i),
      nuagesHauts: val(h.cloud_cover_high, i),
      visibilite: val(h.visibility, i),
      cape: val(h.cape, i),
      cin: val(h.convective_inhibition, i),
      li: val(h.lifted_index, i),
      eclairs: val(h.lightning_potential, i),
      isoZero: val(h.freezing_level_height, i) != null
        ? Math.round(h.freezing_level_height[i] - DZ.altitudeTerrain) : null,
      coucheLimite: val(h.boundary_layer_height, i),
      niveaux,
      niveauxAGL,
      modeles: modeles.get(iso) ?? {},
      ensemble: ensembles.get(iso) ?? [],
    };

    if (!parJour.has(date)) parJour.set(date, []);
    parJour.get(date).push(heureObj);
  }

  return d.daily.time.map((date, i) => ({
    date,
    sunrise: d.daily.sunrise[i],
    sunset: d.daily.sunset[i],
    heures: parJour.get(date) ?? [],
  }));
}

/**
 * METAR le plus récent d'une réponse CSV IEM (« station,valid,metar »).
 * ⚠ IEM trie du plus récent au plus ancien : on choisit sur l'horodatage
 * `valid`, jamais sur la position de la ligne.
 */
export function dernierMetar(csv) {
  const lignes = String(csv ?? "").trim().split("\n").filter((l) => /^[A-Z]{4},/.test(l));
  if (!lignes.length) return null;
  const plusRecente = lignes
    .map((l) => { const [, valid, ...reste] = l.split(","); return { valid, metar: reste.join(",").trim() }; })
    .sort((a, b) => b.valid.localeCompare(a.valid))[0];
  return plusRecente.metar || null;
}

/**
 * Récupère et normalise toutes les sources.
 * @returns {Promise<{jours, recupereLe, actuel, metar:null, sources}>}
 */
export async function chargerMeteo() {
  const [rP, rM, rE] = await Promise.allSettled([
    fetchAvecTimeout(urlPrincipale(), 15000),
    fetchAvecTimeout(urlModeles(), 15000),
    fetchAvecTimeout(urlEnsembles(), 20000),
  ]);

  if (rP.status !== "fulfilled" || !rP.value.ok) {
    const cause = rP.status === "fulfilled"
      ? `HTTP ${rP.value.status}`
      : (rP.reason?.name === "AbortError" ? "délai dépassé" : rP.reason?.message ?? "erreur réseau");
    throw new Error(`Open-Meteo indisponible (${cause})`);
  }
  const recupereLe = dateReponse(rP.value).toISOString();
  const d = await rP.value.json();
  if (!d?.hourly?.time?.length || !d?.daily?.time?.length) {
    throw new Error("Réponse Open-Meteo incomplète");
  }

  async function lireJson(r) {
    if (r.status !== "fulfilled" || !r.value.ok) return null;
    try { return await r.value.json(); } catch { return null; }
  }
  const [jM, jE] = await Promise.all([lireJson(rM), lireJson(rE)]);
  const modeles = lireModeles(jM);
  const ensembles = lireEnsembles(jE);

  const actuel = d.current
    ? {
        iso: d.current.time,
        vent: d.current.wind_speed_10m ?? null,
        direction: d.current.wind_direction_10m ?? null,
        rafales: d.current.wind_gusts_10m ?? null,
        temp: d.current.temperature_2m ?? null,
      }
    : null;

  return {
    jours: normaliser(d, modeles, ensembles),
    recupereLe,
    actuel,
    metar: null, // arrive à part (chargerMetar), sans retarder l'affichage
    sources: {
      modeles: modeles.size > 0,
      ensembles: ensembles.size > 0,
      metar: false,
    },
  };
}

/**
 * Observation METAR, chargée séparément : le serveur IEM répond parfois en
 * plusieurs secondes, et l'app ne doit jamais attendre l'observation pour
 * afficher la prévision. @returns {Promise<object|null>}
 */
export async function chargerMetar() {
  try {
    const rep = await fetchAvecTimeout(urlMetar(), 20000);
    if (!rep.ok) return null;
    return parseMetar(dernierMetar(await rep.text()));
  } catch {
    return null;
  }
}
