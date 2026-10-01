import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreHeure, scoreCreneau, fenetreSautable, meilleurVerdict, ventPiste, sourcesHeure } from "./scoring.js";
import { evaluerSource, conditionsModele, conditionsAero } from "./regles.js";
import { parseMetar, parseTaf } from "./metar.js";
import { NIVEAUX_PRATIQUE } from "./config.js";

const TANDEM = NIVEAUX_PRATIQUE.tandem;
const CD = NIVEAUX_PRATIQUE.brevetCD;
const UTC = Date.UTC(2026, 9, 1, 12, 0); // 01/10/2026 12:00 UTC = 14h à Bruxelles
const NOW = new Date(UTC + 20 * 60000);

/** Un modèle « calme et dégagé ». */
const calme = (o = {}) => ({ vent: 10, rafales: 15, dir: 240, nuagesBas: 10, nuagesMoyens: 0, base: null, visibilite: 30000, code: 1, precip: 0, ...o });
const HR = ["meteofrance_arome_france_hd", "icon_d2", "knmi_harmonie_arome_netherlands", "dmi_harmonie_arome_europe", "ukmo_uk_deterministic_2km"];
function heure(modeles) {
  return { iso: "2026-10-01T14:00", heure: 14, utc: UTC, modeles };
}
const tousHR = (f) => Object.fromEntries(HR.map((id, i) => [id, f(i)]));

// ---------------- Règles sur une source ----------------

test("evaluerSource : vent moyen hors loi, hors brevet ; rafales hors brevet", () => {
  const r = evaluerSource({ vent: 50, rafales: 60 }, CD);
  assert.equal(r.ventLegal.statut, "echec");
  const t = evaluerSource({ vent: 20, rafales: 30 }, TANDEM);
  assert.equal(t.ventLegal.statut, "ok");
  assert.equal(t.ventNiveau.statut, "ok");
  assert.equal(t.rafales.statut, "echec");
});

test("conditionsModele : jamais d'estimation du plafond", () => {
  // Couche basse < 5/8 : par définition aucun plafond sous ~2 km.
  assert.equal(conditionsModele(calme({ nuagesBas: 40 })).plafondAuMoins, 2000);
  // Couche basse ≥ 5/8, modèle qui CALCULE la base → base retenue.
  assert.equal(conditionsModele(calme({ nuagesBas: 90, base: 600 }), true).plafond, 600);
  // Couche basse ≥ 5/8, modèle sans base → inconnu (et non estimé).
  const c = conditionsModele(calme({ nuagesBas: 90, base: null }), false);
  assert.equal(c.plafond, null);
  assert.equal(c.plafondAuMoins, null);
  assert.equal(evaluerSource(c, TANDEM).plafond.statut, "inconnu");
});

test("Ouverture tandem (5000 ft) au-dessus d'une couche légale -> limite, pas échec", () => {
  const r = evaluerSource({ vent: 10, rafales: 10, plafond: 1200 }, TANDEM);
  assert.equal(r.plafond.statut, "ok");
  assert.equal(r.ouverture.statut, "limite");
  assert.equal(evaluerSource({ vent: 10, plafond: 1200 }, CD).ouverture, undefined, "pas de règle d'ouverture au-dessus du plancher pour C/D");
});

test("METAR sans groupe de rafale ni de temps présent = pas de rafale significative, pas de phénomène", () => {
  const c = conditionsAero(parseMetar("EBCI 011220Z 24008KT 9999 FEW028 21/13 Q1024 NOSIG", NOW));
  const r = evaluerSource(c, TANDEM);
  assert.equal(r.rafales.statut, "ok");
  assert.equal(r.orage.statut, "ok");
  assert.equal(r.pluie.statut, "ok");
  assert.equal(r.plafond.statut, "ok");
});

// ---------------- Combinaison des sources ----------------

test("Toutes les sources 2 km conformes -> vert, 5/5", () => {
  const s = scoreHeure(heure(tousHR(() => calme())), TANDEM, { maintenant: NOW });
  assert.equal(s.verdict, "vert");
  assert.deepEqual(s.accord, { favorables: 5, total: 5 });
  assert.equal(s.precision, "hr");
});

test("Majorité des sources en échec -> rouge ; minorité -> orange (divergence) ; égalité -> orange", () => {
  const rouge = scoreHeure(heure(tousHR((i) => calme({ rafales: i < 3 ? 35 : 15 }))), TANDEM, { maintenant: NOW });
  assert.equal(rouge.verdict, "rouge");
  assert.match(rouge.raisons[0], /^Rafales ≤ limite du brevet — 3\/5 sources en échec/);
  const orange = scoreHeure(heure(tousHR((i) => calme({ rafales: i < 2 ? 35 : 15 }))), TANDEM, { maintenant: NOW });
  assert.equal(orange.verdict, "orange");
  assert.equal(orange.regles.find((r) => r.id === "rafales").statut, "incertaine");
});

test("Les modèles régionaux ne servent que hors portée des modèles 2 km", () => {
  const avecHR = sourcesHeure(heure({ ...tousHR(() => calme()), ecmwf_ifs: calme({ rafales: 60 }) }), TANDEM, { maintenant: NOW });
  assert.equal(avecHR.some((s) => s.id === "ecmwf_ifs"), false);
  const sansHR = scoreHeure(heure({ ecmwf_ifs: calme(), icon_eu: calme() }), TANDEM, { maintenant: NOW });
  assert.equal(sansHR.precision, "regional");
  assert.equal(sansHR.verdict, "vert");
});

