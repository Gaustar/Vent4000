import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMeteo, chargerMetar, dernierMetar } from "./meteo.js";

// ------------------------------------------------------------
// Fabriques de réponses Open-Meteo minimales pour les tests.
// On ne mocke que ce que meteo.js lit réellement.
// ------------------------------------------------------------
const HEURES = ["2026-08-22T08:00", "2026-08-22T09:00", "2026-08-22T10:00"];

function jsonResponse(body, { status = 200, dateHeader } = {}) {
  const headers = new Headers();
  if (dateHeader) headers.set("date", dateHeader);
  return new Response(JSON.stringify(body), { status, headers });
}

function reponsePrincipaleValide(dateHeader) {
  return jsonResponse(
    {
      hourly: {
        time: HEURES,
        wind_speed_10m: [10, 12, 30],
        wind_gusts_10m: [12, 15, 35],
        wind_direction_10m: [240, 245, 250],
        temperature_2m: [18, 19, 20],
        dew_point_2m: [10, 10, 10],
        precipitation: [0, 0, 0],
        precipitation_probability: [5, 5, 5],
        cloud_cover_low: [0, 0, 0],
        cloud_cover_mid: [0, 0, 0],
        cloud_cover_high: [0, 0, 0],
        visibility: [10000, 10000, 10000],
        cape: [0, 0, 0],
      },
      daily: {
        time: ["2026-08-22"],
        sunrise: ["2026-08-22T06:30"],
        sunset: ["2026-08-22T20:45"],
      },
      current: {
        time: "2026-08-22T09:00",
        wind_speed_10m: 12,
        wind_direction_10m: 245,
        wind_gusts_10m: 15,
        temperature_2m: 19,
      },
    },
    { status: 200, dateHeader }
  );
}

function reponseModeles() {
  return jsonResponse({
    hourly: {
      time: HEURES,
      wind_speed_10m_icon_d2: [11, 13, 29],
      wind_gusts_10m_icon_d2: [14, 18, 40],
      precipitation_icon_d2: [0, 0, 1.2],
      cloud_cover_low_icon_d2: [0, 10, 90],
      wind_speed_10m_ecmwf_ifs025: [9, 14, 31],
      wind_gusts_10m_ecmwf_ifs025: [12, 20, 42],
      precipitation_ecmwf_ifs025: [0, 0, 0],
      cloud_cover_low_ecmwf_ifs025: [0, 0, 50],
      // Modèle hors horizon : que des null -> absent du vote.
      wind_speed_10m_gfs_seamless: [null, null, null],
      wind_gusts_10m_gfs_seamless: [null, null, null],
    },
  });
}

function reponseEnsembles() {
  return jsonResponse({
    hourly: {
      time: HEURES,
      wind_speed_10m_ecmwf_ifs025_ensemble: [10, 10, 10],
      wind_gusts_10m_ecmwf_ifs025_ensemble: [15, 15, 15],
      wind_speed_10m_member01_ecmwf_ifs025_ensemble: [12, 12, 12],
      wind_gusts_10m_member01_ecmwf_ifs025_ensemble: [18, 18, 50],
      wind_speed_10m_member01_icon_seamless_eps: [8, 8, 8],
      // Membre sans rafale : écarté (il ne peut pas juger le critère décisif).
      wind_gusts_10m_member01_icon_seamless_eps: [null, null, null],
    },
  });
}

function installerFetch(impl) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return () => { globalThis.fetch = original; };
}

// ------------------------------------------------------------

test("chargerMeteo : cas nominal -> modèles et membres d'ensemble greffés heure par heure", async () => {
  const restaurer = installerFetch(async (url) => {
    const u = String(url);
    if (u.includes("ensemble-api")) return reponseEnsembles();
    if (u.includes("models=")) return reponseModeles();
    return reponsePrincipaleValide("Sat, 22 Aug 2026 09:00:00 GMT");
  });
  try {
    const r = await chargerMeteo();
    assert.equal(r.jours.length, 1);
    assert.equal(r.jours[0].heures.length, 3);
    const h1 = r.jours[0].heures[1];
    assert.deepEqual(h1.modeles.icon_d2, { vent: 13, rafales: 18, precip: 0, nuagesBas: 10 });
    assert.equal(h1.modeles.ecmwf_ifs025.rafales, 20);
    assert.equal(h1.modeles.gfs_seamless, undefined, "modèle hors horizon absent");
    assert.equal(h1.ensemble.length, 2, "contrôle + membre 01 ECMWF ; le membre ICON sans rafale est écarté");
    assert.deepEqual(r.sources, { modeles: true, ensembles: true, metar: false });
    assert.equal(r.actuel.vent, 12);
    assert.equal(r.recupereLe, new Date("Sat, 22 Aug 2026 09:00:00 GMT").toISOString());
  } finally {
    restaurer();
  }
});

test("chargerMeteo : modèles et ensembles en échec -> l'app fonctionne quand même", async () => {
  const restaurer = installerFetch(async (url) => {
    const u = String(url);
    if (u.includes("ensemble-api") || u.includes("models=")) throw new Error("réseau indisponible");
    return reponsePrincipaleValide();
  });
  try {
    const r = await chargerMeteo();
    const h1 = r.jours[0].heures[1];
    assert.deepEqual(h1.modeles, {});
    assert.deepEqual(h1.ensemble, []);
    assert.deepEqual(r.sources, { modeles: false, ensembles: false, metar: false });
  } finally {
    restaurer();
  }
});

test("dernierMetar : choisit l'observation la plus RÉCENTE, IEM triant du plus récent au plus ancien", () => {
  const csv = [
    "station,valid,metar",
    "EBCI,2026-10-01 12:50,EBCI 011250Z 25006KT 9999 FEW035 21/11 Q1024 NOSIG",
    "EBCI,2026-10-01 12:20,EBCI 011220Z 24008KT 9999 FEW028 21/13 Q1024 NOSIG",
  ].join("\n");
  assert.match(dernierMetar(csv), /011250Z/);
  assert.match(dernierMetar(csv.split("\n").reverse().join("\n")), /011250Z/);
  assert.equal(dernierMetar("station,valid,metar\n"), null);
});

test("chargerMetar : erreur réseau -> null, jamais d'exception", async () => {
  const restaurer = installerFetch(async () => { throw new Error("hors ligne"); });
  try {
    assert.equal(await chargerMetar(), null);
  } finally {
    restaurer();
  }
});

test("chargerMeteo : modèle principal en échec HTTP -> rejette avec un message clair", async () => {
  const restaurer = installerFetch(async () => jsonResponse({}, { status: 500 }));
  try {
    await assert.rejects(chargerMeteo(), /Open-Meteo indisponible/);
  } finally {
    restaurer();
  }
});

test("chargerMeteo : modèle principal abandonné (timeout) -> message explicite 'délai dépassé'", async () => {
  const restaurer = installerFetch(async () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    throw err;
  });
  try {
    await assert.rejects(chargerMeteo(), /délai dépassé/);
  } finally {
    restaurer();
  }
});

test("chargerMeteo : réponse principale incomplète (JSON valide mais sans hourly/daily) -> rejette", async () => {
  const restaurer = installerFetch(async () => jsonResponse({ hourly: { time: [] }, daily: { time: [] } }));
  try {
    await assert.rejects(chargerMeteo(), /incomplète/);
  } finally {
    restaurer();
  }
});
