import { test } from "node:test";
import assert from "node:assert/strict";
import { conseilDeplacement, DUREE_FENETRE_CONFORTABLE, ECHEANCE_PLANIFICATION } from "./deplacement.js";
import { coutAllerRetour, TRAJET } from "./config.js";

const BON = { verdict: "vert", duree: 4, confiance: "haute", echeanceJours: 0 };

test("Le coût d'un aller-retour raté est calculé sur le trajet réel", () => {
  const c = coutAllerRetour();
  assert.equal(c.km, TRAJET.distanceAllerKm * 2);
  assert.equal(c.minutes, TRAJET.dureeAllerMin * 2);
  assert.ok(c.euros > 0);
});

test("Aujourd'hui, vert + confiance solide + fenêtre confortable -> partir", () => {
  const c = conseilDeplacement(BON);
  assert.equal(c.niveau, "partir");
  // Le coût est toujours présent : l'arbitrage doit rester concret.
  assert.equal(c.cout.km, TRAJET.distanceAllerKm * 2);
});

test("Verdict rouge -> renoncer, quelle que soit l'échéance", () => {
  for (const echeanceJours of [0, 2, 5]) {
    const c = conseilDeplacement({ ...BON, verdict: "rouge", echeanceJours });
    assert.equal(c.niveau, "renoncer", `J+${echeanceJours}`);
  }
});

test("Une fenêtre de durée nulle -> renoncer même si le verdict est vert", () => {
  assert.equal(conseilDeplacement({ ...BON, duree: 0 }).niveau, "renoncer");
});

test("Fenêtre trop courte aujourd'hui -> pari ouvert, pas « partir »", () => {
  const c = conseilDeplacement({ ...BON, duree: DUREE_FENETRE_CONFORTABLE - 1 });
  assert.equal(c.niveau, "reconfirmer");
  assert.match(c.detail, /fenêtre courte/);
});

test("Modèles en désaccord aujourd'hui -> pari ouvert, pas « partir »", () => {
  const c = conseilDeplacement({ ...BON, confiance: "faible" });
  assert.equal(c.niveau, "reconfirmer");
  assert.match(c.detail, /modèles peu d'accord/);
});

test("Au-delà de l'horizon de planification -> jamais « partir »", () => {
  // Une prévision à J+4 ne justifie pas d'engager 226 km : elle bougera.
  const c = conseilDeplacement({ ...BON, echeanceJours: ECHEANCE_PLANIFICATION + 1 });
  assert.equal(c.niveau, "planifier");
  assert.match(c.titre, /Trop tôt/);
});

test("Bon créneau à J+2 -> « garde le créneau », décision le matin même", () => {
  const c = conseilDeplacement({ ...BON, echeanceJours: 2 });
  assert.equal(c.niveau, "planifier");
  // Le club publie sa banderole à 7h10 le jour même : c'est le vrai point
  // de décision, l'app ne doit jamais laisser croire qu'on part la veille.
  assert.match(c.detail, /7h10/);
});

test("« Partir » n'est JAMAIS proposé pour un autre jour qu'aujourd'hui", () => {
  for (let j = 1; j <= 6; j++) {
    const c = conseilDeplacement({ ...BON, echeanceJours: j });
    assert.notEqual(c.niveau, "partir", `J+${j} ne doit pas dire « pars »`);
  }
});

test("Orange aujourd'hui -> pari ouvert, avec le coût chiffré dans le détail", () => {
  const c = conseilDeplacement({ ...BON, verdict: "orange" });
  assert.equal(c.niveau, "reconfirmer");
  assert.match(c.detail, new RegExp(`${coutAllerRetour().euros}\\s*€`));
});
