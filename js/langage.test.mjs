import { test } from "node:test";
import assert from "node:assert/strict";
import { regleEnClair, confianceEnClair, echeanceEnClair, directionEnClair, cielEnClair, visibiliteEnClair, tempsEnClair } from "./langage.js";
import { REGLES } from "./regles.js";

test("regleEnClair : chaque règle a ses mots, non respectée ou douteuse", () => {
  for (const r of REGLES) {
    const non = regleEnClair({ id: r.id, statut: "violee" });
    const doute = regleEnClair({ id: r.id, statut: "incertaine" });
    assert.ok(non && doute && non !== doute, r.id);
    assert.doesNotMatch(non + doute, /RSB|GDF|kts|≤|≥/);
  }
  assert.equal(regleEnClair({ id: "rafales", statut: "violee" }), "Rafales trop fortes pour ton niveau");
  assert.equal(regleEnClair({ id: "inconnue", statut: "violee", label: "X" }), "X");
});

test("confianceEnClair et echeanceEnClair", () => {
  assert.match(confianceEnClair({ precision: "regional", confiance: "haute", index: 5 }), /lointaine/);
  assert.match(confianceEnClair({ precision: "hr", confiance: "faible", index: 1 }), /pas toutes d'accord/);
  assert.match(confianceEnClair({ precision: "hr", confiance: "haute", index: 0 }), /d'accord/);
  assert.equal(echeanceEnClair(0), "aujourd'hui");
  assert.equal(echeanceEnClair(1), "demain");
  assert.equal(echeanceEnClair(4), "dans 4 jours");
});

test("METAR en clair : direction, ciel, visibilité, temps", () => {
  assert.equal(directionEnClair(260), "d'ouest");
  assert.equal(directionEnClair(355), "du nord");
  assert.equal(directionEnClair(null), null);
  assert.equal(cielEnClair({ cavok: true }), "ciel dégagé");
  assert.equal(cielEnClair({ nuages: [{ couverture: "FEW", baseM: 914 }] }), "quelques nuages à 910 m");
  assert.equal(cielEnClair({ nuages: [{ couverture: "FEW", baseM: 600 }, { couverture: "OVC", baseM: 1219 }] }), "ciel couvert à 1,2 km");
  assert.equal(cielEnClair({ nuages: [{ couverture: "VV", baseM: 30 }] }), "brouillard, ciel invisible");
  assert.equal(cielEnClair({ nuages: [] }), "pas de nuage bas");
  assert.equal(visibiliteEnClair(10000), "bonne visibilité");
  assert.equal(visibiliteEnClair(4000), "mauvaise visibilité (4 km)");
  assert.equal(tempsEnClair(["-SHRA", "BR", "VCTS"]), "averses, brume");
});
