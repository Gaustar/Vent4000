import { test } from "node:test";
import assert from "node:assert/strict";
import { NIVEAUX_PRATIQUE, LEGAL_BE, SEUILS_COMMUNS, MARGE_PLAFOND_OUVERTURE } from "./config.js";

// ---- Étage 1 : plancher légal belge (CIR/GDF-05 §6) -------------------
// Ces invariants-là ne sont PAS des choix DZ : ce sont des conversions
// d'un texte réglementaire. Les casser, c'est produire un feu vert sur un
// saut interdit — d'où des tests dédiés et stricts.

test("LEGAL_BE transcrit fidèlement CIR/GDF-05 §6 (25 kts, 3000 ft, 3000 m)", () => {
  // 25 kts = 46,30 km/h ; 3000 ft = 914,4 m. Arrondis à l'entier INFÉRIEUR
  // pour le vent (ne jamais autoriser plus que la loi) et pour le plafond
  // (le plancher reste franchi dès qu'on passe sous 914).
  assert.equal(LEGAL_BE.ventMoyenMaxSol, Math.floor(25 * 1.852));
  assert.equal(LEGAL_BE.plafondMinAGL, Math.floor(3000 * 0.3048));
  assert.equal(LEGAL_BE.visibiliteMin, 3000);
});

test("Aucun niveau ne peut autoriser un vent au-dessus de la limite légale", () => {
  for (const [cle, n] of Object.entries(NIVEAUX_PRATIQUE)) {
    assert.ok(n.ventMax <= LEGAL_BE.ventMoyenMaxSol,
      `${cle} (${n.ventMax} km/h) dépasse la limite légale (${LEGAL_BE.ventMoyenMaxSol})`);
  }
});

test("Aucun niveau ne peut autoriser un plafond sous le minimum légal", () => {
  for (const [cle, n] of Object.entries(NIVEAUX_PRATIQUE)) {
    assert.ok(n.plafondMin >= LEGAL_BE.plafondMinAGL,
      `${cle} (${n.plafondMin} m) passe sous le minimum légal (${LEGAL_BE.plafondMinAGL})`);
  }
});

test("La marge de confort visibilité reste au-dessus du minimum légal", () => {
  assert.ok(SEUILS_COMMUNS.visibiliteConfort >= LEGAL_BE.visibiliteMin);
});

// ---- Plafonds par brevet : dérivés, pas posés à la main ---------------

test("plafondMin dérive bien de max(plancher légal, ouverture + marge)", () => {
  for (const [cle, n] of Object.entries(NIVEAUX_PRATIQUE)) {
    const attendu = Math.max(LEGAL_BE.plafondMinAGL, n.hauteurOuverture + MARGE_PLAFOND_OUVERTURE);
    assert.equal(n.plafondMin, attendu, cle);
  }
});

test("À hauteur d'ouverture égale, le plafond est égal (l'incohérence tandem/AFF ne doit pas revenir)", () => {
  // Tandem et Élève AFF ouvrent tous deux à 1500 m : rien ne justifiait
  // 1500 m de plafond pour l'un et 2800 m pour l'autre (cf. config.js).
  assert.equal(NIVEAUX_PRATIQUE.tandem.hauteurOuverture, NIVEAUX_PRATIQUE.aff.hauteurOuverture);
  assert.equal(NIVEAUX_PRATIQUE.tandem.plafondMin, NIVEAUX_PRATIQUE.aff.plafondMin);
});

// Ces tests ne vérifient pas des "bons" chiffres absolus (ce sont des choix
// DZ) mais figent les invariants issus de la validation du 2026-09-19
// contre la FFP (Directive Technique n°49) — voir CHANGELOG.md et les
// commentaires de config.js. Un futur changement qui casserait un de ces
// invariants doit être une décision consciente, pas une régression.

test("Brevet B ne dépasse pas le plafond fédéral documenté (11 m/s = 39,6 km/h)", () => {
  assert.ok(NIVEAUX_PRATIQUE.brevetB.ventMax <= 39.6);
});

test("Barème FWCP §3.4.2 : deux paliers (7 m/s jusqu'au brevet B inclus, 25 kts au-delà)", () => {
  // Le règlement belge ne connaît PAS de progression fine par brevet :
  // c'est un barème à deux niveaux. Les valeurs intermédiaires de la
  // v1.4.x (brevet A à 33, brevet B à 39) venaient de la FFP française et
  // autorisaient un brevet A 8 km/h au-dessus de sa limite FWCP réelle.
  const palierBas = Math.floor(7 * 3.6);        // 7 m/s  = 25,2 → 25
  const palierHaut = Math.floor(12.86 * 3.6);   // 12,86 m/s = 46,3 → 46
  assert.equal(NIVEAUX_PRATIQUE.aff.ventMax, palierBas);
  assert.equal(NIVEAUX_PRATIQUE.brevetA.ventMax, palierBas);
  // Lecture conservatrice de l'ambiguïté « jusqu'au brevet B inclus » vs
  // « à partir du brevet B » — à faire trancher par le RT du club.
  assert.equal(NIVEAUX_PRATIQUE.brevetB.ventMax, palierBas);
  assert.equal(NIVEAUX_PRATIQUE.brevetCD.ventMax, palierHaut);
});

test("Aucune hauteur d'ouverture ne passe sous les 3000 ft AGL du RSB §3.5", () => {
  // « Tout parachutiste doit avoir actionné l'ouverture de son parachute
  // au-dessus de 3000 ft AGL. » Les 850 m hérités de la FFP française
  // étaient sous ce minimum pour les brevets B et C/D.
  for (const [cle, n] of Object.entries(NIVEAUX_PRATIQUE)) {
    assert.ok(n.hauteurOuverture >= LEGAL_BE.plafondMinAGL,
      `${cle} ouvre à ${n.hauteurOuverture} m, sous le minimum de ${LEGAL_BE.plafondMinAGL} m`);
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
