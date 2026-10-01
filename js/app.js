// ============================================================
// Vent4000 — Application (UI) v2.0
// ============================================================

import { DZ, NIVEAUX_AGL, NIVEAUX_PRATIQUE, VOL, LIENS, VERSION, LEGAL_BE, METAR, MODELES, ENSEMBLES } from "./config.js";
import { statutOuverture } from "./ouverture.js";
import { scoreHeure, fenetreSautable, meilleurVerdict, ventPiste } from "./scoring.js";
import { confianceProba } from "./probabilite.js";
import { separationGroupes } from "./facteurs.js";
import { estimerSpot } from "./spot.js";
import { ageMetar } from "./metar.js";
import { comparerPrevisions, doitRemplacerInstantane } from "./tendance.js";
import { conseilDeplacement } from "./deplacement.js";
import { prixDiesel } from "./carburant.js";
import { chargerMeteo, chargerMetar } from "./meteo.js";

// ------------------------------------------------------------
// État & réglages
// ------------------------------------------------------------
const CLE_REGLAGES = "vent4000.reglages";
const CLE_INSTANTANES = "vent4000.instantanes";

const etat = {
  meteo: null,
  jourSelectionne: null,
  heureSelectionnee: null,
  reglages: chargerReglages(),
  instantanes: chargerInstantanes(),
  carburant: null,
};

function chargerReglages() {
  const defauts = { niveau: "tandem", ventMax: null, plafondMin: null };
  try {
    return { ...defauts, ...JSON.parse(localStorage.getItem(CLE_REGLAGES) || "{}") };
  } catch {
    return defauts;
  }
}

function sauverReglages() {
  try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(etat.reglages)); } catch { /* mode privé */ }
}

function chargerInstantanes() {
  try {
    return JSON.parse(localStorage.getItem(CLE_INSTANTANES) || "{}");
  } catch {
    return {};
  }
}

function sauverInstantanes() {
  try { localStorage.setItem(CLE_INSTANTANES, JSON.stringify(etat.instantanes)); } catch { /* mode privé */ }
}

/**
 * Seuils effectifs = préréglage du niveau + overrides, bornés au droit
 * belge. Le bornage est refait ici (et pas seulement à la saisie) parce
 * qu'un réglage enregistré par une ancienne version peut encore traîner
 * dans le localStorage.
 */
function seuilsActifs() {
  const base = NIVEAUX_PRATIQUE[etat.reglages.niveau] ?? NIVEAUX_PRATIQUE.tandem;
  return {
    label: base.label,
    ventMax: Math.min(etat.reglages.ventMax ?? base.ventMax, LEGAL_BE.ventMoyenMaxSol),
    plafondMin: Math.max(etat.reglages.plafondMin ?? base.plafondMin, LEGAL_BE.plafondMinAGL),
    ecartRafalesOrange: base.ecartRafalesOrange,
    hauteurOuverture: base.hauteurOuverture,
    eleve: !!base.eleve,
  };
}

// ------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const r = Math.round;

const JOURS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const JOURS_COURT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const MOIS_FR = ["janv.", "févr.", "mars", "avril", "mai", "juin",
                 "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const VERDICT_TEXTE = { vert: "Ça saute", orange: "Ça passe juste", rouge: "Ça ne saute pas" };
// Forme redondante avec la couleur (daltonisme rouge-vert, ~8 % des hommes).
const VERDICT_SYMBOLE = { vert: "●", orange: "▲", rouge: "✕" };

function echapper(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function dateLocale(isoDate) {
  const [a, m, j] = isoDate.split("-").map(Number);
  return new Date(a, m - 1, j);
}

function heureDe(iso) {
  return iso ? iso.slice(11, 16).replace(":", "h") : "—";
}

function heureDecimale(iso) {
  return parseInt(iso.slice(11, 13), 10) + parseInt(iso.slice(14, 16), 10) / 60;
}

// Les prévisions sont ancrées sur Europe/Brussels : « maintenant » est
// calculé dans ce fuseau, quel que soit celui de l'appareil.
const FMT_BRUXELLES = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function partsBruxelles(date = new Date()) {
  return Object.fromEntries(FMT_BRUXELLES.formatToParts(date).map((x) => [x.type, x.value]));
}
function heureCourante() {
  const p = partsBruxelles();
  return parseInt(p.hour, 10) + parseInt(p.minute, 10) / 60;
}
function todayIso() {
  const p = partsBruxelles();
  return `${p.year}-${p.month}-${p.day}`;
}
function heureBruxelles(date) {
  return date.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });
}

const CARDINAUX = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
function cardinal(deg) {
  if (deg == null) return "—";
  return CARDINAUX[Math.round(deg / 22.5) % 16];
}

/**
 * Rotation du glyphe « ➤ » (qui pointe vers l'EST à 0°) pour qu'il montre
 * où VA le vent : direction météo + 180° − 90°.
 */
function rotationFleche(direction) {
  return (direction ?? 0) + 90;
}

function texteFenetre(f) {
  if (!f || f.debut == null) return null;
  return `${f.debut}h → ${f.fin}h`;
}

