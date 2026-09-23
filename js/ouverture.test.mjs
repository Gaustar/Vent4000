import { test } from "node:test";
import assert from "node:assert/strict";
import { paques, feriesBelges, estFerie, dansSaison, statutOuverture, changementHeureOctobre, journeeContinue } from "./ouverture.js";

test("Pâques 2026 tombe le 5 avril (vérifié via référence liturgique)", () => {
  const p = paques(2026);
  assert.equal(p.getMonth(), 3); // avril = index 3
  assert.equal(p.getDate(), 5);
});

test("Pâques 2024 tombe le 31 mars", () => {
  const p = paques(2024);
  assert.equal(p.getMonth(), 2);
  assert.equal(p.getDate(), 31);
});

test("Lundi de Pâques 2026 (6 avril) est bien férié", () => {
  assert.equal(estFerie(new Date(2026, 3, 6)), true);
});

test("Fête nationale belge (21 juillet) toujours fériée", () => {
  assert.equal(estFerie(new Date(2026, 6, 21)), true);
  assert.equal(estFerie(new Date(2027, 6, 21)), true);
});

test("dansSaison : 1er mars inclus, 15 décembre inclus, 16 décembre exclu", () => {
  assert.equal(dansSaison(new Date(2026, 2, 1)), true);
  assert.equal(dansSaison(new Date(2026, 1, 28)), false);
  assert.equal(dansSaison(new Date(2026, 11, 15)), true);
  assert.equal(dansSaison(new Date(2026, 11, 16)), false);
});

test("Un samedi en pleine saison : 2 créneaux, premier saut à 9h, split 14h, fin au coucher", () => {
  // Samedi 2026-08-22 (vérifié : samedi)
  const d = new Date(2026, 7, 22);
  assert.equal(d.getDay(), 6);
  const o = statutOuverture(d);
  assert.equal(o.type, "weekend");
  assert.equal(o.creneaux.length, 2);
  // 9h et non 8h30 : le club ouvre à 8h30 (inscription) mais « les séances
  // de saut au PCN débutent à 9h00 » (FAQ paraclubnamur.be). Scorer 8h-9h
  // proposait une fenêtre pendant laquelle personne ne saute.
  assert.equal(o.creneaux[0].debut, 9);
  assert.equal(o.creneaux[0].fin, 14);
  assert.equal(o.creneaux[1].fin, null); // coucher du soleil
});

test("Après le changement d'heure de fin octobre : journée continue, un seul créneau", () => {
  // « À partir de fin octobre (avec le changement d'heure), les journées
  // sont continues, de 8h30 jusqu'au coucher du soleil. »
  // (paraclubnamur.be, page formation AFF)
  const avant = new Date(2026, 9, 24);  // samedi 24 octobre 2026
  const apres = new Date(2026, 10, 7);  // samedi 7 novembre 2026
  assert.equal(avant.getDay(), 6);
  assert.equal(apres.getDay(), 6);
  assert.equal(statutOuverture(avant).creneaux.length, 2, "pleine saison = 2 créneaux");
  const o = statutOuverture(apres);
  assert.equal(o.creneaux.length, 1, "fin de saison = journée continue");
  assert.equal(o.creneaux[0].debut, 9);
  assert.equal(o.creneaux[0].fin, null);
});

test("changementHeureOctobre tombe bien sur le dernier dimanche d'octobre", () => {
  for (const annee of [2025, 2026, 2027, 2028]) {
    const d = changementHeureOctobre(annee);
    assert.equal(d.getDay(), 0, `${annee} : devrait être un dimanche`);
    assert.equal(d.getMonth(), 9, `${annee} : devrait être en octobre`);
    // Dernier dimanche : ajouter 7 jours sortirait du mois d'octobre.
    const suivant = new Date(d);
    suivant.setDate(d.getDate() + 7);
    assert.notEqual(suivant.getMonth(), 9, `${annee} : il reste un dimanche après`);
  }
});

test("Un mardi ordinaire en saison est fermé", () => {
  const d = new Date(2026, 7, 25); // mardi
  assert.equal(d.getDay(), 2);
  assert.equal(statutOuverture(d), null);
});

test("Un vendredi de juin est ouvert dès 16h", () => {
  const d = new Date(2026, 5, 5); // vendredi 5 juin 2026
  assert.equal(d.getDay(), 5);
  const o = statutOuverture(d);
  assert.equal(o.type, "vendredi");
  assert.equal(o.creneaux[0].debut, 16);
});

test("Un vendredi hors saison (janvier) est fermé", () => {
  const d = new Date(2026, 0, 9); // vendredi
  assert.equal(statutOuverture(d), null);
});

test("feriesBelges retourne 10 jours fériés fixes/mobiles", () => {
  assert.equal(feriesBelges(2026).length, 10);
});

test("Un jour férié en semaine ouvre comme un week-end (matin + après-midi)", () => {
  const d = new Date(2026, 6, 21); // mardi 21 juillet 2026 = Fête nationale
  assert.equal(d.getDay(), 2);
  const o = statutOuverture(d);
  assert.equal(o.type, "ferie");
  assert.equal(o.creneaux.length, 2);
});

test("Un vendredi hors fenêtre mai-septembre (avril) est fermé même en saison", () => {
  const d = new Date(2026, 3, 3); // vendredi 3 avril 2026, en saison mais avant mai
  assert.equal(d.getDay(), 5);
  assert.equal(statutOuverture(d), null);
});

test("Un vendredi hors fenêtre mai-septembre (octobre) est fermé même en saison", () => {
  const d = new Date(2026, 9, 2); // vendredi 2 octobre 2026
  assert.equal(d.getDay(), 5);
  assert.equal(statutOuverture(d), null);
});

test("Pâques 2027 tombe le 28 mars (vérification croisée sur une 3e année)", () => {
  const p = paques(2027);
  assert.equal(p.getMonth(), 2);
  assert.equal(p.getDate(), 28);
});
