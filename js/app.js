// ============================================================
// Vent4000 — Application (UI) v2.1
// ============================================================

import { DZ, NIVEAUX_PRATIQUE, LIENS, VERSION, LEGAL_BE, AERODROME, MODELES } from "./config.js";
import { statutOuverture } from "./ouverture.js";
import { scoreHeure, fenetreSautable, meilleurVerdict, ventPiste } from "./scoring.js";
import { ageMetar } from "./metar.js";
import { comparerPrevisions, doitRemplacerInstantane } from "./tendance.js";
import { conseilDeplacement } from "./deplacement.js";
import { prixDiesel } from "./carburant.js";
import { chargerMeteo, chargerAero, NIVEAUX_PROFIL, NIVEAUX_AGL } from "./meteo.js";

// ------------------------------------------------------------
// État & réglages
// ------------------------------------------------------------
const CLE_REGLAGES = "vent4000.reglages";
const CLE_INSTANTANES = "vent4000.instantanes";

const etat = {
  meteo: null,
  aero: { metar: null, taf: null },
  jourSelectionne: null,
  heureSelectionnee: null,
  reglages: chargerReglages(),
  instantanes: chargerInstantanes(),
  carburant: null,
};

function chargerReglages() {
  const defauts = { niveau: "tandem", ventMax: null };
  try {
    const lu = { ...defauts, ...JSON.parse(localStorage.getItem(CLE_REGLAGES) || "{}") };
    if (!NIVEAUX_PRATIQUE[lu.niveau]) lu.niveau = "tandem";
    return lu;
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
 * Seuils effectifs : ceux du règlement pour le niveau choisi. Le seul
 * réglage personnel possible est un vent max PLUS STRICT (le RSB autorise
 * le RT à durcir, jamais à assouplir) : il est borné ici au palier du brevet.
 */
function seuilsActifs() {
  const base = NIVEAUX_PRATIQUE[etat.reglages.niveau] ?? NIVEAUX_PRATIQUE.tandem;
  const perso = etat.reglages.ventMax;
  return {
    label: base.label,
    ventMax: perso != null ? Math.min(perso, base.ventMax) : base.ventMax,
    ventMaxReglement: base.ventMax,
    plafondMin: base.plafondMin,
    hauteurOuverture: base.hauteurOuverture,
    sourceOuverture: base.sourceOuverture,
  };
}

// ------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const r = Math.round;

const JOURS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MOIS_FR = ["janv.", "févr.", "mars", "avril", "mai", "juin",
                 "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const VERDICT_TEXTE = { vert: "Ça saute", orange: "Ça passe juste", rouge: "Ça ne saute pas" };
// Forme redondante avec la couleur (daltonisme rouge-vert).
const VERDICT_SYMBOLE = { vert: "●", orange: "▲", rouge: "✕" };
const PRECISION_TEXTE = {
  obs: "observation",
  hr: "modèles 1,3-2,2 km",
  regional: "modèles régionaux 7-10 km",
  aucune: "aucune donnée",
};

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
function jourHeureBruxelles(date) {
  return date.toLocaleString("fr-BE", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });
}

const CARDINAUX = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
function cardinal(deg) {
  if (deg == null) return "—";
  return CARDINAUX[Math.round(deg / 22.5) % 16];
}

/** « ➤ » pointe vers l'EST à 0° : pour montrer où VA le vent, direction + 90°. */
function rotationFleche(direction) {
  return (direction ?? 0) + 90;
}

function texteFenetre(f) {
  if (!f || f.debut == null) return null;
  return `${f.debut}h → ${f.fin}h`;
}

function formatDistance(m) {
  if (m === Infinity) return "∞";
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace(".0", "")} km` : `${r(m)} m`;
}

function court(m) {
  if (m == null) return "—";
  if (m === Infinity) return "∞";
  if (m >= 10000) return `${r(m / 1000)}k`;
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace(".0", "")}k` : `${r(m)}`;
}

/** Plage « min–max » (ou valeur unique) d'une liste de nombres. */
function plage(valeurs, f = (x) => `${r(x)}`) {
  const v = valeurs.filter((x) => x != null && Number.isFinite(x));
  if (!v.length) return null;
  const min = Math.min(...v);
  const max = Math.max(...v);
  return f(min) === f(max) ? f(min) : `${f(min)}–${f(max)}`;
}

const CLASSE_STATUT = { ok: "c-ok", violee: "c-bloquant", incertaine: "c-limite", nonVerifiable: "c-limite", limite: "c-limite" };
const LIBELLE_STATUT = { ok: "respectée", violee: "non respectée", incertaine: "sources divergentes", nonVerifiable: "non vérifiable", limite: "à apprécier" };

/** Sources sur lesquelles s'appuient les valeurs affichées d'une heure. */
function sourcesAffichees(score) {
  const obs = score.sources.find((s) => s.type === "obs");
  return obs ? [obs] : score.sources;
}

// ------------------------------------------------------------
// Calcul des jours d'ouverture
// ------------------------------------------------------------
let memoJours = { cle: null, valeur: null };

function joursOuvertsScores() {
  const seuils = seuilsActifs();
  const cle = [etat.meteo?.recupereLe, etat.aero.metar?.brut, etat.aero.taf?.brut, seuils.label, seuils.ventMax,
               todayIso(), Math.floor(heureCourante())].join("|");
  if (memoJours.cle === cle) return memoJours.valeur;
  const valeur = calculerJoursOuverts(seuils);
  memoJours = { cle, valeur };
  return valeur;
}

function calculerJoursOuverts(seuils) {
  const resultat = [];
  const heureNow = Math.floor(heureCourante());
  const aujourdhui = todayIso();
  const aero = { ...etat.aero, maintenant: new Date() };

  etat.meteo.jours.forEach((jour, index) => {
    const date = dateLocale(jour.date);
    const ouverture = statutOuverture(date);
    if (!ouverture) return;

    const estAujourdhui = jour.date === aujourdhui;
    const coucher = heureDecimale(jour.sunset);

    let creneaux = ouverture.creneaux.map((c) => {
      const fin = c.fin ?? coucher;
      const heures = jour.heures
        .filter((h) => h.heure + 1 > c.debut && h.heure < fin)
        .filter((h) => !estAujourdhui || h.heure >= heureNow)
        .map((h) => ({ h, score: scoreHeure(h, seuils, aero) }));
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

    // Accord sur la fenêtre : la PIRE heure (le nombre de sources qui
    // valident TOUTE la fenêtre, pas une moyenne).
    const accordFenetre = heuresFenetre.length
      ? heuresFenetre.map((x) => x.score.accord)
          // Pire ratio d'abord ; à ratio égal, l'heure la moins documentée.
          .sort((a, b) => (a.favorables / (a.total || 1) - b.favorables / (b.total || 1)) || (a.total - b.total))[0]
      : null;
    const precisions = new Set(toutes.map((x) => x.score.precision));
    const precision = precisions.has("regional") && !precisions.has("hr") && !precisions.has("obs") ? "regional"
      : precisions.has("regional") ? "mixte" : "hr";
    const unanime = heuresFenetre.length > 0 && heuresFenetre.every((x) => x.score.accord.favorables === x.score.accord.total);

    resultat.push({
      index,
      date,
      dateIso: jour.date,
      ouverture,
      creneaux,
      verdictJour,
      meilleureFenetre,
      accordFenetre,
      precision,
      confiance: !unanime ? "faible" : precision === "hr" ? "haute" : "moyenne",
      motif: motifDominant(toutes, verdictJour),
      tendance: tendanceDuJour(jour.date, verdictJour, toutes),
      sunset: jour.sunset,
      heures: toutes,
    });
  });

  return resultat;
}

/** Motif du jour : la règle la plus souvent en cause sur les heures du verdict. */
function motifDominant(heuresScorees, verdict) {
  if (verdict === "vert") return null;
  const compte = new Map();
  for (const { score } of heuresScorees) {
    if (score.verdict !== verdict) continue;
    for (const regle of score.regles) {
      if (regle.statut === "ok") continue;
      const motif = `${regle.label} — ${LIBELLE_STATUT[regle.statut]}`;
      compte.set(motif, (compte.get(motif) ?? 0) + 1);
    }
  }
  if (!compte.size) return null;
  return [...compte.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function ventMoyenJour(heuresScorees) {
  const v = heuresScorees.flatMap(({ score }) => sourcesAffichees(score).map((s) => s.conditions.vent)).filter((x) => x != null);
  return v.length ? r(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

function tendanceDuJour(dateIso, verdict, heuresScorees) {
  const vent = ventMoyenJour(heuresScorees);
  if (vent == null) return null;
  return comparerPrevisions({ verdict, vent }, etat.instantanes[dateIso]);
}

function majInstantanes(jours) {
  let modifie = false;
  for (const j of jours) {
    const vent = ventMoyenJour(j.heures);
    if (vent == null) continue;
    if (!doitRemplacerInstantane(etat.instantanes[j.dateIso])) continue;
    etat.instantanes[j.dateIso] = { verdict: j.verdictJour, vent, ts: Date.now() };
    modifie = true;
  }
  const aujourdhui = todayIso();
  for (const date of Object.keys(etat.instantanes)) {
    if (date < aujourdhui) { delete etat.instantanes[date]; modifie = true; }
  }
  if (modifie) sauverInstantanes();
}

// ------------------------------------------------------------
// METAR & TAF
// ------------------------------------------------------------
function rendreObservation(el) {
  const m = etat.aero.metar;
  if (!el) return;
  const age = m ? ageMetar(m) : Infinity;
  if (!m || age > 180) { el.hidden = true; return; }
  const seuils = seuilsActifs();
  const vent = m.variable && m.dir == null ? `VRB ${m.vent}` : `${String(m.dir ?? 0).padStart(3, "0")}° ${m.vent}`;
  const rafale = m.rafales ? ` rafales ${m.rafales}` : "";
  const nuages = m.cavok ? "CAVOK"
    : m.nuages.length ? m.nuages.map((n) => `${n.couverture} ${formatDistance(n.baseM)}`).join(" · ") : "pas de nuage significatif";
  const perime = age > AERODROME.metarAgeMaxMin;
  el.hidden = false;
  el.innerHTML = `
    <div class="obs-haut">
      <span class="obs-titre"><span class="obs-point${perime ? " perime" : ""}"></span>Observé à ${AERODROME.nom} · ${heureBruxelles(m.obs)}</span>
      <span class="obs-age">il y a ${r(age)} min</span>
    </div>
    <div class="obs-valeurs">
      <span class="${(m.rafales ?? m.vent ?? 0) > seuils.ventMax ? "obs-alerte" : ""}"><b>${vent}${rafale}</b> km/h</span>
      <span class="${m.plafond < LEGAL_BE.plafondMinAGL ? "obs-alerte" : ""}">${echapper(nuages)}</span>
      <span class="${m.visibilite != null && m.visibilite < LEGAL_BE.visibiliteMin ? "obs-alerte" : ""}">vis. ${m.visibilite != null ? formatDistance(m.visibilite) : "—"}</span>
      ${m.temp != null ? `<span>${m.temp}°C</span>` : ""}
      ${m.temps.length ? `<span class="obs-alerte">${echapper(m.temps.join(" "))}</span>` : ""}
    </div>
    <details class="obs-brut"><summary>METAR brut</summary><code>${echapper(m.brut)}</code></details>`;
}

/** Bloc TAF, affiché sur la vue Jour si la prévision officielle couvre ce jour. */
function rendreTaf(el, jour) {
  const t = etat.aero.taf;
  const debutJour = jour.heures[0]?.utc;
  const finJour = jour.heures[jour.heures.length - 1]?.utc;
  if (!t || debutJour == null || t.fin.getTime() <= debutJour || t.debut.getTime() > finJour) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `
    <div class="obs-haut">
      <span class="obs-titre"><span class="obs-point"></span>TAF ${AERODROME.nom} — prévision officielle</span>
      <span class="obs-age">émis ${jourHeureBruxelles(t.emis)}</span>
    </div>
    <p class="taf-validite">Valable du ${jourHeureBruxelles(t.debut)} au ${jourHeureBruxelles(t.fin)} · aérodrome à ${AERODROME.distanceKm} km</p>
    <code class="taf-brut">${echapper(t.brut)}</code>`;
}

// ------------------------------------------------------------
// Vue Semaine
// ------------------------------------------------------------
function texteAccord(a) {
  return a ? `${a.favorables}/${a.total}` : "—";
}

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
    carte.className = `carte-jour ${j.verdictJour}${j.precision === "regional" ? " lointain" : ""}`;
    const fenetre = texteFenetre(j.meilleureFenetre);
    const bande = j.heures.map(({ h, score }) => {
      const hauteur = score.accord.total ? Math.max(12, r((score.accord.favorables / score.accord.total) * 100)) : 100;
      return `<span class="bande-h ${score.verdict}" title="${h.heure}h · ${VERDICT_TEXTE[score.verdict]} · ${texteAccord(score.accord)} sources favorables">
        <i style="height:${hauteur}%"></i><em>${h.heure % 2 === 0 ? h.heure : ""}</em></span>`;
    }).join("");

    carte.innerHTML = `
      <span class="cj-haut">
        <span class="cj-quand">
          <span class="cj-nom">${JOURS_FR[j.date.getDay()]}</span>
          <span class="cj-date">${j.date.getDate()} ${MOIS_FR[j.date.getMonth()]}</span>
          ${j.ouverture.type === "ferie" ? `<span class="etiq-jour">Férié</span>` : ""}
          ${j.precision !== "hr" ? `<span class="etiq-jour">${j.precision === "regional" ? "Modèles 7-10 km" : "En partie 7-10 km"}</span>` : ""}
          ${rendreTendance(j.tendance)}
        </span>
        ${j.accordFenetre ? `<span class="cj-accord"><b>${texteAccord(j.accordFenetre)}</b><small>sources</small></span>` : ""}
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
      `${fenetre ? `, ${fenetre}` : ""}${j.accordFenetre ? `, ${texteAccord(j.accordFenetre)} sources favorables` : ""}`);
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
    : etat.carburant?.source === "cache" ? "dernier prix connu" : "prix de repli";
  el.className = `deplacement dep-${c.niveau}`;
  el.hidden = false;
  el.innerHTML = `
    <div class="dep-haut">
      <strong class="dep-titre">${c.titre}</strong>
      <span class="dep-cout" title="Diesel B7 à ${c.cout.prixLitre.toFixed(3)} €/L — ${origine}">${c.cout.km} km · ${heures} h · ~${c.cout.euros} €</span>
    </div>
    <p class="dep-detail">${c.detail}</p>`;
}

/** Sur une journée limite, le club peut poser une barrière d'expérience. */
function afficherAvertissementExperience(el, verdict) {
  const concerne = verdict === "orange";
  el.hidden = !concerne;
  if (concerne) {
    el.innerHTML = `Journée limite : le club peut imposer un <strong>nombre de sauts minimum</strong>
      pour débuter, et le RT peut durcir les limites (RSB §3.4.2).
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

  $("#jour-verdict").className = `hero ${info.verdictJour}`;
  $("#jour-verdict-texte").innerHTML =
    `<span aria-hidden="true">${VERDICT_SYMBOLE[info.verdictJour]}</span> ${VERDICT_TEXTE[info.verdictJour]}`;
  const fenetre = texteFenetre(info.meilleureFenetre);
  $("#jour-verdict-quand").innerHTML = (fenetre
    ? `Fenêtre <strong>${fenetre}</strong>${info.motif ? ` · ${echapper(info.motif.toLowerCase())}` : ""}`
    : echapper(info.motif ?? "Aucune fenêtre de 2 h consécutives"))
    + `<br><span class="hero-precision">Données : ${info.precision === "hr" ? PRECISION_TEXTE.hr + (info.heures.some((x) => x.score.sources.some((src) => src.type === "taf")) ? " + TAF Charleroi" : "") : info.precision === "regional" ? PRECISION_TEXTE.regional + " (moins précis)" : "1,3-2,2 km puis 7-10 km"}</span>`;
  $("#jour-jauge").innerHTML = info.accordFenetre ? `
    <span class="jauge-valeur">${texteAccord(info.accordFenetre)}</span>
    <span class="jauge-label">sources<br>favorables</span>` : "";

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
  rendreTaf($("#jour-taf"), jour);

  const toutes = info.heures;
  if (etat.heureSelectionnee === null && toutes.length) {
    const debut = info.meilleureFenetre?.debut;
    etat.heureSelectionnee = debut != null ? debut : toutes[0].h.heure;
  }

  rendreMatrice(toutes, estAujourdhui);
  const sel = toutes.find((x) => x.h.heure === etat.heureSelectionnee) ?? toutes[0];
  if (sel) rendreDetailHeure(sel, seuils);
}

// ------------------------------------------------------------
// Tableau horaire
// ------------------------------------------------------------
const tempsCourt = (c) => (c.orage ? "TS" : c.cb ? "CB" : c.precip ? "RA" : c.brouillard ? "FG" : null);

const LIGNES = [
  { cle: "verdict", label: "Verdict" },
  { cle: "accord", label: "Sources ✓" },
  { regle: "ventNiveau", label: "Vent moyen", val: (ss) => plage(ss.map((s) => s.conditions.vent)) },
  { regle: "rafales", label: "Rafales", val: (ss) => plage(ss.map((s) => s.conditions.rafales ?? (s.conditions.rafalesAbsentesSignifientCalme ? s.conditions.vent : null))) },
  { cle: "direction", label: "Direction" },
  { regle: "plafond", label: "Plafond", val: (ss) => {
      const connus = ss.map((s) => s.conditions.plafond).filter((x) => x != null);
      if (connus.length) return court(Math.min(...connus));
      if (ss.some((s) => s.conditions.coucheBasse)) return "?";
      return ss.some((s) => s.conditions.plafondAuMoins) ? ">2k" : "—";
    } },
  { regle: "visibilite", label: "Visibilité", val: (ss) => {
      const v = ss.map((s) => s.conditions.visibilite).filter((x) => x != null);
      return v.length ? court(Math.min(...v)) : "—";
    } },
  { regle: "orage", label: "Orage", val: (ss) => (ss.some((s) => s.conditions.orage) ? "TS" : ss.some((s) => s.conditions.cb) ? "CB" : "—") },
  { regle: "pluie", label: "Précip.", val: (ss) => (ss.some((s) => s.conditions.precip) ? (ss.map((s) => tempsCourt(s.conditions)).find((x) => x === "RA") ?? "oui") : "—") },
  { cle: "precision", label: "Données" },
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
      const ss = sourcesAffichees(score);
      if (ligne.cle === "verdict") {
        return `<td class="m-v ${score.verdict}${actif}" data-heure="${h.heure}" title="${echapper(score.raisons.join(" · ") || "Toutes les règles respectées")}">${VERDICT_SYMBOLE[score.verdict]}</td>`;
      }
      if (ligne.cle === "accord") {
        const a = score.accord;
        const cls = !a.total ? "c-na" : a.favorables === a.total ? "c-ok" : a.favorables * 2 > a.total ? "c-limite" : "c-bloquant";
        return `<td class="${cls}${actif}" data-heure="${h.heure}">${texteAccord(a)}</td>`;
      }
      if (ligne.cle === "direction") {
        const dir = ss.find((s) => s.conditions.dir != null)?.conditions.dir;
        return `<td class="c-ok${actif}" data-heure="${h.heure}">${dir != null ? `<span class="m-fleche" style="transform:rotate(${rotationFleche(dir)}deg)">➤</span>` : "—"}</td>`;
      }
      if (ligne.cle === "precision") {
        const t = { obs: "obs", hr: "2 km", regional: "7-10", aucune: "—" }[score.precision];
        return `<td class="c-info${actif}" data-heure="${h.heure}">${t}</td>`;
      }
      const regle = score.regles.find((x) => x.id === ligne.regle);
      const cls = regle ? CLASSE_STATUT[regle.statut] : "c-na";
      return `<td class="${cls}${actif}" data-heure="${h.heure}"${regle?.detail ? ` title="${echapper(regle.detail)}"` : ""}>${echapper(ligne.val(ss) ?? "—")}</td>`;
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
function rendreDetailHeure({ h, score }, seuils) {
  $("#detail-titre").innerHTML =
    `${h.heure}h → ${h.heure + 1}h <span class="detail-verdict ${score.verdict}">${VERDICT_SYMBOLE[score.verdict]} ${VERDICT_TEXTE[score.verdict]}</span>`;

  const classe = score.verdict === "rouge" ? "bloquant" : "degradant";
  $("#raisons").innerHTML = score.raisons.length
    ? score.raisons.map((x) => `<li class="${classe}">${echapper(x)}</li>`).join("")
    : `<li class="ok">Toutes les règles respectées pour « ${echapper(seuils.label)} » (${texteAccord(score.accord)} sources favorables)</li>`;

  // Règles, avec leur source réglementaire.
  $("#facteurs").innerHTML = score.regles.map((x) => `
    <div class="facteur f-${x.statut === "violee" ? "bloquant" : x.statut === "ok" ? "ok" : "limite"}">
      <span class="f-point" aria-hidden="true"></span>
      <span class="f-label">${echapper(x.label)} <em class="f-tag">${echapper(x.source)}</em></span>
      <strong class="f-valeur">${LIBELLE_STATUT[x.statut]}</strong>
      ${x.detail ? `<span class="f-motif">${echapper(x.detail)}</span>` : ""}
    </div>`).join("");

  rendreSources(score);
  rendreProfil(h);
  rendrePiste(score);
}

/** Tableau des sources : chacune avec ses valeurs et son verdict propre. */
function rendreSources(score) {
  const ligne = (s) => {
    const c = s.conditions;
    const ok = Object.values(s.resultats).every((res) => res.statut === "ok" || res.statut === "inconnu");
    const enEchec = Object.values(s.resultats).some((res) => res.statut === "echec");
    const raf = c.rafales ?? (c.rafalesAbsentesSignifientCalme ? c.vent : null);
    const plafond = c.plafond != null ? court(c.plafond) : c.coucheBasse ? "?" : c.plafondAuMoins ? ">2k" : "—";
    const nom = s.type === "modele" ? `${s.nom} <small>${s.maille}</small>` : s.nom;
    return `<tr class="${ok ? "src-oui" : enEchec ? "src-non" : "src-limite"}">
      <th scope="row">${nom}</th>
      <td>${c.vent != null ? r(c.vent) : "—"}</td><td>${raf != null ? r(raf) : "—"}</td>
      <td>${plafond}</td><td>${c.visibilite != null ? court(Math.min(c.visibilite, 99000)) : "—"}</td>
      <td>${tempsCourt(c) ?? "—"}</td>
      <td class="src-verdict">${ok ? "✓" : enEchec ? "✕" : "▲"}</td></tr>`;
  };
  const taf = score.sources.find((s) => s.type === "taf");
  const variantes = taf?.variantes?.length
    ? `<p class="note-hypotheses">Variations du TAF sur cette heure : ${taf.variantes.map((v) => `<code>${echapper(v.libelle)}</code>`).join(" · ")}</p>` : "";
  const absents = MODELES.filter((m) => !score.sources.some((s) => s.id === m.id));
  $("#consensus").innerHTML = `
    <div class="sources-cadre"><table class="sources">
      <thead><tr><th></th><th>Vent</th><th>Raf.</th><th>Plafond</th><th>Vis.</th><th>Temps</th><th></th></tr></thead>
      <tbody>${score.sources.map(ligne).join("")}</tbody>
    </table></div>
    ${variantes}
    <p class="note-hypotheses">Vent en km/h, distances en m (k = km). Plafond « &gt;2k » : le modèle ne prévoit aucune couche ≥ 5/8 sous 2 km ;
      « ? » : couche basse ≥ 5/8 dont le modèle ne fournit pas la base (non estimée).
      ${score.precision === "regional" ? "<br><strong>Hors portée des modèles 1,3-2,2 km : seuls les modèles régionaux (7-10 km) couvrent cette heure.</strong>" : ""}
      ${absents.length && score.precision !== "regional" ? `<br>Non utilisés à cette heure : ${absents.map((m) => m.nom).join(", ")} (${score.sources.some((s) => s.hr) ? "moins précis ou hors portée" : "hors portée"}).` : ""}</p>`;
}

function rendreProfil(h) {
  const lignes = [];
  for (const p of NIVEAUX_PROFIL) {
    const n = h.niveaux?.[p];
    if (n?.agl != null && n.agl > 100) lignes.push({ agl: n.agl, vent: n.vent, dir: n.dir, temp: n.temp });
  }
  for (const m of NIVEAUX_AGL) {
    const n = h.niveauxAGL?.[m];
    if (n?.vent != null) lignes.push({ agl: m, vent: n.vent, dir: n.dir, temp: null });
  }
  lignes.sort((a, b) => b.agl - a.agl);
  $("#profil").innerHTML = `
    <div class="profil-entete"><span>Alt. AGL</span><span>Vent</span><span>T°</span></div>
    ${lignes.map((l) => `
    <div class="niveau">
      <div class="niv-alt"><strong>${l.agl} m</strong></div>
      <div class="niv-vent">
        <span class="fleche-icone" style="transform: rotate(${rotationFleche(l.dir)}deg)">➤</span>
        <b>${l.vent != null ? r(l.vent) : "—"}</b><small>${cardinal(l.dir)}</small>
      </div>
      <div class="niv-temp">${l.temp != null ? `${r(l.temp)}°` : "—"}</div>
    </div>`).join("")}
    <p class="note-hypotheses">Modèle ICON (DWD), à titre d'information : le RSB §3.4.2 impose de
      <em>connaître</em> le vent en altitude, sans fixer de limite. Isotherme 0 °C :
      ${h.isoZero != null ? formatDistance(h.isoZero) : "—"} · CAPE : ${h.cape != null ? `${r(h.cape)} J/kg` : "—"}.</p>`;
}

function rendrePiste(score) {
  const s = sourcesAffichees(score).find((x) => x.conditions.vent != null && x.conditions.dir != null)
    ?? score.sources.find((x) => x.conditions.vent != null && x.conditions.dir != null);
  const vent = s?.conditions.vent ?? 0;
  const dir = s?.conditions.dir ?? 0;
  rendreBoussole(dir, vent);
  const vp = ventPiste(vent, dir);
  $("#crosswind").innerHTML = `
    <div class="ligne"><span>Vent (${echapper(s?.nom ?? "—")})</span><strong>${cardinal(dir)} ${r(dir)}° · ${r(vent)} km/h</strong></div>
    <div class="ligne"><span>Traversier</span><strong>${vp.traversier} km/h</strong></div>
    <div class="ligne"><span>De face</span><strong>${vp.face} km/h</strong></div>
    <span class="note">Axe piste ${String(DZ.qfu).padStart(3, "0")}° / ${DZ.qfu + 180}°. Sous voile, on pose face à la manche à air.</span>`;
}

function rendreBoussole(direction, vitesse) {
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
  const s = seuilsActifs();
  const champ = $("#reglage-vent");
  champ.max = s.ventMaxReglement;
  champ.value = s.ventMax;
  $("#reglage-vent-borne").textContent =
    `Limite du règlement pour ce niveau : ${s.ventMaxReglement} km/h (RSB §3.4.2). Tu peux seulement la durcir.`;
  $("#reglage-resume").innerHTML = `
    <li>Vent moyen et rafales ≤ <strong>${s.ventMax} km/h</strong>${s.ventMax < s.ventMaxReglement ? " (durci par toi)" : ""}</li>
    <li>Vent moyen ≤ <strong>${LEGAL_BE.ventMoyenMaxSol} km/h</strong> (25 kts, loi)</li>
    <li>Base des nuages ≥ <strong>${LEGAL_BE.plafondMinAGL} m</strong> (3000 ft) · visibilité ≥ <strong>3 km</strong></li>
    <li>Ouverture : <strong>${s.hauteurOuverture} m</strong> — ${echapper(s.sourceOuverture)}</li>`;
}

function brancherReglages() {
  $("#reglage-niveau").addEventListener("change", (e) => {
    etat.reglages.niveau = e.target.value;
    etat.reglages.ventMax = null;
    sauverReglages();
    rendreReglages();
    rendreSemaine();
  });
  $("#reglage-vent").addEventListener("change", (e) => {
    const max = (NIVEAUX_PRATIQUE[etat.reglages.niveau] ?? NIVEAUX_PRATIQUE.tandem).ventMax;
    const v = Math.max(5, Math.min(max, Number(e.target.value) || max));
    etat.reglages.ventMax = v < max ? v : null;
    e.target.value = v;
    sauverReglages();
    rendreReglages();
    rendreSemaine();
  });
  $("#reglage-reset").addEventListener("click", () => {
    etat.reglages.ventMax = null;
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
  const date = new Date(etat.meteo.recupereLe);
  const ageMin = (Date.now() - date.getTime()) / 60000;
  const maj = $("#maj");
  const liste = [
    "8 modèles (5 à 1,3-2,2 km)",
    etat.aero.taf ? `TAF ${AERODROME.station}` : null,
    etat.aero.metar ? `METAR ${AERODROME.station}` : null,
  ].filter(Boolean).join(" + ");
  if (ageMin > AGE_PERIME_MIN) {
    maj.innerHTML = `⚠️ <strong>Prévisions non rafraîchies depuis ${r(ageMin / 60)} h</strong> (dernier succès réseau à ${heureBruxelles(date)}) — vérifie ta connexion avant de te fier au verdict.`;
    maj.classList.add("perime");
  } else {
    maj.textContent = `${liste} · mis à jour à ${heureBruxelles(date)}`;
    maj.classList.remove("perime");
  }
}

function rafraichirVueCourante() {
  if (!$("#vue-jour").hidden) rendreJour();
  else if (!$("#vue-semaine").hidden) rendreSemaine();
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
  $("#btn-reglages-retour").addEventListener("click", () => { basculerVue("semaine"); rendreSemaine(); });
  brancherReglages();

  // METAR + TAF lancés tout de suite, branchés dès qu'ils arrivent.
  const aeroPromesse = chargerAero();

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

    const aero = await aeroPromesse;
    if (aero.metar || aero.taf) {
      etat.aero = aero;
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
// Service worker & mise à jour automatique (TWA/WebAPK : la page reste
// vivante entre deux ouvertures, il faut chercher activement les mises à jour).
// ------------------------------------------------------------
if ("serviceWorker" in navigator) {
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

  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((reg) => {
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
