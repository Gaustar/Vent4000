import { test } from "node:test";
import assert from "node:assert/strict";
import { lirePrix, prixDiesel, PRODUIT_DIESEL } from "./carburant.js";
import { coutAllerRetour, TRAJET } from "./config.js";

// Extrait réel de la réponse Statbel (be.STAT, vue « Tarif officiel des
// produits pétroliers »), relevé le 2026-09-23. Structure conservée telle
// quelle, y compris les flottants bruités que renvoie l'API.
const REPONSE = {
  facts: [
    { "Groupe de produits": "Essences", Produit: "Essence 95 RON E5 (€/L)", Jour: "23SEP26", "Prix TVA incl.": 2.1050000000000075 },
    { "Groupe de produits": "Gasoil Diesel routier", Produit: "Diesel B7 (€/L)", Jour: "23SEP26", "Prix TVA incl.": 2.5010000000000088 },
    { "Groupe de produits": "Gasoil Diesel routier", Produit: "Diesel B10 (€/L)", Jour: "23SEP26", "Prix TVA incl.": 2.4930000000000088 },
    { "Groupe de produits": "Fuel Oil", Produit: "Fuel oil extra lourd 1% S (en camion citerne) (€/T)", Jour: "23SEP26", "Prix TVA incl.": null },
  ],
};

function repOk(json) {
  return async () => ({ ok: true, status: 200, json: async () => json });
}

test("lirePrix extrait le Diesel B7 TTC et arrondit le bruit de l'API", () => {
  const lu = lirePrix(REPONSE);
  assert.equal(lu.prix, 2.501);
  assert.equal(lu.jour, "23SEP26");
});

test("lirePrix ignore les autres produits", () => {
  // Le jeu de données contient essences, mazout, propane, LPG… Se tromper
  // de ligne donnerait un coût de trajet faux du simple au triple.
  assert.equal(lirePrix(REPONSE, "Essence 95 RON E5 (€/L)").prix, 2.105);
});

test("lirePrix rend null sur un produit absent, un prix nul ou une réponse cassée", () => {
  assert.equal(lirePrix(REPONSE, "Produit inexistant"), null);
  assert.equal(lirePrix(REPONSE, "Fuel oil extra lourd 1% S (en camion citerne) (€/T)"), null);
  assert.equal(lirePrix({ facts: "pas un tableau" }), null);
  assert.equal(lirePrix(null), null);
  assert.equal(lirePrix({}), null);
});

test("prixDiesel renvoie le prix officiel quand l'API répond", async () => {
  const r = await prixDiesel(repOk(REPONSE));
  assert.equal(r.prix, 2.501);
  assert.equal(r.source, "statbel");
});

test("prixDiesel ne jette jamais : réseau HS, HTTP en erreur ou JSON invalide", async () => {
  // Sans localStorage (Node), le repli cache est indisponible : on doit
  // obtenir null proprement, pas une exception qui casserait le chargement.
  const cas = [
    async () => { throw new Error("réseau"); },
    async () => ({ ok: false, status: 503, json: async () => ({}) }),
    async () => ({ ok: true, status: 200, json: async () => { throw new Error("JSON"); } }),
    repOk({ facts: [] }),
  ];
  for (const f of cas) {
    assert.equal(await prixDiesel(f), null);
  }
});

test("coutAllerRetour utilise le prix du jour, et retombe sur le repli sinon", () => {
  const avecPrix = coutAllerRetour(2.501);
  const km = TRAJET.distanceAllerKm * 2;
  assert.equal(avecPrix.prixLitre, 2.501);
  assert.equal(avecPrix.euros, Math.round(km * (TRAJET.consoL100 / 100) * 2.501));

  for (const invalide of [null, undefined, 0, -1, "2.5", NaN]) {
    assert.equal(coutAllerRetour(invalide).prixLitre, TRAJET.prixCarburantDefaut, String(invalide));
  }
});

test("Un prix plus élevé renchérit bien le trajet", () => {
  // Garde-fou basique contre une inversion de formule : le diesel a pris
  // plus de 40 % en un an, l'app doit suivre dans le bon sens.
  assert.ok(coutAllerRetour(3.0).euros > coutAllerRetour(2.0).euros);
});

test("Le produit visé est bien le diesel routier", () => {
  assert.equal(PRODUIT_DIESEL, "Diesel B7 (€/L)");
});
