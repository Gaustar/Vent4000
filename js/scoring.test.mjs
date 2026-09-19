import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreHeure, scoreCreneau, meilleurVerdict, ventPiste, plafondEstime, niveauConfiance } from "./scoring.js";

const SEUILS_TANDEM = { ventMax: 28, plafondMin: 1500 };

function heure(overrides = {}) {
  return {
    vent10: 10, rafales10: 12, direction10: 240,
    t2m: 20, pointRosee: 10, precip: 0, probaPluie: 5,
    nuagesBas: 0, nuagesMoyens: 0, nuagesHauts: 0,
    visibilite: 10000, cape: 0,
    ...overrides,
  };
}

test("Conditions idéales -> vert", () => {
  const s = scoreHeure(heure(), SEUILS_TANDEM);
  assert.equal(s.verdict, "vert");
  assert.deepEqual(s.raisons, []);
});

test("Vent au-dessus du seuil -> rouge éliminatoire", () => {
  const s = scoreHeure(heure({ vent10: 30 }), SEUILS_TANDEM);
  assert.equal(s.verdict, "rouge");
  assert.ok(s.raisons.some((r) => r.includes("Vent")));
});

test("Vent proche du seuil (>80%) sans le dépasser -> orange", () => {
  const s = scoreHeure(heure({ vent10: 24 }), SEUILS_TANDEM); // 24 > 28*0.8=22.4
  assert.equal(s.verdict, "orange");
});

test("Pluie -> rouge éliminatoire même par vent nul", () => {
  const s = scoreHeure(heure({ vent10: 0, precip: 1 }), SEUILS_TANDEM);
  assert.equal(s.verdict, "rouge");
});

test("Plafond bas (écart T/Td faible + nuages bas) -> rouge", () => {
  const s = scoreHeure(heure({ t2m: 12, pointRosee: 11, nuagesBas: 80 }), SEUILS_TANDEM);
  // écart 1°C * 122m = 122m de base, largement sous le plafond min tandem (1500m)
  assert.equal(s.verdict, "rouge");
  assert.ok(s.plafond < SEUILS_TANDEM.plafondMin);
});

test("Ciel dégagé (peu de nuages) -> plafond illimité", () => {
  const p = plafondEstime(heure({ nuagesBas: 5, nuagesMoyens: 5 }));
  assert.equal(p, Infinity);
});

test("Écart rafales/vent important -> orange (dégradant)", () => {
  const s = scoreHeure(heure({ vent10: 10, rafales10: 25 }), SEUILS_TANDEM);
  assert.equal(s.verdict, "orange");
  assert.ok(s.raisons.some((r) => r.includes("Rafales")));
});

test("Écart rafales : seuil propre au niveau (élève plus strict qu'un B/C/D)", () => {
  // Écart de 12 km/h : au-dessus du seuil élève/tandem (9), en-dessous du seuil B/C/D (18)
  const s1 = scoreHeure(heure({ vent10: 10, rafales10: 22 }), { ventMax: 28, plafondMin: 1500, ecartRafalesOrange: 9 });
  assert.equal(s1.verdict, "orange");
  const s2 = scoreHeure(heure({ vent10: 10, rafales10: 22 }), { ventMax: 46, plafondMin: 1100, ecartRafalesOrange: 18 });
  assert.equal(s2.verdict, "vert");
});

test("Rafale au-dessus du seuil (même si le vent moyen est sous le seuil) -> rouge", () => {
  // La limite de vent s'applique à la rafale, pas à la moyenne (pratique DZ standard).
  const s = scoreHeure(heure({ vent10: 20, rafales10: 30 }), SEUILS_TANDEM); // seuil 28
  assert.equal(s.verdict, "rouge");
  assert.ok(s.raisons.some((r) => r.includes("Rafales") && r.includes("seuil")));
});

test("Vent en hausse rapide d'une heure à l'autre -> orange", () => {
  const s = scoreHeure(heure({ vent10: 20, rafales10: 22, ventPrecedent: 8 }), SEUILS_TANDEM);
  assert.equal(s.verdict, "orange");
  assert.ok(s.raisons.some((r) => r.includes("hausse rapide")));
});