test("Couche basse ≥ 5/8 sans base calculée par aucune source -> plafond non vérifiable -> orange", () => {
  const modeles = { icon_d2: calme({ nuagesBas: 95 }), meteofrance_arome_france_hd: calme({ nuagesBas: 90 }) };
  const s = scoreHeure(heure(modeles), CD, { maintenant: NOW });
  assert.equal(s.regles.find((r) => r.id === "plafond").statut, "nonVerifiable");
  assert.equal(s.verdict, "orange");
});

test("Base calculée sous 3000 ft par DMI et UKMO, les autres sans base -> rouge", () => {
  const modeles = {
    icon_d2: calme({ nuagesBas: 95 }),
    dmi_harmonie_arome_europe: calme({ nuagesBas: 95, base: 450 }),
    ukmo_uk_deterministic_2km: calme({ nuagesBas: 100, base: 300 }),
  };
  const s = scoreHeure(heure(modeles), CD, { maintenant: NOW });
  assert.equal(s.verdict, "rouge");
  assert.match(s.raisons.join(" "), /Base des nuages/);
});

test("Orage prévu par la majorité -> rouge ; pluie -> orange (pas de seuil écrit)", () => {
  assert.equal(scoreHeure(heure(tousHR(() => calme({ code: 95 }))), CD, { maintenant: NOW }).verdict, "rouge");
  const pluie = scoreHeure(heure(tousHR(() => calme({ code: 61, precip: 1.2 }))), CD, { maintenant: NOW });
  assert.equal(pluie.verdict, "orange");
  assert.equal(pluie.regles.find((r) => r.id === "pluie").statut, "limite");
});

test("Observation de l'heure en cours : elle tranche seule, contre tous les modèles", () => {
  const metar = parseMetar("EBCI 011210Z 24015G28KT 9999 FEW030 18/10 Q1015", NOW);
  const s = scoreHeure(heure(tousHR(() => calme())), TANDEM, { metar, maintenant: NOW });
  assert.equal(s.verdict, "rouge");
  assert.equal(s.precision, "obs");
  assert.ok(s.regles.find((r) => r.id === "rafales").parObservation);
  // Une heure plus tard, l'observation ne s'applique plus.
  const plusTard = scoreHeure({ ...heure(tousHR(() => calme())), utc: UTC + 3600000 }, TANDEM, { metar, maintenant: NOW });
  assert.equal(plusTard.verdict, "vert");
});

test("TAF : conditions de base hors règle = une voix en échec ; TEMPO hors règle = divergence", () => {
  const taf = parseTaf("TAF EBCI 011100Z 0112/0218 27008KT 9999 SCT045 TEMPO 0113/0116 3000 SHRA BKN008", NOW);
  // 12-13 UTC : base seule → conforme.
  assert.equal(scoreHeure(heure(tousHR(() => calme())), CD, { taf, maintenant: NOW }).verdict, "vert");
  // 14-15 UTC : TEMPO BKN008 (244 m) → plafond divergent → orange.
  const s = scoreHeure({ ...heure(tousHR(() => calme())), utc: UTC + 2 * 3600000 }, CD, { taf, maintenant: NOW });
  assert.equal(s.verdict, "orange");
  assert.match(s.regles.find((r) => r.id === "plafond").detail, /TEMPO 0113\/0116/);
});

// ---------------- Fenêtres ----------------

test("ventPiste : plein axe / perpendiculaire", () => {
  assert.deepEqual(ventPiste(20, 64), { traversier: 0, face: 20 });
  assert.deepEqual(ventPiste(20, 154), { traversier: 20, face: 0 });
});

test("scoreCreneau : 2h vertes -> vert ; 2h non rouges -> orange ; sinon rouge", () => {
  assert.equal(scoreCreneau(["rouge", "vert", "vert", "rouge"]), "vert");
  assert.equal(scoreCreneau(["vert", "orange", "rouge"]), "orange");
  assert.equal(scoreCreneau(["vert", "rouge", "vert"]), "rouge");
});

test("meilleurVerdict privilégie le meilleur créneau du jour", () => {
  assert.equal(meilleurVerdict(["rouge", "vert"]), "vert");
  assert.equal(meilleurVerdict(["rouge", "orange"]), "orange");
  assert.equal(meilleurVerdict(["rouge"]), "rouge");
});

test("fenetreSautable : plus longue plage verte ; une heure isolée ne fait pas une fenêtre", () => {
  const h = (heure, verdict) => ({ heure, verdict });
  assert.deepEqual(fenetreSautable([h(9, "vert"), h(10, "vert"), h(11, "rouge"), h(12, "vert"), h(13, "vert"), h(14, "vert")]),
    { verdict: "vert", debut: 12, fin: 15, duree: 3 });
  assert.equal(fenetreSautable([h(18, "vert")]).verdict, "rouge");
  assert.equal(fenetreSautable([h(9, "vert"), h(11, "vert")]).verdict, "rouge", "trou entre les heures");
});
