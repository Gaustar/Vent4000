import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMetar, ageMetar, parseTaf, conditionsTaf, tousMessages, lireConditions } from "./metar.js";

const NOW = new Date(Date.UTC(2026, 9, 1, 13, 20));
const h = (jour, heure) => Date.UTC(2026, 9, jour, heure);

test("parseMetar : vent et rafales en km/h, visibilité, plafond = première couche BKN/OVC", () => {
  const m = parseMetar("EBCI 011250Z 25012G25KT 200V320 8000 FEW012 BKN025 OVC040 21/11 Q1024 NOSIG", NOW);
  assert.equal(m.obs.toISOString(), "2026-10-01T12:50:00.000Z");
  assert.equal(m.vent, 22);
  assert.equal(m.rafales, 46);
  assert.equal(m.visibilite, 8000);
  assert.equal(m.plafond, 762); // BKN025
  assert.equal(ageMetar(m, NOW), 30);
});

test("parseMetar : CAVOK, orage, CB, brouillard VV ; la tendance n'est pas une observation", () => {
  const cavok = parseMetar("EBCI 011250Z 09005KT CAVOK 21/11 Q1024 TEMPO 3000 TSRA", NOW);
  assert.equal(cavok.plafond, Infinity);
  assert.equal(cavok.orage, false);
  const ts = parseMetar("EBCI 011250Z 24015KT 4000 +TSRA SCT020CB 18/16 Q1010", NOW);
  assert.equal(ts.orage, true);
  assert.equal(ts.precip, true);
  assert.equal(ts.cb, true);
  const fg = parseMetar("METAR EBCI 010650Z 00000KT 0300 FG VV001 10/10 Q1024", NOW);
  assert.equal(fg.brouillard, true);
  assert.equal(fg.plafond, 30);
  assert.equal(parseMetar(null), null);
});

test("parseMetar : observation de la fin du mois précédent", () => {
  const m = parseMetar("EBCI 302350Z 24008KT 9999 FEW030 12/08 Q1020", new Date(Date.UTC(2026, 9, 1, 0, 10)));
  assert.equal(m.obs.toISOString(), "2026-09-30T23:50:00.000Z");
});

test("tousMessages : découpe la réponse MET Norway sur « = »", () => {
  assert.deepEqual(tousMessages("EBCI 011450Z 25010KT 9999 FEW040 21/10 Q1025 NOSIG=\nEBCI 011520Z 25011KT\n 9999 FEW042 21/10 Q1025 NOSIG=\n"),
    ["EBCI 011450Z 25010KT 9999 FEW040 21/10 Q1025 NOSIG", "EBCI 011520Z 25011KT 9999 FEW042 21/10 Q1025 NOSIG"]);
});

test("lireConditions : un groupe ne renvoie que ce qu'il décrit (héritage TAF)", () => {
  assert.deepEqual(Object.keys(lireConditions(["4000", "SHRA"])).sort(), ["brouillard", "orage", "precip", "temps", "visibilite"]);
  assert.equal(lireConditions(["NSC"]).plafond, Infinity);
});

test("parseTaf : validité, groupes BECMG / TEMPO / PROB30 TEMPO / FM, heure 24", () => {
  const t = parseTaf("TAF EBCI 011100Z 0112/0218 27008KT 9999 SCT045 BECMG 0118/0120 VRB03KT PROB30 TEMPO 0202/0208 0300 FG BKN001 FM021200 30015G28KT CAVOK", NOW);
  assert.equal(t.debut.toISOString(), "2026-10-01T12:00:00.000Z");
  assert.equal(t.fin.toISOString(), "2026-10-02T18:00:00.000Z");
  assert.deepEqual(t.groupes.map((g) => [g.type, g.proba, g.tempo]), [["BECMG", null, false], ["PROB", 30, true], ["FM", null, false]]);
  const t24 = parseTaf("TAF EBCI 011100Z 0112/0124 27008KT 9999 SCT045", NOW);
  assert.equal(t24.fin.toISOString(), "2026-10-02T00:00:00.000Z");
});

test("conditionsTaf : base, BECMG terminé appliqué, TEMPO/PROB en variante, FM remplace ; hors validité -> null", () => {
  const t = parseTaf("TAF EBCI 011100Z 0112/0218 27008KT 9999 SCT045 BECMG 0118/0120 VRB03KT PROB40 0202/0208 0300 FG BKN001 FM021200 30015G28KT CAVOK", NOW);
  const midi = conditionsTaf(t, h(1, 12), h(1, 13));
  assert.equal(midi.principal.vent, 15);
  assert.deepEqual(midi.variantes, []);
  // Pendant le BECMG : variante ; après : appliqué (vent 3 kt, visibilité héritée).
  assert.equal(conditionsTaf(t, h(1, 19), h(1, 20)).variantes.length, 1);
  const soir = conditionsTaf(t, h(1, 21), h(1, 22));
  assert.equal(soir.principal.vent, 6);
  assert.equal(soir.principal.visibilite, 10000);
  // PROB40 brouillard : variante avec plafond 30 m.
  const aube = conditionsTaf(t, h(2, 5), h(2, 6));
  assert.equal(aube.variantes[0].cond.plafond, 30);
  assert.equal(aube.variantes[0].cond.visibilite, 300);
  // FM : tout est remplacé.
  const apres = conditionsTaf(t, h(2, 13), h(2, 14));
  assert.equal(apres.principal.rafales, 52);
  assert.equal(apres.principal.plafond, Infinity);
  assert.equal(conditionsTaf(t, h(3, 13), h(3, 14)), null);
});
