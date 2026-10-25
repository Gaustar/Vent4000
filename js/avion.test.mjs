import { test } from "node:test";
import assert from "node:assert/strict";
import { lireAvions, phaseVol, distanceKm, relevement } from "./avion.js";

// Format « readsb » d'adsb.lol (champs relevés le 2026-10-25) ; positions synthétiques autour d'EBNM.
const REPONSE = { ac: [
  { hex: "4d2349", r: "9H-VUJ", t: "B38M", alt_baro: 37000, gs: 425.4, lat: 50.49, lon: 4.62, seen_pos: 0 },          // ligne régulière
  { hex: "39c4e6", r: "F-GHGZ", t: "C208", alt_baro: 9800, gs: 105, baro_rate: 1150, track: 244, lat: 50.52, lon: 4.80, seen_pos: 1.2 },
  { hex: "44a0b1", r: "OO-ABC", t: "C208", alt_baro: "ground", gs: 0, lat: 50.4895, lon: 4.7690, seen: 3 },
  { hex: "3c6444", r: "D-FAST", t: "PC6T", alt_baro: 6000, lat: 51.2, lon: 4.4 },                                     // trop loin
  { hex: "abc123", r: "N208X", t: "C208", alt_baro: 25000, lat: 50.5, lon: 4.77 },                                    // trop haut
  { hex: "~000001", t: "C208" },                                                                                        // sans position
] };

test("lireAvions : avion du club d'abord, autres avions de largage proches ensuite", () => {
  const a = lireAvions(REPONSE);
  assert.deepEqual(a.map((x) => x.immat), ["F-GHGZ", "OO-ABC"]);
  const club = a[0];
  assert.equal(club.club, true);
  assert.equal(club.altitudeM, Math.round(9800 * 0.3048));
  assert.equal(club.vitesseKmh, Math.round(105 * 1.852));
  assert.equal(club.vario, 1150);
  assert.equal(phaseVol(club), "en montée");
  assert.ok(club.distanceKm > 3 && club.distanceKm < 5);
  assert.equal(a[1].club, false);
  assert.equal(a[1].auSol, true);
  assert.equal(phaseVol(a[1]), "au sol");
});

test("lireAvions : réponse vide ou invalide → liste vide", () => {
  assert.deepEqual(lireAvions(null), []);
  assert.deepEqual(lireAvions({ ac: "x" }), []);
  assert.deepEqual(lireAvions({ ac: [] }), []);
});

test("géométrie : distance et relèvement", () => {
  assert.ok(Math.abs(distanceKm(50.4897, 4.7697, 50.5797, 4.7697) - 10.0) < 0.1);   // 0,09° de latitude ≈ 10 km
  assert.ok(Math.abs(relevement(50.4897, 4.7697, 50.5797, 4.7697) - 0) < 0.5);       // plein nord
  assert.ok(Math.abs(relevement(50.4897, 4.7697, 50.4897, 4.90) - 90) < 0.5);        // plein est
  assert.equal(phaseVol({ vario: -800 }), "en descente");
  assert.equal(phaseVol({ vario: 50 }), "en palier");
  assert.equal(phaseVol({ vario: null }), null);
});

test("lireAvions : position MLAT réelle (sans cap ni vitesse) à 17 km, comme F-GHGZ", () => {
  // Champs relevés sur adsb.lol le 2026-10-25 pour une cible MLAT (gs et track absents).
  const a = lireAvions({ ac: [{ hex: "391cd9", type: "mlat", r: "F-GHGZ", t: "C208", alt_baro: 12400, baro_rate: 960, lat: 50.64, lon: 4.77, seen_pos: 2.1, mlat: ["baro_rate", "lat", "lon"] }] });
  assert.equal(a.length, 1);
  assert.equal(a[0].club, true);
  assert.equal(a[0].cap, null);
  assert.equal(a[0].vitesseKmh, null);
  assert.equal(phaseVol(a[0]), "en montée");
  assert.ok(a[0].distanceKm > 16 && a[0].distanceKm < 18);
});
