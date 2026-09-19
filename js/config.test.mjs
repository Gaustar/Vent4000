import { test } from "node:test";
import assert from "node:assert/strict";
import { NIVEAUX_PRATIQUE } from "./config.js";

// Ces tests ne vérifient pas des "bons" chiffres absolus (ce sont des choix
// DZ) mais figent les invariants issus de la validation du 2026-09-19
// contre la FFP (Directive Technique n°49) — voir CHANGELOG.md et les
// commentaires de config.js. Un futur changement qui casserait un de ces
// invariants doit être une décision consciente, pas une régression.

test("Brevet B ne dépasse pas le plafond fédéral documenté (11 m/s = 39,6 km/h)", () => {
  assert.ok(NIVEAUX_PRATIQUE.brevetB.ventMax <= 39.6);
});

test("Seuils de vent strictement croissants dans l'ordre : élève, tandem (instructeur aux commandes), puis brevets A→B→C/D", () => {
  const ordre = ["aff", "tandem", "brevetA", "brevetB", "brevetCD"];
  const seuils = ordre.map((k) => NIVEAUX_PRATIQUE[k].ventMax);
  for (let i = 1; i < seuils.length; i++) {
    assert.ok(seuils[i] > seuils[i - 1], `${ordre[i]} (${seuils[i]}) devrait être > ${ordre[i - 1]} (${seuils[i - 1]})`);
  }
});

test("Élève AFF reste sous le plafond fédéral de progression (7 m/s = 25,2 km/h)", () => {
  // Le tandem n'est pas couvert par cette règle : ce n'est pas un brevet de
  // la progression FFP, son seuil relève du matériel/de la DZ (cf. config.js).
  assert.ok(NIVEAUX_PRATIQUE.aff.ventMax <= 25.2);
});

test("Chaque niveau expose label, ventMax, plafondMin et ecartRafalesOrange", () => {
  for (const [cle, n] of Object.entries(NIVEAUX_PRATIQUE)) {
    assert.equal(typeof n.label, "string", cle);
    assert.equal(typeof n.ventMax, "number", cle);
    assert.equal(typeof n.plafondMin, "number", cle);
    assert.equal(typeof n.ecartRafalesOrange, "number", cle);
  }
});