function formatDistance(m) {
  if (m === Infinity) return "∞";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${r(m)} m`;
}

function pct(p) {
  return p == null ? "—" : `${r(p * 100)}`;
}

function classeProba(p) {
  if (p == null) return "c-na";
  if (p >= 0.7) return "c-ok";
  if (p >= 0.35) return "c-limite";
  return "c-bloquant";
}

function moyenne(valeurs) {
  const v = valeurs.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function statCell(label, valeur, unite = "") {
  return `<div class="stat">
    <span class="stat-label">${label}</span>
    <span class="stat-valeur">${valeur}${unite ? `<small>${unite}</small>` : ""}</span>
  </div>`;
}

// ------------------------------------------------------------
// Calcul des jours d'ouverture scorés
// ------------------------------------------------------------
let memoJours = { cle: null, valeur: null };

function joursOuvertsScores() {
  const seuils = seuilsActifs();
  const cle = [etat.meteo?.recupereLe, etat.meteo?.metar?.brut, seuils.label, seuils.ventMax, seuils.plafondMin,
               seuils.hauteurOuverture, todayIso(), Math.floor(heureCourante())].join("|");
  if (memoJours.cle === cle) return memoJours.valeur;
  const valeur = calculerJoursOuverts(seuils);
  memoJours = { cle, valeur };
  return valeur;
}

function calculerJoursOuverts(seuils) {
  const resultat = [];
  const maintenant = heureCourante();
  const heureNow = Math.floor(maintenant);
  const aujourdhui = todayIso();
  const metar = etat.meteo.metar;

  etat.meteo.jours.forEach((jour, index) => {
    const date = dateLocale(jour.date);
    const ouverture = statutOuverture(date);
    if (!ouverture) return;

    const estAujourdhui = jour.date === aujourdhui;
    const coucher = heureDecimale(jour.sunset);
    const ventParHeure = new Map(jour.heures.map((h) => [h.heure, h.vent10]));

    let creneaux = ouverture.creneaux.map((c) => {
      const fin = c.fin ?? coucher;
      const heures = jour.heures
        .filter((h) => h.heure + 1 > c.debut && h.heure < fin)
        .filter((h) => !estAujourdhui || h.heure >= heureNow)
        .map((h) => {
          // L'observation de Charleroi est confiée à l'heure en cours et aux
          // deux suivantes (persistance), avec son décalage.
          const decalage = estAujourdhui ? h.heure - heureNow : null;
          const avecObs = metar && decalage != null && decalage <= 2;
          const enrichie = {
            ...h,
            ventPrecedent: ventParHeure.get(h.heure - 1),
            ...(avecObs ? { metar, metarDecalage: decalage } : {}),
          };
          return { h, score: scoreHeure(enrichie, seuils, { echeanceJours: index }) };
        });
      return {
        ...c,
        heures,
        fenetre: fenetreSautable(heures.map((x) => ({ heure: x.h.heure, verdict: x.score.verdict }))),
      };
    });
    creneaux = creneaux.map((c) => ({ ...c, verdict: c.fenetre.verdict }));

    if (estAujourdhui) creneaux = creneaux.filter((c) => c.heures.length > 0);
    if (estAujourdhui && creneaux.length === 0) return;

    const verdictJour = meilleurVerdict(creneaux.map((c) => c.verdict));
    const toutes = creneaux.flatMap((c) => c.heures);
    const meilleureFenetre = creneaux
      .filter((c) => c.verdict === verdictJour)
      .map((c) => c.fenetre)
      .sort((a, b) => (b.duree ?? 0) - (a.duree ?? 0))[0] ?? null;
    const heuresFenetre = meilleureFenetre?.debut != null
      ? toutes.filter((x) => x.h.heure >= meilleureFenetre.debut && x.h.heure < meilleureFenetre.fin)
      : [];
    // Probabilité du jour = moyenne sur la meilleure fenêtre ; sans fenêtre,
    // la meilleure heure (pour montrer « à quel point » c'est raté).
    const chance = heuresFenetre.length
      ? moyenne(heuresFenetre.map((x) => x.score.chance))
      : (toutes.length ? Math.max(...toutes.map((x) => x.score.chance ?? 0)) : null);
    const pFenetre = moyenne(heuresFenetre.map((x) => x.score.proba?.p ?? null));

    resultat.push({
      index,
      date,
      dateIso: jour.date,
      ouverture,
      creneaux,
      verdictJour,
      meilleureFenetre,
      chance,
      confiance: pFenetre == null ? "unique" : confianceProba({ p: pFenetre }),
      motif: motifDominant(toutes, verdictJour),
      tendance: tendanceDuJour(jour.date, verdictJour, toutes),
      lointain: index >= 5,
      sunset: jour.sunset,
      heures: toutes,
    });
  });

  return resultat;
}

/**
 * Regroupe les raisons horaires (qui contiennent des chiffres) en motifs
 * stables, affichables au niveau du jour.
 */
const MOTIFS = [
  [/hors limite légale/,       "Hors limite légale (vent)"],
  [/Plafond .*légal/,          "Plafond sous le minimum légal"],
  [/Visibilité .*légal/,       "Visibilité sous le minimum légal"],
  [/^Probabilité de saut .*rafales/, "Rafales probables"],
  [/^Probabilité de saut .*vent/,    "Vent probable"],
  [/^Probabilité de saut .*pluie/,   "Pluie probable"],
  [/^Probabilité de saut .*couche/,  "Couche basse probable"],
  [/^Probabilité de saut/,     "Modèles partagés"],
  [/^Charleroi|observ/,        "Observation défavorable"],
  [/^Rafales .*seuil/,         "Rafales au-dessus du seuil"],
  [/^Rafales \+/,              "Rafales marquées"],
  [/^Vent \d.*largage/,        "Vent fort au largage"],
  [/^Vent \d.*ouverture/,      "Vent fort à l'ouverture"],
  [/^Vent \d/,                 "Vent trop fort"],
  [/^Vent proche/,             "Vent proche du seuil"],
  [/^Vent en hausse/,          "Vent en hausse rapide"],
  [/^Gradient/,                "Gradient de vent en finale"],
  [/^Couche à .*largage limité/, "Largage limité par une couche"],
  [/^Plafond/,                 "Plafond trop bas"],
  [/^Brouillard|brouillard/,   "Brouillard"],
  [/^Visibilité/,              "Visibilité réduite"],
  [/^Risque de pluie/,         "Risque de pluie"],
  [/^Bruine|^Pluie|^Averses|^Neige/, "Précipitations"],
  [/^Orage|éclairs|électrique/, "Risque orageux"],
  [/^Risque orageux/,          "Risque orageux"],
  [/^Instabilité/,             "Instabilité (CAPE)"],
  [/^Givrage/,                 "Givrage possible"],
  [/^Froid/,                   "Froid au largage"],
  [/^Air thermique/,           "Thermiques"],
];

function motifRaison(raison) {
  return MOTIFS.find(([re]) => re.test(raison))?.[1] ?? raison;
}

function motifDominant(heuresScorees, verdict) {
  if (verdict === "vert") return null;
  const compte = new Map();
  for (const { score } of heuresScorees) {
    if (score.verdict !== verdict) continue;
    for (const raison of score.raisons) {
      const motif = motifRaison(raison);
      compte.set(motif, (compte.get(motif) ?? 0) + 1);
    }
  }
  if (!compte.size) return null;
  return [...compte.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function tendanceDuJour(dateIso, verdict, heuresScorees) {
  const vents = heuresScorees.map((x) => x.h.vent10).filter((v) => v != null);
  if (!vents.length) return null;
  const vent = r(vents.reduce((a, b) => a + b, 0) / vents.length);
  return comparerPrevisions({ verdict, vent }, etat.instantanes[dateIso]);
}

function majInstantanes(jours) {
  let modifie = false;
  for (const j of jours) {
    const vents = j.heures.map((x) => x.h.vent10).filter((v) => v != null);
    if (!vents.length) continue;
    if (!doitRemplacerInstantane(etat.instantanes[j.dateIso])) continue;
    etat.instantanes[j.dateIso] = {
      verdict: j.verdictJour,
      vent: r(vents.reduce((a, b) => a + b, 0) / vents.length),
      ts: Date.now(),
    };
    modifie = true;
  }
  const aujourdhui = todayIso();
  for (const date of Object.keys(etat.instantanes)) {
    if (date < aujourdhui) { delete etat.instantanes[date]; modifie = true; }
  }
  if (modifie) sauverInstantanes();
}

// ------------------------------------------------------------
// Observation METAR
// ------------------------------------------------------------
function rendreObservation(el) {
  const m = etat.meteo?.metar;
  if (!el) return;
  const age = m ? ageMetar(m) : Infinity;
  if (!m || age > 180) { el.hidden = true; return; }
  const seuils = seuilsActifs();
  const vent = m.variable && m.dir == null ? `VRB ${m.vent}` : `${String(m.dir ?? 0).padStart(3, "0")}° ${m.vent}`;
  const rafale = m.rafales ? ` G${m.rafales}` : "";
  const nuages = m.cavok ? "CAVOK"
    : m.nuages.length ? m.nuages.map((n) => `${n.couverture} ${formatDistance(n.baseM)}`).join(" · ") : "pas de nuage significatif";
  const alerteVent = (m.rafales ?? m.vent ?? 0) > seuils.ventMax;
  const alertePlafond = m.plafond < seuils.plafondMin;
  const alerteVis = m.visibilite != null && m.visibilite < LEGAL_BE.visibiliteMin;
  const perime = age > METAR.ageMaxMin;
  el.hidden = false;
  el.innerHTML = `
    <div class="obs-haut">
      <span class="obs-titre"><span class="obs-point${perime ? " perime" : ""}"></span>Observé à ${METAR.nom} · ${heureBruxelles(m.obs)}</span>
      <span class="obs-age">il y a ${r(age)} min</span>
    </div>
    <div class="obs-valeurs">
      <span class="${alerteVent ? "obs-alerte" : ""}"><b>${vent}${rafale}</b> km/h</span>
      <span class="${alertePlafond ? "obs-alerte" : ""}">${echapper(nuages)}</span>
      <span class="${alerteVis ? "obs-alerte" : ""}">vis. ${m.visibilite != null ? formatDistance(m.visibilite) : "—"}</span>
      ${m.temp != null ? `<span>${m.temp}°C</span>` : ""}
      ${m.temps.length ? `<span class="obs-alerte">${echapper(m.temps.join(" "))}</span>` : ""}
    </div>
    <details class="obs-brut"><summary>METAR brut</summary><code>${echapper(m.brut)}</code></details>`;
}

// ------------------------------------------------------------
// Vue Semaine
// ------------------------------------------------------------
function rendreSemaine() {
  const jours = joursOuvertsScores();
  $("#niveau-actif").textContent = seuilsActifs().label;
  rendreObservation($("#obs"));

  const conteneur = $("#jours");
  conteneur.innerHTML = "";
  if (jours.length === 0) {
    conteneur.innerHTML = `
      <div class="vide">
        <strong>Aucun jour d'ouverture</strong> dans les 7 prochains jours.
        Le club ouvre les week-ends et jours fériés de mars à mi-décembre,
        plus les vendredis dès 16h de mai à septembre.
      </div>`;
  }

  for (const j of jours) {
    const carte = document.createElement("button");
    carte.className = `carte-jour ${j.verdictJour}${j.lointain ? " lointain" : ""}`;
    const fenetre = texteFenetre(j.meilleureFenetre);
    const bande = j.heures.map(({ h, score }) => {
      const hauteur = score.chance == null ? 100 : Math.max(12, r(score.chance * 100));
      return `<span class="bande-h ${score.verdict}" title="${h.heure}h · ${VERDICT_TEXTE[score.verdict]}">
        <i style="height:${hauteur}%"></i><em>${h.heure % 2 === 0 ? h.heure : ""}</em></span>`;
    }).join("");

    carte.innerHTML = `
      <span class="cj-haut">
        <span class="cj-quand">
          <span class="cj-nom">${JOURS_FR[j.date.getDay()]}</span>
          <span class="cj-date">${j.date.getDate()} ${MOIS_FR[j.date.getMonth()]}</span>
          ${j.ouverture.type === "ferie" ? `<span class="etiq-jour">Férié</span>` : ""}
          ${j.lointain ? `<span class="etiq-jour">Indicatif</span>` : ""}
          ${rendreTendance(j.tendance)}
        </span>
        <span class="cj-proba ${classeProba(j.chance)}">${pct(j.chance)}<small>%</small></span>
      </span>
      <span class="cj-verdict">
        <span class="cj-symbole" aria-hidden="true">${VERDICT_SYMBOLE[j.verdictJour]}</span>
        <strong>${VERDICT_TEXTE[j.verdictJour]}</strong>
        <span class="cj-fenetre">${fenetre ?? "aucune fenêtre de 2 h"}</span>
      </span>
      ${j.motif ? `<span class="cj-motif">${echapper(j.motif)}</span>` : ""}
      <span class="bande" aria-hidden="true">${bande}</span>`;
    carte.setAttribute("aria-label",
      `${JOURS_FR[j.date.getDay()]} ${j.date.getDate()} — ${VERDICT_TEXTE[j.verdictJour]}` +
      `${fenetre ? `, ${fenetre}` : ""}${j.chance != null ? `, probabilité ${pct(j.chance)} %` : ""}`);
    carte.addEventListener("click", () => ouvrirJour(j.index));
    conteneur.appendChild(carte);
  }

  majInstantanes(jours);
}

function rendreTendance(t) {
  if (!t || t.sens === "stable") return "";
  const fleche = t.sens === "amelioration" ? "↗" : "↘";
  const mot = t.sens === "amelioration" ? "s'améliore" : "se dégrade";
  return `<span class="tendance ${t.sens}" title="Depuis ${t.depuisH} h (${t.deltaVent > 0 ? "+" : ""}${t.deltaVent} km/h)">${fleche} ${mot}</span>`;
}

// ------------------------------------------------------------
// Vue Jour
// ------------------------------------------------------------
function ouvrirJour(index) {
  etat.jourSelectionne = index;
  etat.heureSelectionnee = null;
  rendreJour();
  basculerVue("jour");
}

function rendreDeplacement(el, params) {
  const c = conseilDeplacement({ ...params, prixLitre: etat.carburant?.prix ?? null });
  const heures = r(c.cout.minutes / 60);
  const origine = etat.carburant?.source === "statbel" ? "prix officiel du jour"
    : etat.carburant?.source === "cache" ? "dernier prix connu"
    : "prix de repli";
  el.className = `deplacement dep-${c.niveau}`;
  el.hidden = false;
  el.innerHTML = `
    <div class="dep-haut">
      <strong class="dep-titre">${c.titre}</strong>
      <span class="dep-cout" title="Diesel B7 à ${c.cout.prixLitre.toFixed(3)} €/L — ${origine}">${c.cout.km} km · ${heures} h · ~${c.cout.euros} €</span>
    </div>
    <p class="dep-detail">${c.detail}</p>`;
}

/**
 * Sur une journée limite, le club peut poser une BARRIÈRE D'EXPÉRIENCE
 * (nombre de sauts minimum) que l'app ne peut pas prévoir.
 */
function afficherAvertissementExperience(el, verdict) {
  const concerne = verdict === "orange";
  el.hidden = !concerne;
  if (concerne) {
    el.innerHTML = `Journée limite : le club peut imposer un <strong>nombre de sauts minimum</strong>
      pour débuter (barrière d'expérience, pas un seuil de vent).
      <a href="${LIENS.briefing}" target="_blank" rel="noopener">Vérifier le briefing du club</a>.`;
  }
}

function rendreJour() {
  const seuils = seuilsActifs();
  const jour = etat.meteo.jours[etat.jourSelectionne];
  const info = joursOuvertsScores().find((j) => j.index === etat.jourSelectionne);
  if (!jour || !info) return basculerVue("semaine");
  const estAujourdhui = jour.date === todayIso();

  $("#jour-titre").textContent =
    `${JOURS_FR[info.date.getDay()]} ${info.date.getDate()} ${MOIS_FR[info.date.getMonth()]}`;
  $("#jour-soustitre").textContent =
    `${info.ouverture.type === "vendredi" ? "Ouverture dès 16h" : "Ouvert dès 8h30, premiers sauts 9h"} → coucher ${heureDe(jour.sunset)} · J+${info.index}`;

  // Verdict du jour
  $("#jour-verdict").className = `hero ${info.verdictJour}`;
  $("#jour-verdict-texte").innerHTML =
    `<span aria-hidden="true">${VERDICT_SYMBOLE[info.verdictJour]}</span> ${VERDICT_TEXTE[info.verdictJour]}`;
  const fenetre = texteFenetre(info.meilleureFenetre);
  $("#jour-verdict-quand").innerHTML = fenetre
    ? `Fenêtre <strong>${fenetre}</strong>${info.motif ? ` · ${echapper(info.motif.toLowerCase())}` : ""}`
    : echapper(info.motif ?? "Aucune fenêtre de 2 h consécutives");
  $("#jour-jauge").innerHTML = info.chance == null ? "" : `
    <span class="jauge-valeur ${classeProba(info.chance)}">${pct(info.chance)}<small>%</small></span>
    <span class="jauge-label">probabilité<br>de saut</span>`;

  $("#jour-creneaux").innerHTML = info.creneaux
    .map((c) => {
      const f = texteFenetre(c.fenetre);
      return `<span class="badge ${c.verdict}">${c.label}${f ? ` · ${f}` : ""}</span>`;
    })
    .join("");

  rendreDeplacement($("#jour-deplacement"), {
    verdict: info.verdictJour,
    duree: info.meilleureFenetre?.duree ?? 0,
    confiance: info.confiance,
    echeanceJours: info.index,
  });
  afficherAvertissementExperience($("#jour-experience"), info.verdictJour);

  if (estAujourdhui) rendreObservation($("#jour-obs"));
  else $("#jour-obs").hidden = true;

  // Heure sélectionnée par défaut : la première de la meilleure fenêtre.
  const toutes = info.heures;
  if (etat.heureSelectionnee === null && toutes.length) {
    const debut = info.meilleureFenetre?.debut;
    etat.heureSelectionnee = debut != null ? debut : toutes[0].h.heure;
  }

  rendreMatrice(toutes, estAujourdhui);
  const sel = toutes.find((x) => x.h.heure === etat.heureSelectionnee) ?? toutes[0];
  if (sel) rendreDetailHeure(sel, seuils, info);
}

// ------------------------------------------------------------
// Tableau horaire
// ------------------------------------------------------------
const LIGNES = [
  { cle: "verdict", label: "Verdict" },
  { cle: "chance", label: "Proba %" },
  { id: "ventSol", label: "Vent" },
  { cle: "direction", label: "Direction" },
  { id: "rafales", label: "Rafales" },
  { id: "cisaillement", label: "Gradient" },
  { id: "ventOuverture", label: "Ouverture" },
  { id: "ventLargage", label: "Largage" },
  { id: "plafond", label: "Plafond" },
  { id: "visibilite", label: "Visibilité" },
  { id: "pluie", label: "Pluie" },
  { id: "orage", label: "CAPE" },
  { id: "froid", label: "T° 4000 m" },
  { id: "givrage", label: "Iso 0 °C" },
];

function rendreMatrice(toutes, estAujourdhui) {
  const table = $("#matrice");
  const heureNow = Math.floor(heureCourante());
  const entete = `<thead><tr><th scope="col" class="m-coin">h</th>${toutes.map(({ h }) => {
    const actif = h.heure === etat.heureSelectionnee;
    const now = estAujourdhui && h.heure === heureNow;
    return `<th scope="col" class="m-h${actif ? " actif" : ""}${now ? " now" : ""}" data-heure="${h.heure}">
      <button type="button" data-heure="${h.heure}" aria-pressed="${actif}">${h.heure}h</button></th>`;
  }).join("")}</tr></thead>`;

  const corps = LIGNES.map((ligne) => {
    const cellules = toutes.map(({ h, score }) => {
      const actif = h.heure === etat.heureSelectionnee ? " actif" : "";
      if (ligne.cle === "verdict") {
        return `<td class="m-v ${score.verdict}${actif}" data-heure="${h.heure}" title="${echapper(score.raisons.join(" · ") || "Conditions favorables")}">${VERDICT_SYMBOLE[score.verdict]}</td>`;
      }
      if (ligne.cle === "chance") {
        return `<td class="${classeProba(score.chance)}${actif}" data-heure="${h.heure}">${pct(score.chance)}</td>`;
      }
      if (ligne.cle === "direction") {
        return `<td class="c-ok${actif}" data-heure="${h.heure}"><span class="m-fleche" style="transform:rotate(${rotationFleche(h.direction10)}deg)">➤</span></td>`;
      }
      const fct = score.facteurs.find((x) => x.id === ligne.id);
      if (!fct) return `<td class="c-na${actif}" data-heure="${h.heure}">—</td>`;
      return `<td class="c-${fct.statut}${actif}" data-heure="${h.heure}"${fct.motif ? ` title="${echapper(fct.motif)}"` : ""}>${echapper(fct.court)}</td>`;
    }).join("");
    return `<tr><th scope="row">${ligne.label}</th>${cellules}</tr>`;
  }).join("");

  table.innerHTML = entete + `<tbody>${corps}</tbody>`;
  table.onclick = (e) => {
    const cible = e.target.closest("[data-heure]");
    if (!cible) return;
    etat.heureSelectionnee = Number(cible.dataset.heure);
    rendreJour();
  };
  const actif = table.querySelector("th.m-h.actif");
  if (actif) {
    const cadre = table.parentElement;
    cadre.scrollLeft = Math.max(0, actif.offsetLeft - cadre.clientWidth / 2 + actif.clientWidth);
  }
}

// ------------------------------------------------------------
// Détail d'une heure
// ------------------------------------------------------------
const ORDRE_STATUT = { bloquant: 0, limite: 1, info: 2, ok: 3 };

function rendreDetailHeure({ h, score }, seuils, info) {
  $("#detail-titre").innerHTML =
    `${h.heure}h → ${h.heure + 1}h <span class="detail-verdict ${score.verdict}">${VERDICT_SYMBOLE[score.verdict]} ${VERDICT_TEXTE[score.verdict]}</span>`;

  const classe = score.verdict === "rouge" ? "bloquant" : "degradant";
  $("#raisons").innerHTML = score.raisons.length
    ? score.raisons.map((x) => `<li class="${classe}">${echapper(x)}</li>`).join("")
    : `<li class="ok">Conditions favorables pour « ${echapper(seuils.label)} »</li>`;

  // Tous les facteurs, du plus grave au plus anodin.
  const facteurs = [...score.facteurs].sort((a, b) => ORDRE_STATUT[a.statut] - ORDRE_STATUT[b.statut]);
  $("#facteurs").innerHTML = facteurs.map((x) => `
    <div class="facteur f-${x.statut}">
      <span class="f-point" aria-hidden="true"></span>
      <span class="f-label">${echapper(x.label)}${x.legal ? ` <em class="f-tag">légal</em>` : ""}${x.arbitre ? ` <em class="f-tag">arbitré</em>` : ""}</span>
      <strong class="f-valeur">${echapper(x.valeur)}</strong>
      ${x.motif ? `<span class="f-motif">${echapper(x.motif)}</span>` : ""}
    </div>`).join("");

  rendreConsensus(score.proba, h);
  rendreProfil(h, score, seuils);
  rendreSpot(h, seuils);
}

function rendreConsensus(proba, h) {
  const el = $("#consensus");
  if (!proba) {
    el.innerHTML = `<p class="note-hypotheses">Comparaison indisponible pour cette heure (modèles et ensembles hors ligne) : le verdict repose sur le seul modèle principal.</p>`;
    return;
  }
  const p = proba.p;
  const confiance = confianceProba(proba);
  const LIB_CONF = { haute: "prévision tranchée", moyenne: "prévision assez nette", faible: "modèles partagés" };
  const crit = [["rafales", "rafales"], ["vent", "vent moyen"], ["pluie", "pluie"], ["nuages", "couche basse"]]
    .filter(([k]) => proba.echecs[k] > 0.005)
    .map(([k, l]) => `<span>${l} <b>${r(proba.echecs[k] * 100)} %</b></span>`).join("");

  const modeles = MODELES.map((m) => {
    const d = proba.modeles.find((x) => x.id === m.id);
    if (!d) return `<li class="mod-absent"><span>${m.nom}</span><em>hors horizon</em></li>`;
    return `<li class="${d.passe ? "mod-oui" : "mod-non"}">
      <span>${m.nom}${m.hr ? ` <em class="f-tag">2 km</em>` : ""}</span>
      <b>${r(d.vent ?? 0)}<small>/</small>${r(d.rafales ?? 0)}</b>
      <i aria-label="${d.passe ? "favorable" : "défavorable"}">${d.passe ? "✓" : "✕"}</i>
    </li>`;
  }).join("");

  const parEns = ENSEMBLES.map((e) => {
    const membres = (h.ensemble ?? []).filter((s) => s.ens === e.id);
    return membres.length ? `${e.nom} ${membres.length}` : null;
  }).filter(Boolean).join(" · ");

  el.innerHTML = `
    <div class="proba-ligne">
      <span class="proba-valeur ${classeProba(p)}">${pct(p)}<small>%</small></span>
      <div class="proba-barre" role="img" aria-label="Probabilité ${pct(p)} %"><span class="${classeProba(p)}" style="width:${r(p * 100)}%"></span></div>
    </div>
    <p class="proba-texte">des votes favorables · <strong>${LIB_CONF[confiance] ?? ""}</strong></p>
    ${crit ? `<p class="proba-crit">Votes défavorables par critère : ${crit}</p>` : ""}
    <ul class="modeles">${modeles}</ul>
    <p class="note-hypotheses">Vent moyen / rafales en km/h. Ensembles : <strong>${proba.ensemble.passe}/${proba.ensemble.total}</strong>
      scénarios favorables${parEns ? ` (${parEns})` : ""}. Leur poids augmente avec l'échéance.</p>`;
}

function rendreProfil(h, score, seuils) {
  const lignes = [];
  for (const n of Object.values(h.niveaux ?? {})) {
    if (n?.agl == null || n.agl < 100) continue;
    lignes.push({ agl: n.agl, vent: n.vent, dir: n.dir, temp: n.temp, nuages: n.nuages });
  }
  for (const m of NIVEAUX_AGL) {
    const n = h.niveauxAGL?.[m];
    if (n?.vent != null) lignes.push({ agl: m, vent: n.vent, dir: n.dir, temp: null, nuages: null });
  }
  lignes.sort((a, b) => b.agl - a.agl);
  lignes.push({ agl: 0, vent: h.vent10, dir: h.direction10, temp: h.t2m, nuages: null, sol: true });

  const plafond = score.nuages?.plafond ?? Infinity;
  const marque = (agl) => {
    const tags = [];
    if (Math.abs(agl - DZ.altitudeLargage) < 400) tags.push("largage");
    if (Math.abs(agl - seuils.hauteurOuverture) < 250) tags.push("ouverture");
    if (h.isoZero != null && Math.abs(agl - h.isoZero) < 250) tags.push("0 °C");
    return tags.join(" · ");
  };

  $("#profil").innerHTML = `
    <div class="profil-entete">
      <span>Alt. AGL</span><span>Nuages</span><span>Vent</span><span>T°</span>
    </div>
    ${lignes.map((l) => `
    <div class="niveau${l.sol ? " sol" : ""}${plafond !== Infinity && l.agl >= plafond && l.nuages >= 60 ? " dans-couche" : ""}">
      <div class="niv-alt"><strong>${l.sol ? "Sol" : `${l.agl} m`}</strong><span>${l.sol ? `raf. ${r(h.rafales10 ?? 0)} km/h` : marque(l.agl)}</span></div>
      <div class="niv-nuages">${l.nuages != null
        ? `<span class="nuage-barre"><i style="width:${l.nuages}%" class="${l.nuages >= 60 ? "couche" : ""}"></i></span><small>${r(l.nuages)}%</small>`
        : `<small class="faible">—</small>`}</div>
      <div class="niv-vent">
        <span class="fleche-icone" style="transform: rotate(${rotationFleche(l.dir)}deg)">➤</span>
        <b>${l.vent != null ? r(l.vent) : "—"}</b><small>${cardinal(l.dir)}</small>
      </div>
      <div class="niv-temp">${l.temp != null ? `${r(l.temp)}°` : "—"}</div>
    </div>`).join("")}
    <p class="note-hypotheses">Plafond analysé : <strong>${plafond === Infinity ? "aucune couche ≥ 60 % sous 4200 m" : `~${formatDistance(plafond)}`}</strong>
      (${score.nuages?.source === "profil" ? "profil vertical" : "estimation T/Td"}) · largage possible jusqu'à
      <strong>${formatDistance(score.nuages?.largagePossible ?? DZ.altitudeLargage)}</strong>
      ${h.isoZero != null ? ` · isotherme 0 °C à ${formatDistance(h.isoZero)}` : ""}.</p>`;
}

function rendreSpot(h, seuils) {
  const spot = estimerSpot(h, seuils.hauteurOuverture, DZ.altitudeLargage);
  const ventHaut = h.niveaux?.[600]?.vent ?? null;
  $("#spot").innerHTML = [
    statCell("Sous voile", formatDistance(spot.voile.distance), cardinal(spot.voile.cap)),
    statCell("En chute", formatDistance(spot.chute.distance), cardinal(spot.chute.cap)),
    statCell("Dérive totale", formatDistance(spot.total.distance), cardinal(spot.total.cap)),
    statCell("Largage", `${String(spot.pointLargage.cap).padStart(3, "0")}° · ${formatDistance(spot.pointLargage.distance)}`, cardinal(spot.pointLargage.cap)),
    statCell("Séparation", `~${separationGroupes(ventHaut)}`, "s"),
  ].join("");
  $("#spot-note").textContent =
    `Estimation : ouverture ${seuils.hauteurOuverture} m, largage ${DZ.altitudeLargage} m, ` +
    `${VOL.tauxChuteVoile} m/s sous voile, ${VOL.vitesseChuteLibre} m/s en chute, sans pilotage. ` +
    `« Largage » = cap et distance à remonter depuis la zone de poser. Séparation : ${VOL.separationGroupes} m ` +
    `entre groupes à ~${VOL.vitesseAvionLargage} km/h de vitesse propre face au vent. Le largueur reste la référence.`;

  rendreBoussole(h.direction10 ?? 0, h.vent10 ?? 0, spot.total.cap);
  const vp = ventPiste(h.vent10 ?? 0, h.direction10 ?? 0);
  $("#crosswind").innerHTML = `
    <div class="ligne"><span>Vent au sol</span><strong>${cardinal(h.direction10)} ${r(h.direction10 ?? 0)}°</strong></div>
    <div class="ligne"><span>Traversier</span><strong>${vp.traversier} km/h</strong></div>
    <div class="ligne"><span>De face</span><strong>${vp.face} km/h</strong></div>
    <span class="note">Axe piste ${String(DZ.qfu).padStart(3, "0")}° / ${DZ.qfu + 180}°. Indicatif : sous voile on pose face à la manche à air.</span>`;
}

/** Boussole : axe de piste, vent au sol (plein) et dérive estimée (pointillé). */
function rendreBoussole(direction, vitesse, capDerive) {
  const versOu = direction + 180;
  $("#boussole").innerHTML = `
    <circle cx="60" cy="60" r="54" class="b-cercle"/>
    <text x="60" y="16" class="b-cardinal">N</text>
    <text x="107" y="64" class="b-cardinal">E</text>
    <text x="60" y="112" class="b-cardinal">S</text>
    <text x="13" y="64" class="b-cardinal">O</text>
    <g transform="rotate(${DZ.qfu} 60 60)">
      <rect x="55" y="14" width="10" height="92" rx="3" class="b-piste"/>
      <line x1="60" y1="20" x2="60" y2="100" class="b-axe"/>
    </g>
    <g transform="rotate(${capDerive} 60 60)">
      <line x1="60" y1="60" x2="60" y2="30" class="b-derive"/>
      <polygon points="60,20 55,32 65,32" class="b-derive-pointe"/>
    </g>
    <g transform="rotate(${versOu} 60 60)">
      <line x1="60" y1="60" x2="60" y2="26" class="b-vent" style="stroke-width:${Math.min(6, 2 + vitesse / 10)}"/>
      <polygon points="60,16 54,28 66,28" class="b-pointe"/>
    </g>
    <circle cx="60" cy="60" r="4" class="b-centre"/>`;
}

// ------------------------------------------------------------
// Réglages
// ------------------------------------------------------------
function rendreReglages() {
  $("#reglage-niveau").innerHTML = Object.entries(NIVEAUX_PRATIQUE)
    .map(([cle, n]) => `<option value="${cle}"${cle === etat.reglages.niveau ? " selected" : ""}>${n.label}</option>`)
    .join("");
  const base = NIVEAUX_PRATIQUE[etat.reglages.niveau] ?? NIVEAUX_PRATIQUE.tandem;
  $("#reglage-vent").value = etat.reglages.ventMax ?? base.ventMax;
  $("#reglage-plafond").value = etat.reglages.plafondMin ?? base.plafondMin;
}

function brancherReglages() {
  $("#reglage-niveau").addEventListener("change", (e) => {
    etat.reglages.niveau = e.target.value;
    etat.reglages.ventMax = null;
    etat.reglages.plafondMin = null;
    sauverReglages();
    rendreReglages();
    rendreSemaine();
  });
  // Bornes issues du droit belge (CIR/GDF-05 §6) : on ne peut pas se
  // régler un seuil qui autoriserait un saut interdit.
  $("#reglage-vent").addEventListener("change", (e) => {
    const v = Math.max(5, Math.min(LEGAL_BE.ventMoyenMaxSol, Number(e.target.value) || 0));
    etat.reglages.ventMax = v;
    e.target.value = v;
    sauverReglages();
    rendreSemaine();
  });
  $("#reglage-plafond").addEventListener("change", (e) => {
    const p = Math.max(LEGAL_BE.plafondMinAGL, Math.min(4000, Number(e.target.value) || 0));
    etat.reglages.plafondMin = p;
    e.target.value = p;
    sauverReglages();
    rendreSemaine();
  });
  $("#reglage-reset").addEventListener("click", () => {
    etat.reglages.ventMax = null;
    etat.reglages.plafondMin = null;
    sauverReglages();
    rendreReglages();
    rendreSemaine();
  });
}

// ------------------------------------------------------------
// Navigation, thème, fraîcheur
// ------------------------------------------------------------
function basculerVue(nom) {
  for (const v of ["semaine", "jour", "reglages"]) {
    $(`#vue-${v}`).hidden = v !== nom;
  }
  window.scrollTo({ top: 0 });
}

/** Thème auto : planche de bord sombre la nuit, variante claire de jour. */
function appliquerTheme() {
  let nuit;
  const aujourdHui = etat.meteo?.jours?.[0];
  const hd = heureCourante();
  if (aujourdHui?.sunrise && aujourdHui?.sunset) {
    nuit = hd < heureDecimale(aujourdHui.sunrise) || hd > heureDecimale(aujourdHui.sunset);
  } else {
    nuit = hd < 7 || hd >= 21;
  }
  document.documentElement.dataset.theme = nuit ? "nuit" : "jour";
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", nuit ? "#0b1016" : "#e9eef4");
}

const AGE_PERIME_MIN = 90;

function afficherFraicheur() {
  const { recupereLe, sources } = etat.meteo;
  const date = new Date(recupereLe);
  const ageMin = (Date.now() - date.getTime()) / 60000;
  const maj = $("#maj");
  const liste = [
    "modèle principal",
    sources.modeles ? "7 modèles" : null,
    sources.ensembles ? "122 scénarios d'ensemble" : null,
    sources.metar ? `METAR ${METAR.station}` : null,
  ].filter(Boolean).join(" + ");
  const manquants = [
    !sources.modeles ? "modèles de comparaison" : null,
    !sources.ensembles ? "ensembles" : null,
  ].filter(Boolean);
  if (ageMin > AGE_PERIME_MIN) {
    maj.innerHTML = `⚠️ <strong>Prévisions non rafraîchies depuis ${r(ageMin / 60)} h</strong> (dernier succès réseau à ${heureBruxelles(date)}) — vérifie ta connexion avant de te fier au verdict.`;
    maj.classList.add("perime");
  } else {
    maj.innerHTML = `${liste} · mis à jour à ${heureBruxelles(date)}` +
      (manquants.length ? `<br>⚠️ Indisponible : ${manquants.join(", ")} — probabilité moins fiable.` : "");
    maj.classList.toggle("perime", manquants.length > 0);
  }
}

/** Re-rend la vue affichée (après l'arrivée tardive d'une donnée). */
function rafraichirVueCourante() {
  if (!$("#vue-jour").hidden) rendreJour();
  else rendreSemaine();
}

// ------------------------------------------------------------
// Initialisation
// ------------------------------------------------------------
async function init() {
  appliquerTheme();

  $("#lien-gmaps").href = LIENS.gmaps;
  $("#lien-irm").href = LIENS.irm;
  $("#lien-windy").href = LIENS.windy;
  $("#lien-club").href = LIENS.club;
  $("#lien-briefing").href = LIENS.briefing;
  $("#lien-briefing-jour").href = LIENS.briefing;
  $("#version").textContent = `v${VERSION}`;

  const ouvrirReglages = () => { rendreReglages(); basculerVue("reglages"); };
  $("#btn-retour").addEventListener("click", () => basculerVue("semaine"));
  $("#btn-reglages").addEventListener("click", ouvrirReglages);
  $("#btn-niveau").addEventListener("click", ouvrirReglages);
  $("#btn-reglages-retour").addEventListener("click", () => basculerVue("semaine"));
  brancherReglages();

  // Observation lancée tout de suite, branchée dès qu'elle arrive.
  const metarPromesse = chargerMetar();

  try {
    const [meteo, carburant] = await Promise.allSettled([chargerMeteo(), prixDiesel()]);
    if (meteo.status !== "fulfilled") throw meteo.reason;
    etat.meteo = meteo.value;
    etat.carburant = carburant.status === "fulfilled" ? carburant.value : null;
    appliquerTheme();
    afficherFraicheur();
    rendreSemaine();
    $("#chargement").hidden = true;
    $("#vue-semaine").hidden = false;

    const metar = await metarPromesse;
    if (metar) {
      etat.meteo.metar = metar;
      etat.meteo.sources.metar = true;
      afficherFraicheur();
      rafraichirVueCourante();
    }
  } catch (err) {
    const zone = $("#chargement");
    zone.innerHTML = `
      <p><strong>Impossible de charger la météo.</strong></p>
      <p class="erreur-detail"></p>
      <button class="btn" id="btn-reessayer">Réessayer</button>`;
    zone.querySelector(".erreur-detail").textContent = err.message;
    zone.querySelector("#btn-reessayer").addEventListener("click", () => location.reload());
    console.error(err);
  }
}

init();

// ------------------------------------------------------------
// Service worker & mise à jour automatique
//
// Une app installée (TWA/WebAPK) garde la page vivante entre deux
// ouvertures : rien ne vérifierait jamais l'arrivée d'une nouvelle
// version sans les mécanismes ci-dessous.
// ------------------------------------------------------------
if ("serviceWorker" in navigator) {
  // Première prise de contrôle : pas de rechargement. Tout changement
  // SUIVANT signifie qu'une nouvelle version vient de s'activer.
  let controleurConnu = navigator.serviceWorker.controller;
  let rechargeEnCours = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!controleurConnu) {
      controleurConnu = navigator.serviceWorker.controller;
      return;
    }
    if (rechargeEnCours) return;
    rechargeEnCours = true;
    location.reload();
  });

  // updateViaCache "none" : le script du SW n'est jamais relu depuis le
  // cache HTTP (max-age=600 sur GitHub Pages).
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((reg) => {
    // Recherche de mise à jour à chaque retour au premier plan (seul signal
    // fiable dans une TWA) : visibilitychange, pageshow (bfcache), focus.
    let derniereVerif = 0;
    const chercherMaj = () => {
      if (document.hidden) return;
      if (Date.now() - derniereVerif < 10000) return;
      derniereVerif = Date.now();
      reg.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", chercherMaj);
    window.addEventListener("pageshow", chercherMaj);
    window.addEventListener("focus", chercherMaj);
    setInterval(chercherMaj, 30 * 60 * 1000);
    chercherMaj();
  }).catch(() => {});
}
