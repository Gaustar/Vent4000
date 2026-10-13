import { test } from "node:test";
import assert from "node:assert/strict";
import { conseilDeplacement, DUREE_FENETRE_CONFORTABLE, ECHEANCE_PLANIFICATION } from "./deplacement.js";
import { coutAllerRetour } from "./config.js";

const TRAJET = { distanceAllerKm: 113, dureeAllerMin: 90, consoL100: 6 };
const BON = { verdict: "vert", duree: 4, confiance: "haute", echeanceJours: 0, trajet: TRAJET, prixLitre: 2.5 };

test("Le coût d'un aller-retour raté est calculé sur le trajet réel", () => {
  const c = coutAllerRetour(TRAJET, 2.5);
  assert.equal(c.km, TRAJET.distanceAllerKm * 2);
  assert.equal(c.minutes, TRAJET.dureeAllerMin * 2);
  assert.equal(c.euros, 34);
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
  // Une prévision à J+4 ne justifie pas d'engager le trajet : elle bougera.
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
  assert.match(c.detail, /34\s*€ et 3 h de route/);
});

test("Sans trajet saisi : même conseil, aucun coût, aucun chiffre inventé", () => {
  const sans = { ...BON, trajet: null };
  assert.equal(conseilDeplacement(sans).cout, null);
  for (const p of [{}, { verdict: "orange" }, { echeanceJours: 2 }, { echeanceJours: 2, duree: 2 }, { echeanceJours: 5 }, { verdict: "rouge" }]) {
    const avec = conseilDeplacement({ ...BON, ...p });
    const c = conseilDeplacement({ ...sans, ...p });
    assert.equal(c.niveau, avec.niveau);
    assert.equal(c.titre, avec.titre);
    assert.doesNotMatch(c.detail, /€|\d+ km|h de route/);
  }
});

test("Trajet partiel : seuls les éléments connus sont chiffrés", () => {
  // Distance seule : ni durée ni montant.
  assert.deepEqual(coutAllerRetour({ distanceAllerKm: 40 }, 2.5), { km: 80, minutes: null, prixLitre: 2.5, euros: null });
  // Pas de prix officiel du jour : pas de montant, jamais de prix supposé.
  assert.equal(coutAllerRetour(TRAJET, null).euros, null);
  for (const invalide of [null, undefined, {}, { distanceAllerKm: 0 }, { distanceAllerKm: -3 }, { distanceAllerKm: "113" }, { distanceAllerKm: NaN }]) {
    assert.equal(coutAllerRetour(invalide, 2.5), null, JSON.stringify(invalide));
  }
  const c = conseilDeplacement({ ...BON, verdict: "orange", trajet: { distanceAllerKm: 40 } });
  assert.match(c.detail, /80 km/);
});
