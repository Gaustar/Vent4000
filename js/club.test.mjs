import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lirePageClub, planningClub, heureClub } from "./club.js";

const PAGE = readFileSync(new URL("./fixtures/club-meteo-2026-10-25.html", import.meta.url), "utf8");
const LU = new Date("2026-10-25T09:58:00Z");

test("lirePageClub : page réelle du 2026-10-25 (club fermé)", () => {
  const c = lirePageClub(PAGE, LU);
  assert.equal(c.maj, "vendredi 23 octobre 2026 à 11h16");
  assert.equal(c.etat.libelle, "Fermé");
  assert.equal(c.etat.ton, "gris");
  assert.deepEqual(c.etat.message, ["Nous sommes fermés pour le moment. Vérifiez ci-dessous l’heure et le jour du prochain point météo."]);
  assert.deepEqual(c.jours.map((j) => j.date), ["2026-10-31", "2026-11-01", "2026-11-07", "2026-11-08", "2026-11-11"]);
  assert.deepEqual(c.jours[0], { date: "2026-10-31", jour: "Samedi", pointMeteo: null, start: "8h30", note: null });
  assert.equal(c.jours[4].jour, "Mercredi");
});

test("lirePageClub : variante synthétique (point météo renseigné, autre état, année suivante)", () => {
  const page = PAGE
    .replace(/bg-gray-700/g, "bg-green-600")
    .replace(/(<i class="fas fa-moon[^>]*><\/i>\s*)Fermé/, "$1Ouvert")
    .replace(/(31 octobre[\s\S]*?<td[^>]*>\s*)–/, "$17h30");
  const c = lirePageClub(page, LU);
  assert.equal(c.etat.libelle, "Ouvert");
  assert.equal(c.etat.ton, "vert");
  assert.equal(c.jours[0].pointMeteo, "7h30");
  // Lu en décembre, « 1 novembre » désigne l'année suivante.
  assert.equal(lirePageClub(PAGE, new Date("2026-12-10T10:00:00Z")).jours[1].date, "2027-11-01");
});

test("lirePageClub : page sans la structure attendue → null", () => {
  assert.equal(lirePageClub("<html><body>Maintenance</body></html>"), null);
  assert.equal(lirePageClub(undefined), null);
});

test("planningClub : ouvert / fermé / hors planning, jamais fermé par absence le jour même", () => {
  const club = { ...lirePageClub(PAGE, LU), recu: LU.toISOString() };
  assert.equal(planningClub("2026-10-31", club), "ouvert");
  assert.equal(planningClub("2026-11-11", club), "ouvert");
  assert.equal(planningClub("2026-10-25", club), null);      // jour de lecture
  assert.equal(planningClub("2026-11-14", club), null);      // au-delà du dernier jour listé
  assert.equal(planningClub("2026-11-02", club), "ferme");   // couvert, absent
  assert.equal(planningClub("2026-11-02", null), null);
  assert.equal(planningClub("2026-11-02", { ...club, jours: [] }), null);
});

test("heureClub", () => {
  assert.equal(heureClub("8h30"), 8.5);
  assert.equal(heureClub("16h"), 16);
  assert.equal(heureClub("16h00"), 16);
  assert.equal(heureClub("–"), null);
  assert.equal(heureClub(null), null);
});