test("Vent stable d'une heure à l'autre -> pas de dégradation liée à la tendance", () => {
  const s = scoreHeure(heure({ vent10: 10, rafales10: 12, ventPrecedent: 9 }), SEUILS_TANDEM);
  assert.equal(s.verdict, "vert");
});

test("Confiance faible entre modèles -> plafonné à orange même si tout est vert", () => {
  const s = scoreHeure(
    heure({ vent10: 10, comparaisons: { arome: { vent: 11 }, ecmwf: { vent: 32 } } }),
    SEUILS_TANDEM
  );
  assert.equal(s.verdict, "orange");
  assert.ok(s.raisons.some((r) => r.includes("divergents")));
});

test("Confiance haute entre modèles -> vert conservé", () => {
  const s = scoreHeure(
    heure({ vent10: 10, comparaisons: { arome: { vent: 11 }, ecmwf: { vent: 12 } } }),
    SEUILS_TANDEM
  );
  assert.equal(s.verdict, "vert");
});

test("Confiance faible n'écrase pas un verdict déjà rouge/orange (raisons plus utiles conservées)", () => {
  const s = scoreHeure(
    heure({ vent10: 30, comparaisons: { arome: { vent: 11 }, ecmwf: { vent: 32 } } }),
    SEUILS_TANDEM
  );
  assert.equal(s.verdict, "rouge");
  assert.ok(s.raisons.some((r) => r.includes("Vent")));
});

test("scoreCreneau : 2h vertes consécutives -> vert", () => {
  assert.equal(scoreCreneau(["orange", "vert", "vert", "rouge"]), "vert");
});

test("scoreCreneau : pas de 2h vertes mais 2h non-rouges consécutives -> orange", () => {
  assert.equal(scoreCreneau(["rouge", "orange", "orange", "rouge"]), "orange");
});

test("scoreCreneau : jamais 2h consécutives sautables -> rouge", () => {
  assert.equal(scoreCreneau(["vert", "rouge", "vert", "rouge"]), "rouge");
});

test("meilleurVerdict privilégie le meilleur créneau du jour", () => {
  assert.equal(meilleurVerdict(["rouge", "orange", "rouge"]), "orange");
  assert.equal(meilleurVerdict(["rouge", "vert"]), "vert");
  assert.equal(meilleurVerdict(["rouge", "rouge"]), "rouge");
});

test("ventPiste : vent plein axe -> tout en face, rien en traversier", () => {
  const vp = ventPiste(20, 64, 64); // vent vient exactement de l'axe piste
  assert.equal(vp.face, 20);
  assert.equal(vp.traversier, 0);
});

test("ventPiste : vent perpendiculaire à l'axe -> tout en traversier", () => {
  const vp = ventPiste(20, 154, 64); // 64+90
  assert.equal(vp.traversier, 20);
  assert.equal(vp.face, 0);
});

test("niveauConfiance : un seul modèle disponible -> 'unique'", () => {
  const c = niveauConfiance(15, [{ nom: "AROME", vent: null }, { nom: "ECMWF", vent: null }]);
  assert.equal(c.niveau, "unique");
  assert.equal(c.nModeles, 1);
});

test("niveauConfiance : 3 modèles proches -> confiance haute", () => {
  const c = niveauConfiance(15, [{ nom: "AROME", vent: 17 }, { nom: "ECMWF", vent: 16 }]);
  assert.equal(c.niveau, "haute");
  assert.equal(c.nModeles, 3);
  assert.equal(c.ecart, 2); // écart max = |15-17|
});

test("niveauConfiance : un modèle très divergent suffit à faire chuter la confiance", () => {
  const c = niveauConfiance(15, [{ nom: "AROME", vent: 16 }, { nom: "ECMWF", vent: 35 }]);
  assert.equal(c.niveau, "faible");
  assert.equal(c.ecart, 20);
});
