import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMeteo } from "./meteo.js";

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

function reponseModeleSecondaire(vents) {
  return jsonResponse({
    hourly: { time: HEURES, wind_speed_10m: vents, wind_direction_10m: [240, 245, 250] },
  });
}

function installerFetch(impl) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return () => { globalThis.fetch = original; };
}

// ------------------------------------------------------------

test("chargerMeteo : cas nominal, 3 modèles disponibles -> comparaisons peuplées", async () => {
  const restaurer = installerFetch(async (url) => {
    const u = String(url);
    if (u.includes("meteofrance_seamless")) return reponseModeleSecondaire([11, 13, 29]);
    if (u.includes("ecmwf_ifs025")) return reponseModeleSecondaire([9, 14, 31]);
    return reponsePrincipaleValide("Sat, 22 Aug 2026 09:00:00 GMT");
  });
  try {
    const r = await chargerMeteo();
    assert.equal(r.jours.length, 1);
    assert.equal(r.jours[0].heures.length, 3);
    const h1 = r.jours[0].heures[1];
    assert.equal(h1.comparaisons.arome.vent, 13);
    assert.equal(h1.comparaisons.ecmwf.vent, 14);
    assert.equal(r.actuel.vent, 12);
    assert.equal(r.recupereLe, new Date("Sat, 22 Aug 2026 09:00:00 GMT").toISOString());
  } finally {
    restaurer();
  }
});

test("chargerMeteo : modèles secondaires en échec -> l'app fonctionne quand même (comparaisons nulles)", async () => {
  const restaurer = installerFetch(async (url) => {
    const u = String(url);
    if (u.includes("meteofrance_seamless") || u.includes("ecmwf_ifs025")) {
      throw new Error("réseau indisponible");
    }
    return reponsePrincipaleValide();
  });
  try {
    const r = await chargerMeteo();
    const h1 = r.jours[0].heures[1];
    assert.equal(h1.comparaisons.arome, null);
    assert.equal(h1.comparaisons.ecmwf, null);
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
