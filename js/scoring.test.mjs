import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreHeure, scoreCreneau, fenetreSautable, meilleurVerdict, ventPiste, plafondEstime, niveauConfiance } from "./scoring.js";

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

// --- Ciel bouché (régression : faux vert corrigé en v1.4.0) -------------

test("Couche moyenne compacte (100 %) -> rouge, pas vert (avion ne peut pas larguer VFR)", () => {
  // Avant v1.4.0 : la bande orange s'arrêtait à 75 % de couverture, donc
  // 100 % passait à travers et ressortait VERT sans aucune raison.
  const s = scoreHeure(heure({ nuagesMoyens: 100, nuagesHauts: 100 }), SEUILS_TANDEM);
  assert.equal(s.verdict, "rouge");
  assert.ok(s.raisons.some((r) => r.includes("largage")), s.raisons.join(" · "));
});

test("Couche basse compacte (95 %) -> rouge avec un message distinct", () => {
  const s = scoreHeure(heure({ t2m: 20, pointRosee: 2, nuagesBas: 95 }), SEUILS_TANDEM);
  assert.equal(s.verdict, "rouge");
  assert.ok(s.raisons.some((r) => r.includes("couche basse")), s.raisons.join(" · "));
});

test("Ciel morcelé (50 % bas + 40 % moyen) -> orange, pas rouge : aucune couche n'est compacte", () => {
  const s = scoreHeure(heure({ t2m: 25, pointRosee: 2, nuagesBas: 50, nuagesMoyens: 40 }), SEUILS_TANDEM);
  assert.equal(s.verdict, "orange");
  assert.ok(s.raisons.some((r) => r.includes("partiellement")));
});

test("Nuages hauts seuls (cirrus 100 %) -> vert : ils sont au-dessus de l'altitude de largage", () => {
  const s = scoreHeure(heure({ nuagesHauts: 100 }), SEUILS_TANDEM);
  assert.equal(s.verdict, "vert");
});

// --- Fenêtre sautable ---------------------------------------------------

test("fenetreSautable : retient la plus longue plage verte et ses heures", () => {
  const f = fenetreSautable([
    { heure: 9, verdict: "orange" },
    { heure: 10, verdict: "vert" },
    { heure: 11, verdict: "vert" },
    { heure: 12, verdict: "vert" },
    { heure: 13, verdict: "rouge" },
  ]);
  assert.equal(f.verdict, "vert");
  assert.equal(f.debut, 10);
  assert.equal(f.fin, 13); // l'heure 12 couvre jusqu'à 13h
  assert.equal(f.duree, 3);
});

test("fenetreSautable : pas de plage verte -> plus longue plage tenable en orange", () => {
  const f = fenetreSautable([
    { heure: 9, verdict: "rouge" },
    { heure: 10, verdict: "orange" },
    { heure: 11, verdict: "orange" },
    { heure: 12, verdict: "rouge" },
  ]);
  assert.equal(f.verdict, "orange");
  assert.equal(f.debut, 10);
  assert.equal(f.fin, 12);
});

test("fenetreSautable : heures vertes isolées, jamais 2 consécutives -> rouge, pas de fenêtre", () => {
  const f = fenetreSautable([
    { heure: 9, verdict: "vert" },
    { heure: 10, verdict: "rouge" },
    { heure: 11, verdict: "vert" },
  ]);
  assert.equal(f.verdict, "rouge");
  assert.equal(f.debut, null);
});

test("fenetreSautable : trou dans les heures -> pas de fenêtre à cheval sur le trou", () => {
  const f = fenetreSautable([
    { heure: 9, verdict: "vert" },
    { heure: 14, verdict: "vert" },
    { heure: 15, verdict: "vert" },
  ]);
  assert.equal(f.debut, 14);
  assert.equal(f.duree, 2);
});

// --- Confiance pondérée par l'échéance ----------------------------------

test("niveauConfiance : même accord entre modèles, la confiance baisse avec l'échéance", () => {
  const modeles = [{ nom: "AROME", vent: 17 }, { nom: "ECMWF", vent: 16 }];
  const proche = niveauConfiance(15, modeles, 0);
  const lointaine = niveauConfiance(15, modeles, 6);
  assert.equal(proche.niveau, "haute");
  assert.equal(lointaine.niveau, "moyenne");
  // L'écart affiché reste l'écart réellement observé
  assert.equal(lointaine.ecart, 2);
  assert.equal(lointaine.penalite, 10);
});

test("niveauConfiance : J+0 et J+1 ne sont pas pénalisés", () => {
  const modeles = [{ nom: "ECMWF", vent: 16 }];
  assert.equal(niveauConfiance(15, modeles, 0).penalite, 0);
  assert.equal(niveauConfiance(15, modeles, 1).penalite, 0);
});

test("scoreHeure : au loin, un léger désaccord entre modèles suffit à plafonner le vert à orange", () => {
  // À J+0 un écart de 4 km/h reste une confiance haute -> vert.
  // À J+6 (pénalité +10) le même écart devient "faible" -> orange.
  const modeles = { arome: { vent: 14 }, ecmwf: { vent: 12 } };
  const proche = scoreHeure(heure({ vent10: 10, comparaisons: modeles, echeanceJours: 0 }), SEUILS_TANDEM);
  const lointain = scoreHeure(heure({ vent10: 10, comparaisons: modeles, echeanceJours: 6 }), SEUILS_TANDEM);
  assert.equal(proche.verdict, "vert");
  assert.equal(lointain.verdict, "orange");
});

test("scoreHeure : au loin, des modèles parfaitement d'accord restent au vert", () => {
  // Choix assumé : plafonner tout J+5/J+6 à orange rendrait inutile la
  // fonction première de l'app (décider en début de semaine quel jour
  // aller sauter). La pénalité dégrade la confiance, elle ne condamne pas
  // l'échéance lointaine à elle seule.
  const modeles = { arome: { vent: 11 }, ecmwf: { vent: 12 } };
  const s = scoreHeure(heure({ vent10: 10, comparaisons: modeles, echeanceJours: 6 }), SEUILS_TANDEM);
  assert.equal(s.verdict, "vert");
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
