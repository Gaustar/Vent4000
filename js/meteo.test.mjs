import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerMeteo, chargerAero, utcDepuisLocal, lireModeles } from "./meteo.js";

const HEURES = ["2026-08-22T08:00", "2026-08-22T09:00", "2026-08-22T10:00"];

function jsonResponse(body, { status = 200, dateHeader } = {}) {
  const headers = new Headers();
  if (dateHeader) headers.set("date", dateHeader);
  return new Response(JSON.stringify(body), { status, headers });
}

function reponseProfil() {
  return jsonResponse({
    hourly: {
      time: HEURES,
      temperature_2m: [18, 19, 20],
      wind_speed_850hPa: [30, 32, 35], wind_direction_850hPa: [250, 250, 260],
      temperature_850hPa: [8, 8, 9], geopotential_height_850hPa: [1500, 1500, 1500],
    },
    daily: { time: ["2026-08-22"], sunrise: ["2026-08-22T06:30"], sunset: ["2026-08-22T20:45"] },
  });
}

function reponseModeles(dateHeader) {
  return jsonResponse({
    hourly: {
      time: HEURES,
      wind_speed_10m_icon_d2: [11, 13, 29],
      wind_gusts_10m_icon_d2: [14, 18, 40],
      cloud_cover_low_icon_d2: [0, 10, 90],
      wind_speed_10m_dmi_harmonie_arome_europe: [9, 14, 31],
      wind_gusts_10m_dmi_harmonie_arome_europe: [12, 20, 42],
      cloud_base_dmi_harmonie_arome_europe: [0, 1200, 600],
      // Hors portée : que des null -> absent.
      wind_speed_10m_ecmwf_ifs: [null, null, null],
      wind_gusts_10m_ecmwf_ifs: [null, null, null],
    },
  }, { dateHeader });
}

function installerFetch(impl) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return () => { globalThis.fetch = original; };
}

test("utcDepuisLocal : heure d'été, heure d'hiver et jour du changement d'heure", () => {
  assert.equal(new Date(utcDepuisLocal("2026-08-22T14:00")).toISOString(), "2026-08-22T12:00:00.000Z");
  assert.equal(new Date(utcDepuisLocal("2026-12-05T14:00")).toISOString(), "2026-12-05T13:00:00.000Z");
  assert.equal(new Date(utcDepuisLocal("2026-10-25T14:00")).toISOString(), "2026-10-25T13:00:00.000Z");
  assert.equal(new Date(utcDepuisLocal("2026-10-25T01:00")).toISOString(), "2026-10-24T23:00:00.000Z");
});

test("lireModeles : un modèle hors portée est absent, jamais compté à zéro", () => {
  const m = lireModeles({ hourly: { time: ["t"], wind_speed_10m_icon_d2: [10], wind_gusts_10m_icon_d2: [15], wind_speed_10m_ecmwf_ifs: [null], wind_gusts_10m_ecmwf_ifs: [null] } });
  assert.deepEqual(Object.keys(m.get("t")), ["icon_d2"]);
});

test("chargerMeteo : modèles greffés heure par heure, instant UTC calculé, date réelle de la réponse", async () => {
  const restaurer = installerFetch(async (url) =>
    String(url).includes("icon_seamless") ? reponseProfil() : reponseModeles("Sat, 22 Aug 2026 09:00:00 GMT"));
  try {
    const r = await chargerMeteo();
    const h1 = r.jours[0].heures[1];
    assert.equal(h1.modeles.icon_d2.rafales, 18);
    assert.equal(h1.modeles.dmi_harmonie_arome_europe.base, 1200);
    assert.equal(h1.modeles.ecmwf_ifs, undefined);
    assert.equal(h1.niveaux[850].agl, 1500 - 181);
    assert.equal(new Date(h1.utc).toISOString(), "2026-08-22T07:00:00.000Z");
    assert.equal(r.recupereLe, new Date("Sat, 22 Aug 2026 09:00:00 GMT").toISOString());
  } finally {
    restaurer();
  }
});

test("chargerMeteo : échec HTTP ou délai dépassé -> message explicite", async () => {
  let restaurer = installerFetch(async () => jsonResponse({}, { status: 500 }));
  try { await assert.rejects(chargerMeteo(), /Open-Meteo indisponible \(HTTP 500\)/); } finally { restaurer(); }
  restaurer = installerFetch(async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; });
  try { await assert.rejects(chargerMeteo(), /délai dépassé/); } finally { restaurer(); }
  restaurer = installerFetch(async () => jsonResponse({ hourly: { time: [] }, daily: { time: [] } }));
  try { await assert.rejects(chargerMeteo(), /incomplète/); } finally { restaurer(); }
});

test("chargerAero : garde le METAR et le TAF les plus récents ; réseau en échec -> null sans exception", async () => {
  const now = new Date(Date.UTC(2026, 9, 1, 15, 30));
  let restaurer = installerFetch(async (url) => new Response(String(url).includes("/metar?")
    ? "EBCI 011520Z 25011KT 9999 FEW042 21/10 Q1025 NOSIG=\nEBCI 011450Z 25010KT 9999 FEW040 21/10 Q1025 NOSIG="
    : "EBCI 010500Z 0106/0212 27008KT 9999 SCT045=\nEBCI 011100Z 0112/0218 27008KT 9999 SCT045="));
  try {
    const a = await chargerAero(now);
    assert.match(a.metar.brut, /011520Z/);
    assert.equal(a.taf.emis.toISOString(), "2026-10-01T11:00:00.000Z");
  } finally { restaurer(); }
  restaurer = installerFetch(async () => { throw new Error("hors ligne"); });
  try { assert.deepEqual(await chargerAero(now), { metar: null, taf: null }); } finally { restaurer(); }
});
