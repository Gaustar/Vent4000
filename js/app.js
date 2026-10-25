// ============================================================
// Vent4000 — Application (UI) v2.4
// ============================================================

import { DZ, NIVEAUX_PRATIQUE, LIENS, RELAIS_CLUB, RELAIS_AVION, VERSION, LEGAL_BE, AERODROME, MODELES } from "./config.js";
import { ouvertureReelle, fermeParLeClub, estFerie } from "./ouverture.js";
import { normaliserProfil, ventMaxEffectif, jourDisponible, convertirVent, exporterProfil, importerProfil,
  UNITES_VENT, THEMES, JOURS_SEMAINE, MARGE_MAX } from "./profil.js";
import { phaseVol, distanceKm, relevement, vueDepuis, RAYON_KM, SIGNAL_PERIME_S } from "./avion.js";
import { regleEnClair, confianceEnClair, echeanceEnClair, directionEnClair, cielEnClair, visibiliteEnClair, tempsEnClair } from "./langage.js";
import { chargerClub } from "./club.js";
import { scoreHeure, fenetreSautable, meilleurVerdict, ventPiste } from "./scoring.js";
import { ageMetar } from "./metar.js";
import { comparerPrevisions, doitRemplacerInstantane } from "./tendance.js";
import { conseilDeplacement } from "./deplacement.js";
import { prixDiesel, prixPour, CARBURANTS } from "./carburant.js";
import { chargerMeteo, chargerAero, doitRecharger, NIVEAUX_PROFIL, NIVEAUX_AGL } from "./meteo.js";

// ------------------------------------------------------------
// État & réglages
// ------------------------------------------------------------
const CLE_REGLAGES = "vent4000.reglages";
const CLE_INSTANTANES = "vent4000.instantanes";

const etat = {
  meteo: null,
  aero: { metar: null, taf: null },
  aeroCharge: false,        // MET Norway a répondu (ou échoué) au moins une fois
  echecRechargement: null,  // cause du dernier rechargement raté, sinon null
  jourSelectionne: null,
  heureSelectionnee: null,
  reglages: chargerReglages(),
  instantanes: chargerInstantanes(),
  carburant: null,
  club: null,               // page météo publique du club, via le relais (club.js)
  avion: null,              // avion(s) de largage près du terrain, via le relais (avion.js)
  traces: new Map(),        // hex → positions reçues depuis l'ouverture de l'app
  moi: null,                // position du téléphone (« Me situer ») : jamais envoyée
  moiErreur: null,
};

/** Profil du membre (js/profil.js) : migré et validé à la lecture. */
function chargerReglages() {
  try {
    return normaliserProfil(JSON.parse(localStorage.getItem(CLE_REGLAGES) || "null"));
  } catch {
    return normaliserProfil(null);
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
 * Seuils effectifs : ceux du règlement pour le niveau choisi, moins la
 * marge personnelle éventuelle (le RSB autorise à durcir, jamais à
 * assouplir : ventMaxEffectif ne dépasse jamais le palier du brevet).
 */
function seuilsActifs() {
  const base = NIVEAUX_PRATIQUE[etat.reglages.niveau] ?? NIVEAUX_PRATIQUE.tandem;
  const ventMax = ventMaxEffectif(etat.reglages);
  return {
    label: base.label,
    ventMax,
    ventMaxReglement: base.ventMax,
    marge: base.ventMax - ventMax,
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
const JOURS_COURTS = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
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

/** Vent (km/h en interne) dans l'unité du membre ; les seuils ne changent pas. */
const uniteVent = () => UNITES_VENT[etat.reglages.unite]?.label ?? "km/h";
const vv = (kmh) => {
  const v = convertirVent(kmh, etat.reglages.unite);
  return v == null ? "—" : String(v);
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
/** « au NE », « à l'OSO » : élision devant E et O. */
function versCardinal(deg) {
  const c = cardinal(deg);
  return /^[EO]/.test(c) ? `à l'${c}` : `au ${c}`;
}

function cardinal(deg) {
  if (deg == null) return "—";
  return CARDINAUX[Math.round(deg / 22.5) % 16];
}

/** « ➤ » pointe vers l'EST à 0° : pour montrer où VA le vent, direction + 90°. */
function rotationFleche(direction) {
  return (direction ?? 0) + 90;
}

/** 8.5 → « 8h30 », 17.48 → « 17h29 », 9 → « 9h ». */
function heureMinutes(x) {
  let h = Math.floor(x);
  let m = Math.round((x - h) * 60);
  if (m === 60) { h += 1; m = 0; }
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function texteFenetre(f) {
  if (!f || f.debut == null) return null;
  return `${heureMinutes(f.debutAffiche ?? f.debut)} → ${heureMinutes(f.finAffiche ?? f.fin)}`;
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
  const cle = [etat.meteo?.recupereLe, etat.aero.metar?.brut, etat.aero.taf?.brut, etat.club?.recu, seuils.label, seuils.ventMax,
               JSON.stringify(etat.reglages.jours),
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
    const ouverture = ouvertureReelle(date, etat.club);
    if (!ouverture) return;

    const estAujourdhui = jour.date === aujourdhui;
    const coucher = heureDecimale(jour.sunset);
    // Sauts du lever au coucher du soleil, jamais avant l'ouverture du club.
    const lever = jour.sunrise ? heureDecimale(jour.sunrise) : null;

    let creneaux = ouverture.creneaux.map((c0) => {
      const c = lever != null && lever > c0.debut ? { ...c0, debut: lever } : c0;
      const fin = c.fin ?? coucher;
      const heures = jour.heures
        .filter((h) => h.heure + 1 > c.debut && h.heure < fin)
        .filter((h) => !estAujourdhui || h.heure >= heureNow)
        .map((h) => ({ h, score: scoreHeure(h, seuils, aero) }));
      const f = fenetreSautable(heures.map((x) => ({ heure: x.h.heure, verdict: x.score.verdict })));
      // Le calcul se fait par heure pleine ; l'affichage donne les vraies
      // bornes (ouverture ou lever du soleil, coucher du soleil).
      const fenetre = f.debut != null ? { ...f, debutAffiche: Math.max(f.debut, c.debut), finAffiche: Math.min(f.fin, fin) } : f;
      return { ...c, heures, fenetre };
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
      dispo: jourDisponible(etat.reglages, date, estFerie(date)),
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

/**
 * Motif du jour : la règle la plus souvent en cause sur les heures du
 * verdict, avec sa phrase en clair et son libellé technique.
 */
function motifDominant(heuresScorees, verdict) {
  if (verdict === "vert") return null;
  const compte = new Map();
  for (const { score } of heuresScorees) {
    if (score.verdict !== verdict) continue;
    for (const regle of score.regles) {
      if (regle.statut === "ok") continue;
      const cle = `${regle.id}|${regle.statut}`;
      const c = compte.get(cle) ?? { regle, n: 0 };
      c.n += 1;
      compte.set(cle, c);
    }
  }
  if (!compte.size) return null;
  const { regle } = [...compte.values()].sort((a, b) => b.n - a.n)[0];
  return { clair: regleEnClair(regle), technique: `${regle.label} — ${LIBELLE_STATUT[regle.statut]}` };
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
  const vent = m.variable && m.dir == null ? `VRB ${vv(m.vent)}` : `${String(m.dir ?? 0).padStart(3, "0")}° ${vv(m.vent)}`;
  const rafale = m.rafales ? ` rafales ${vv(m.rafales)}` : "";
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
      <span class="${(m.rafales ?? m.vent ?? 0) > seuils.ventMax ? "obs-alerte" : ""}"><b>${vent}${rafale}</b> ${uniteVent()}</span>
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

const dateCourte = (iso) => `${Number(iso.slice(8))} ${MOIS_FR[Number(iso.slice(5, 7)) - 1]}`;
const ilYa = (ms) => {
  const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return min < 1 ? "à l'instant" : min < 60 ? `il y a ${min} min` : `il y a ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
};

/**
 * Ligne « Club » : état des activités publié par le club (page publique,
 * via le relais). Repris mot pour mot : c'est la décision du club, l'app
 * ne l'interprète pas et ne le mêle jamais à son verdict.
 */
function rendreClub(el) {
  const c = etat.club;
  if (!c?.etat) { el.hidden = true; return; }
  const perime = c.source === "cache";
  const prochain = (c.jours ?? []).find((j) => j.date >= todayIso());
  const ton = c.etat.ton ?? "neutre";
  el.hidden = false;
  el.innerHTML = `
    <span class="mt-label">Club</span>
    <div class="mt-corps">
      <p class="mt-valeur club-etat club-ton-${ton}"><span class="mt-point club-ton-${ton}" aria-hidden="true"></span>${echapper(c.etat.libelle)}</p>
      ${c.etat.message.map((p) => `<p class="mt-detail">${echapper(p)}</p>`).join("")}
      ${prochain ? `<p class="mt-detail">Prochain jour : <b>${echapper(prochain.jour.toLowerCase())} ${dateCourte(prochain.date)}</b>
        · point météo ${prochain.pointMeteo ? `<b>${echapper(prochain.pointMeteo)}</b>` : "pas encore annoncé"}
        ${prochain.start ? `· début prévu à <b>${echapper(prochain.start)}</b>` : ""}</p>` : ""}
      ${c.maj ? `<p class="mt-detail mt-discret">Mis à jour par le club : ${echapper(c.maj)}</p>` : ""}
    </div>
    <span class="mt-age${perime ? " perime" : ""}">${perime ? "hors ligne · " : ""}${ilYa(new Date(c.recu).getTime())}</span>`;
}

/** Ligne « Charleroi » : la dernière observation (METAR), en condensé. */
function rendreObsCompacte(el) {
  const m = etat.aero.metar;
  const age = m ? ageMetar(m) : Infinity;
  if (!m || age > 180) { el.hidden = true; return; }
  const s = seuilsActifs();
  const perime = age > AERODROME.metarAgeMaxMin;
  const vent = m.variable && m.dir == null ? `VRB ${vv(m.vent)}` : `${String(m.dir ?? 0).padStart(3, "0")}° ${vv(m.vent)}`;
  const nuages = m.cavok ? "CAVOK"
    : m.nuages.length ? m.nuages.map((n) => `${n.couverture} ${formatDistance(n.baseM)}`).join(" · ") : "pas de nuage significatif";
  const dir = directionEnClair(m.dir);
  const temps = tempsEnClair(m.temps);
  const ventTrop = (m.rafales ?? m.vent ?? 0) > s.ventMax;
  el.hidden = false;
  el.innerHTML = `
    <span class="mt-label">Ciel à ${AERODROME.nom}</span>
    <div class="mt-corps">
      <p class="mt-valeur"><span class="${ventTrop ? "obs-alerte" : ""}">Vent${dir ? ` ${dir}` : ""} <span class="mono">${vv(m.vent)}</span> ${uniteVent()}${m.rafales ? `, rafales <span class="mono">${vv(m.rafales)}</span>` : ""}</span></p>
      <p class="mt-detail">
        <span class="${m.plafond < LEGAL_BE.plafondMinAGL ? "obs-alerte" : ""}">${echapper(cielEnClair(m))}</span>
        · <span class="${m.visibilite != null && m.visibilite < LEGAL_BE.visibiliteMin ? "obs-alerte" : ""}">${echapper(visibiliteEnClair(m.visibilite) ?? "visibilité inconnue")}</span>
        ${m.temp != null ? `· ${m.temp} °C` : ""}
        ${temps ? `· <span class="obs-alerte">${echapper(temps)}</span>` : ""}</p>
      ${ventTrop ? `<p class="mt-detail">Plus fort que la limite de ton niveau (${vv(s.ventMax)} ${uniteVent()}).</p>` : ""}
      <details class="obs-brut technique"><summary>Message officiel (METAR) · observé à ${heureBruxelles(m.obs)}</summary><code>${echapper(m.brut)}</code>
        <p class="mt-detail mono">${vent}${m.rafales ? ` raf. ${vv(m.rafales)}` : ""} ${uniteVent()} · ${echapper(nuages)}</p></details>
    </div>
    <span class="mt-age${perime ? " perime" : ""}">il y a ${r(age)} min</span>`;
}

// ------------------------------------------------------------
// Avion de largage en direct (ADS-B via le relais, js/avion.js)
// ------------------------------------------------------------
const TRACE_MAX_MS = 20 * 60000;
const CLE_DERNIER_VU = "vent4000.avion";
const DERNIER_VU_MAX_MS = 2 * 3600e3;
let minuteurAvion = null;
let radarOuvert = false;

/** Dernière position reçue de l'avion du club : affichée quand il disparaît (au sol, sous la couverture). */
function lireDernierVu() {
  try {
    const d = JSON.parse(localStorage.getItem(CLE_DERNIER_VU) || "null");
    return d && Date.now() - d.quand < DERNIER_VU_MAX_MS ? d : null;
  } catch {
    return null;
  }
}

/** Cap (°) d'après les deux dernières positions de la trace : le MLAT n'en fournit pas. */
function capDeTrace(hex) {
  const t = etat.traces.get(hex) ?? [];
  for (let i = t.length - 2; i >= 0; i--) {
    const a = t[i];
    const b = t.at(-1);
    if (distanceKm(a.lat, a.lon, b.lat, b.lon) > 0.05) return relevement(a.lat, a.lon, b.lat, b.lon);
  }
  return null;
}

function majTraces(avions, quand) {
  for (const a of avions) {
    const t = etat.traces.get(a.hex) ?? [];
    const dernier = t.at(-1);
    if (!dernier || dernier.lat !== a.lat || dernier.lon !== a.lon) t.push({ lat: a.lat, lon: a.lon, altM: a.altitudeM, t: quand });
    etat.traces.set(a.hex, t.filter((p) => quand - p.t < TRACE_MAX_MS).slice(-150));
  }
  for (const [hex, t] of etat.traces) {
    if (!t.length || quand - t.at(-1).t > TRACE_MAX_MS) etat.traces.delete(hex);
  }
}

async function chargerAvion() {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), 8000);
  try {
    const rep = await fetch(RELAIS_AVION, { cache: "no-store", signal: controleur.signal });
    if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
    const d = await rep.json();
    if (!Array.isArray(d?.avions)) throw new Error("réponse inattendue");
    etat.avion = { ...d, erreur: null };
    majTraces(d.avions, new Date(d.recu).getTime());
    const club = d.avions.find((a) => a.club);
    if (club) {
      try { localStorage.setItem(CLE_DERNIER_VU, JSON.stringify({ quand: new Date(d.recu).getTime() - (club.ageS ?? 0) * 1000, avion: club })); } catch { /* stockage indisponible */ }
    }
  } catch {
    etat.avion = { ...(etat.avion ?? {}), erreur: "relais injoignable" };
  } finally {
    clearTimeout(minuteur);
  }
  if (!$("#vue-semaine").hidden) rendreAvion($("#mt-avion"));
}

// « Me situer » : position du téléphone, utilisée sur place pour dire où
// regarder. Elle n'est ni enregistrée ni envoyée ; le suivi s'arrête dès
// que l'accueil n'est plus à l'écran.
let suiviPosition = null;

function majSuiviPosition() {
  const voulu = etat.reglages.maPosition && !document.hidden && !$("#vue-semaine").hidden && "geolocation" in navigator;
  if (voulu && suiviPosition == null) {
    suiviPosition = navigator.geolocation.watchPosition((p) => {
      etat.moi = { lat: p.coords.latitude, lon: p.coords.longitude, altM: p.coords.altitude, precisionM: p.coords.accuracy };
      etat.moiErreur = null;
      if (!$("#vue-semaine").hidden) rendreAvion($("#mt-avion"));
    }, (e) => {
      etat.moiErreur = e.code === 1 ? "localisation refusée dans le navigateur" : "position indisponible";
      if (e.code === 1) majProfil({ maPosition: false }, { rerendre: false });
      arreterSuiviPosition();
      if (!$("#vue-semaine").hidden) rendreAvion($("#mt-avion"));
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
  } else if (!voulu) {
    arreterSuiviPosition();
  }
}

function arreterSuiviPosition() {
  if (suiviPosition != null) navigator.geolocation.clearWatch(suiviPosition);
  suiviPosition = null;
}

/** Jour d'ouverture, de 7h au coucher du soleil (+45 min) : l'avion peut voler. */
function periodeDeVol() {
  const date = dateLocale(todayIso());
  if (!ouvertureReelle(date, etat.club)) return false;
  const coucher = etat.meteo?.jours?.[0]?.sunset;
  const h = heureCourante();
  return h >= 7 && h <= (coucher ? heureDecimale(coucher) + 0.75 : 20);
}

/** Interroge souvent quand l'avion peut voler et que l'accueil est à l'écran, rarement sinon. */
function planifierAvion() {
  clearTimeout(minuteurAvion);
  majSuiviPosition();
  if (document.hidden || $("#vue-semaine").hidden) return;
  // Avion en vue : 10 s (= la copie du relais ; le MLAT donne une position toutes les ~5 s).
  const enVue = (etat.avion?.avions?.length ?? 0) > 0;
  const delai = enVue ? 10000 : periodeDeVol() ? 15000 : 120000;
  minuteurAvion = setTimeout(async () => { await chargerAvion(); planifierAvion(); }, delai);
}

function rendreAvion(el) {
  const d = etat.avion;
  const a = d?.avions?.[0];
  let valeur;
  let detail;
  if (!d) {
    valeur = `<span class="mt-attente">Recherche du signal…</span>`;
    detail = "";
  } else if (!a) {
    const vu = lireDernierVu();
    valeur = d.erreur ? "Suivi indisponible" : "L'avion n'est pas en vol (ou trop bas pour être vu)";
    detail = (d.erreur
      ? `<p class="mt-detail">Le relais ne répond pas (${echapper(d.erreur)}).</p>`
      : "")
      + (vu ? `<p class="mt-detail">Dernier signal de ${echapper(vu.avion.immat)} <b>${ilYa(vu.quand)}</b>, à ${heureBruxelles(new Date(vu.quand))} :
          ${vu.avion.altitudeM != null ? `${vu.avion.altitudeM.toLocaleString("fr-BE")} m` : "altitude inconnue"}${phaseVol(vu.avion) ? `, ${phaseVol(vu.avion)}` : ""},
          ${vu.avion.distanceKm.toLocaleString("fr-BE")} km ${versCardinal(vu.avion.relevement)} du terrain.</p>` : "")
      + (d.erreur ? "" : `<p class="mt-detail mt-discret technique">L'avion n'émet pas sa position : il est localisé par triangulation (MLAT),
          qui le perd près du sol (sous 200 à 700 m) et ne le retrouve qu'après le décollage, vers 550 à 1 300 m.
          Entre deux montées, pas de signal : c'est normal.</p>`);
  } else {
    const phase = phaseVol(a);
    const nom = a.club ? `${a.immat}` : `${a.type ?? "Avion"} ${a.immat ?? ""}`;
    valeur = `${a.club ? "L'avion du club vole" : `Avion ${echapper(nom.trim())}`} · ${a.auSol ? "au sol" : `<b class="mono">${a.altitudeM != null ? a.altitudeM.toLocaleString("fr-BE") : "—"} m</b>`}${phase && !a.auSol ? ` · ${phase}` : ""}`;
    const age = a.ageS != null ? Math.round(a.ageS + (Date.now() - new Date(d.recu).getTime()) / 1000) : null;
    detail = `<p class="mt-detail">${a.distanceKm.toLocaleString("fr-BE")} km ${versCardinal(a.relevement)} du terrain
        ${a.vitesseKmh != null ? `· ${vv(a.vitesseKmh)} ${uniteVent()}` : ""}
        ${age != null && age > SIGNAL_PERIME_S ? `· <span class="obs-alerte">position d'il y a ${age} s</span>` : ""}</p>
      <p class="mt-detail mt-discret technique">${a.altitudeFt != null && !a.auSol ? `${a.altitudeFt.toLocaleString("fr-BE")} ft · ` : ""}${age != null ? `signal il y a ${age} s` : ""}</p>
      ${a.club ? "" : `<p class="mt-detail mt-discret">Avion de parachutage près du terrain, mais pas celui du club.</p>`}`;
  }
  el.innerHTML = `
    <span class="mt-label">Avion</span>
    <div class="mt-corps">
      <p class="mt-valeur">${valeur}</p>
      ${detail}
      ${texteDepuisMoi(a)}
      <details class="radar-cadre"${radarOuvert ? " open" : ""}>
        <summary>Voir sur le radar</summary>
        ${svgRadar(d?.avions ?? [])}
        <p class="mt-detail mt-discret technique">Positions ADS-B publiques (${echapper(d?.source ?? "adsb.lol")}), relais toutes les 10 s.
          Positions par triangulation (MLAT) toutes les ~5 s ; direction calculée d'après la trace.
          Cercles tous les 5 km autour de la piste ${String(DZ.qfu).padStart(3, "0")}°/${DZ.qfu + 180}°.</p>
      </details>
      <div class="actions"><button type="button" class="btn secondaire" data-action="me-situer" aria-pressed="${etat.reglages.maPosition}">${etat.reglages.maPosition ? "Ne plus me situer" : "Me situer"}</button></div>
    </div>
    <span class="mt-age">${d?.recu ? ilYa(new Date(d.recu).getTime()) : ""}</span>`;
  el.querySelector(".radar-cadre").addEventListener("toggle", (e) => { radarOuvert = e.target.open; });
  el.querySelector('[data-action="me-situer"]').addEventListener("click", () => {
    const actif = !etat.reglages.maPosition;
    majProfil({ maPosition: actif }, { rerendre: false });
    if (actif) { radarOuvert = true; etat.moiErreur = null; } else { etat.moi = null; }
    majSuiviPosition();
    rendreAvion(el);
  });
}

/** « Depuis toi » : où lever les yeux, calculé sur le téléphone. */
function texteDepuisMoi(a) {
  if (!etat.reglages.maPosition && !etat.moiErreur) return "";
  if (etat.moiErreur) return `<p class="mt-detail">Me situer : ${echapper(etat.moiErreur)}.</p>`;
  const m = etat.moi;
  if (!m) return `<p class="mt-detail mt-attente">Localisation en cours…</p>`;
  const imprecis = m.precisionM > 300 ? ` <span class="mt-discret">(position à ±${Math.round(m.precisionM / 100) / 10} km)</span>` : "";
  if (!a || a.auSol) {
    const d = distanceKm(DZ.lat, DZ.lon, m.lat, m.lon);
    return `<p class="mt-detail"><b>Toi</b> : à ${(Math.round(d * 10) / 10).toLocaleString("fr-BE")} km ${versCardinal(relevement(DZ.lat, DZ.lon, m.lat, m.lon))} du terrain${imprecis}.</p>`;
  }
  const v = vueDepuis(m, a);
  return `<p class="mt-detail"><b>Depuis toi</b> : regarde ${versCardinal(v.relevement)}${v.elevation != null ? `, <b>${v.elevation}°</b> au-dessus de l'horizon` : ""}
    · ${v.distanceKm.toLocaleString("fr-BE")} km au sol${v.directeKm != null ? ` (${v.directeKm.toLocaleString("fr-BE")} km en ligne droite)` : ""}${imprecis}.</p>`;
}

/** Radar en SVG : terrain au centre, nord en haut, trace de l'avion, jauge d'altitude jusqu'au largage. */
function svgRadar(avions) {
  const C = 120;
  const R = 108;
  const k = R / RAYON_KM;
  const pos = (lat, lon) => {
    const dist = distanceKm(DZ.lat, DZ.lon, lat, lon);
    const b = (relevement(DZ.lat, DZ.lon, lat, lon) * Math.PI) / 180;
    return [C + Math.sin(b) * dist * k, C - Math.cos(b) * dist * k];
  };
  const anneaux = [5, 10, 15, 20].map((km) => `
    <circle cx="${C}" cy="${C}" r="${km * k}" class="r-anneau"/>
    <text x="${C + 3}" y="${C - km * k + 11}" class="r-km">${km}</text>`).join("");
  const largage = 4000;
  const avionsSvg = avions.map((a) => {
    const [x, y] = pos(a.lat, a.lon);
    const trace = (etat.traces.get(a.hex) ?? []).map((p) => pos(p.lat, p.lon).map((v) => v.toFixed(1)).join(",")).join(" ");
    return `
      ${trace ? `<polyline points="${trace}" class="r-trace${a.club ? " club" : ""}"/>` : ""}
      ${(() => {
        const cap = a.cap ?? capDeTrace(a.hex);
        return cap != null
          ? `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${cap.toFixed(0)})"><path d="M0,-8 L5,6 L0,3 L-5,6 Z" class="r-avion${a.club ? " club" : ""}"/></g>`
          : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" class="r-avion${a.club ? " club" : ""}"/>`;
      })()}
      <text x="${(x + 9).toFixed(1)}" y="${(y + 4).toFixed(1)}" class="r-etiq">${a.auSol ? "sol" : a.altitudeM != null ? `${(a.altitudeM / 1000).toLocaleString("fr-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km` : ""}</text>`;
  }).join("");
  const m = etat.moi;
  const moiSvg = m && distanceKm(DZ.lat, DZ.lon, m.lat, m.lon) <= RAYON_KM
    ? (() => { const [x, y] = pos(m.lat, m.lon); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" class="r-moi"/><text x="${(x + 8).toFixed(1)}" y="${(y + 4).toFixed(1)}" class="r-etiq">toi</text>`; })()
    : "";
  const principal = avions[0];
  const hJauge = 200;
  const yAlt = (m) => 20 + hJauge - (Math.min(m, 4500) / 4500) * hJauge;
  return `
    <svg class="radar" viewBox="0 0 312 240" role="img" aria-label="Radar : position de l'avion autour du terrain">
      <circle cx="${C}" cy="${C}" r="${R}" class="r-fond"/>
      ${anneaux}
      <line x1="${C}" y1="${C - R}" x2="${C}" y2="${C + R}" class="r-axe"/>
      <line x1="${C - R}" y1="${C}" x2="${C + R}" y2="${C}" class="r-axe"/>
      <text x="${C}" y="${C - R - 2}" class="r-nord">N</text>
      <g transform="rotate(${DZ.qfu} ${C} ${C})"><rect x="${C - 2}" y="${C - 9}" width="4" height="18" rx="1" class="r-piste"/></g>
      ${moiSvg}
      ${avionsSvg}
      <g class="r-jauge">
        <rect x="256" y="20" width="10" height="${hJauge}" rx="3" class="r-jauge-fond"/>
        ${principal?.altitudeM != null ? `<rect x="256" y="${yAlt(principal.altitudeM).toFixed(1)}" width="10" height="${(20 + hJauge - yAlt(principal.altitudeM)).toFixed(1)}" rx="3" class="r-jauge-niveau"/>` : ""}
        <line x1="250" y1="${yAlt(largage)}" x2="272" y2="${yAlt(largage)}" class="r-largage"/>
        <text x="275" y="${yAlt(largage) + 4}" class="r-km">4 km</text>
        <text x="275" y="${20 + hJauge + 4}" class="r-km">sol</text>
      </g>
    </svg>`;
}

/** Note sous la liste : d'où vient le calendrier affiché. */
function rendreNoteCalendrier(el) {
  const jours = etat.club?.jours ?? [];
  if (!jours.length) {
    el.textContent = "Jours d'ouverture habituels du club : une fermeture exceptionnelle n'y figure pas. Vérifie sur la page météo du club.";
    return;
  }
  const dernier = jours.map((j) => j.date).sort().at(-1);
  const fermes = etat.meteo.jours
    .map((j) => dateLocale(j.date))
    .filter((d) => fermeParLeClub(d, etat.club))
    .map((d) => `${JOURS_FR[d.getDay()].toLowerCase()} ${d.getDate()} ${MOIS_FR[d.getMonth()]}`);
  el.textContent = `Jours d'ouverture annoncés par le club jusqu'au ${Number(dernier.slice(8))} ${MOIS_FR[Number(dernier.slice(5, 7)) - 1]} ; ensuite, jours habituels.`
    + (fermes.length ? ` Le club est fermé : ${fermes.join(", ")}.` : "");
}

// ------------------------------------------------------------
// Vue Semaine
// ------------------------------------------------------------
function texteAccord(a) {
  return a ? `${a.favorables}/${a.total}` : "—";
}

/** « dont 2 partielles » : sources favorables qui ne fournissent pas toutes les données légales. */
function textePartielles(a) {
  return a?.partielles ? `dont ${a.partielles} partielle${a.partielles > 1 ? "s" : ""}` : "";
}

/**
 * « La réponse d'abord » : le prochain de MES jours qui saute, avec mon
 * niveau et ma marge. Jamais de case vide : à défaut, le moins mauvais.
 */
function rendreReponse(jours) {
  const el = $("#reponse");
  if (!jours.length) { el.hidden = true; return; }
  const mes = jours.filter((j) => j.dispo);
  const vert = mes.find((j) => j.verdictJour === "vert");
  const orange = mes.find((j) => j.verdictJour === "orange");
  const choix = vert ?? orange ?? mes[0] ?? null;
  const s = seuilsActifs();
  el.hidden = false;
  if (!choix) {
    el.className = "reponse neutre";
    el.innerHTML = `
      <span class="rep-titre">Aucun de tes jours n'est ouvert cette semaine</span>
      <span class="rep-detail">Le club ouvre ${jours.map((j) => `${JOURS_COURTS[j.date.getDay()].toLowerCase()} ${j.date.getDate()}`).join(", ")}. Change « Mes jours » dans les réglages.</span>`;
    el.onclick = () => { rendreReglages(); basculerVue("reglages"); };
    return;
  }
  const titre = vert ? "Prochain jour qui saute" : orange ? "Aucun jour franc · le plus jouable" : "Aucun jour favorable sur 7 jours";
  const fenetre = texteFenetre(choix.meilleureFenetre);
  const type = CARBURANTS[etat.reglages.trajet?.carburant] ? etat.reglages.trajet.carburant : "diesel";
  const dep = etat.reglages.trajet
    ? conseilDeplacement({ verdict: choix.verdictJour, duree: choix.meilleureFenetre?.duree ?? 0, confiance: choix.confiance,
        echeanceJours: choix.index, prixLitre: prixPour(etat.carburant, type), trajet: etat.reglages.trajet })
    : null;
  el.className = `reponse ${choix.verdictJour}`;
  el.innerHTML = `
    <span class="rep-titre">${titre}${etat.reglages.niveauChoisi ? ` · ${echapper(s.label)}` : ""}</span>
    <span class="rep-jour"><span aria-hidden="true">${VERDICT_SYMBOLE[choix.verdictJour]}</span> ${JOURS_FR[choix.date.getDay()]} ${choix.date.getDate()} ${MOIS_FR[choix.date.getMonth()]}</span>
    <span class="rep-verdict"><strong>${VERDICT_TEXTE[choix.verdictJour]}</strong>${fenetre ? ` <span class="mono">${fenetre}</span>` : ""}</span>
    <span class="rep-meta">
      <span>${echeanceEnClair(choix.index)}</span>
      <span>${confianceEnClair(choix)}</span>
      ${choix.ouverture.source === "club" ? `<span>jour confirmé par le club</span>` : ""}
      ${choix.accordFenetre ? `<span class="technique"><b class="mono">${texteAccord(choix.accordFenetre)}</b> sources ${textePartielles(choix.accordFenetre)}</span>` : ""}
    </span>
    ${!vert && choix.motif ? `<span class="rep-detail">${echapper(choix.motif.clair)}</span>` : ""}
    ${dep ? `<span class="rep-detail rep-dep dep-${dep.niveau}">${dep.titre}</span>` : ""}
    ${s.marge > 0 ? `<span class="rep-detail">Avec ta marge de prudence : vent limité à ${vv(s.ventMax)} ${uniteVent()} au lieu de ${vv(s.ventMaxReglement)}</span>` : ""}`;
  el.onclick = () => ouvrirJour(choix.index);
  el.setAttribute("aria-label", `${titre} : ${JOURS_FR[choix.date.getDay()]} ${choix.date.getDate()}, ${VERDICT_TEXTE[choix.verdictJour]}${fenetre ? `, ${fenetre}` : ""}`);
}

function rendreSemaine() {
  const jours = joursOuvertsScores();
  $("#niveau-actif").textContent = seuilsActifs().label;
  const prenom = etat.reglages.prenom;
  $("#salut").hidden = !prenom;
  if (prenom) $("#salut").textContent = `Salut ${prenom}${etat.reglages.sauts != null ? ` · ${etat.reglages.sauts} saut${etat.reglages.sauts > 1 ? "s" : ""}` : ""}`;
  rendreReponse(jours);
  rendreClub($("#mt-club"));
  rendreObsCompacte($("#mt-obs"));
  rendreAvion($("#mt-avion"));
  rendreNoteCalendrier($("#note-calendrier"));

  const conteneur = $("#jours");
  conteneur.innerHTML = "";
  if (jours.length === 0) {
    conteneur.innerHTML = `
      <div class="vide">
        <strong>Aucun jour d'ouverture</strong> dans les 7 prochains jours.
        Le club ouvre habituellement les week-ends et jours fériés de mars à
        mi-décembre, plus les vendredis dès 16h de mai à septembre.
      </div>`;
  }

  for (const j of jours) {
    const carte = document.createElement("button");
    carte.className = `carte-jour ${j.verdictJour}${j.precision === "regional" ? " lointain" : ""}${j.dispo ? "" : " hors-dispo"}`;
    const fenetre = texteFenetre(j.meilleureFenetre);
    const bande = j.heures.map(({ h, score }) => {
      const hauteur = score.accord.total ? Math.max(12, r((score.accord.favorables / score.accord.total) * 100)) : 100;
      return `<span class="bande-h ${score.verdict}" title="${h.heure}h · ${VERDICT_TEXTE[score.verdict]} · ${texteAccord(score.accord)} sources favorables ${textePartielles(score.accord)}">
        <i style="height:${hauteur}%"></i><em>${h.heure % 2 === 0 ? h.heure : ""}</em></span>`;
    }).join("");
    const etiquettes = [
      j.dispo ? "" : `<span class="etiq-jour">Pas dans mes jours</span>`,
      j.ouverture.type === "ferie" ? `<span class="etiq-jour">Férié</span>` : "",
      j.ouverture.type === "club" ? `<span class="etiq-jour">Ouverture exceptionnelle</span>` : "",
      j.ouverture.pointMeteo ? `<span class="etiq-jour">Point météo ${echapper(j.ouverture.pointMeteo)}</span>` : "",
      j.precision === "regional" || j.index >= 3 ? `<span class="etiq-jour">Prévision lointaine</span>` : "",
      rendreTendance(j.tendance),
    ].join("");

    carte.innerHTML = `
      <span class="cj-ligne">
        <span class="cj-quand"><span class="cj-nom">${JOURS_COURTS[j.date.getDay()]}</span><span class="cj-date">${j.date.getDate()} ${MOIS_FR[j.date.getMonth()]}</span></span>
        <span class="cj-verdict"><span class="cj-symbole" aria-hidden="true">${VERDICT_SYMBOLE[j.verdictJour]}</span><strong>${VERDICT_TEXTE[j.verdictJour]}</strong></span>
        <span class="cj-fenetre">${fenetre ?? "—"}</span>
        <span class="cj-accord technique">${j.accordFenetre ? `<b>${texteAccord(j.accordFenetre)}</b>` : ""}</span>
      </span>
      ${etiquettes.trim() || j.motif ? `<span class="cj-infos">${etiquettes}${j.motif ? `<span class="cj-motif" title="${echapper(j.motif.technique)}">${echapper(j.motif.clair)}</span>` : ""}</span>` : ""}
      ${j.dispo ? `<span class="bande" aria-hidden="true">${bande}</span>` : ""}`;
    carte.setAttribute("aria-label",
      `${JOURS_FR[j.date.getDay()]} ${j.date.getDate()} — ${VERDICT_TEXTE[j.verdictJour]}` +
      `${fenetre ? `, ${fenetre}` : ""}${j.accordFenetre ? `, ${texteAccord(j.accordFenetre)} sources favorables ${textePartielles(j.accordFenetre)}` : ""}` +
      `${j.dispo ? "" : ", pas dans tes jours"}`);
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
  const type = CARBURANTS[etat.reglages.trajet?.carburant] ? etat.reglages.trajet.carburant : "diesel";
  const c = conseilDeplacement({ ...params, prixLitre: prixPour(etat.carburant, type), trajet: etat.reglages.trajet });
  // Le trajet est celui du membre (réglages) : rien n'est affiché sans lui,
  // et chaque élément seulement s'il est connu.
  let cout = "";
  if (c.cout) {
    const parties = [
      `${r(c.cout.km)} km`,
      c.cout.minutes != null ? texteDuree(c.cout.minutes) : null,
      c.cout.euros != null ? `~${c.cout.euros} €` : null,
    ].filter(Boolean).join(" · ");
    const origine = etat.carburant?.source === "statbel" ? "prix officiel du jour" : "dernier prix officiel connu";
    const titre = c.cout.euros != null ? ` title="${CARBURANTS[type].label} à ${c.cout.prixLitre.toFixed(3)} €/L — ${origine}"` : "";
    cout = `<span class="dep-cout"${titre}>${parties}</span>`;
  }
  el.className = `deplacement dep-${c.niveau}`;
  el.hidden = false;
  el.innerHTML = `
    <div class="dep-haut">
      <strong class="dep-titre">${c.titre}</strong>
      ${cout}
    </div>
    <p class="dep-detail">${c.detail}</p>`;
}

function texteDuree(minutes) {
  const h = Math.floor(minutes / 60);
  const m = r(minutes - h * 60);
  return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
}

/** Sur une journée limite, le club peut poser une barrière d'expérience. */
function afficherAvertissementExperience(el, verdict) {
  const concerne = verdict === "orange";
  el.hidden = !concerne;
  if (concerne) {
    const sauts = etat.reglages.sauts;
    el.innerHTML = `Journée limite : le club peut demander un <strong>nombre minimum de sauts</strong>
      pour monter dans l'avion<span class="technique">, et le RT peut durcir les limites (RSB §3.4.2)</span>.
      ${sauts != null ? `Tu as <strong class="mono">${sauts}</strong> saut${sauts > 1 ? "s" : ""} : ` : ""}<a href="${LIENS.briefing}" target="_blank" rel="noopener">${sauts != null ? "compare avec la limite de sauts du club" : "Voir la limite de sauts du club"}</a>.`;
  }
}

/**
 * Pourquoi : les règles en cause sur la journée, avec le nombre d'heures
 * concernées. Seulement des statuts calculés, rien d'estimé.
 */
function rendrePourquoi(el, info) {
  if (info.verdictJour === "vert") { el.hidden = true; return; }
  const compte = new Map();
  for (const { score } of info.heures) {
    for (const regle of score.regles) {
      if (regle.statut === "ok") continue;
      const cle = `${regle.id}|${regle.statut}`;
      const c = compte.get(cle) ?? { id: regle.id, label: regle.label, statut: regle.statut, source: regle.source, heures: 0 };
      c.heures += 1;
      compte.set(cle, c);
    }
  }
  const lignes = [...compte.values()].sort((a, b) => (a.statut === "violee" ? -1 : 0) - (b.statut === "violee" ? -1 : 0) || b.heures - a.heures).slice(0, 4);
  el.hidden = !lignes.length;
  el.innerHTML = lignes.map((l) => `
    <li class="${l.statut === "violee" ? "bloquant" : "limite"}">
      <span>${echapper(regleEnClair(l))}</span>
      <small>pendant ${l.heures} h sur ${info.heures.length}<span class="technique"> · ${echapper(l.label)} — ${LIBELLE_STATUT[l.statut]} · ${echapper(l.source)}</span></small>
    </li>`).join("");
}

/** Heure par heure, en clair : verdict, vent, et ce qui coince. */
function rendreHeures(el, toutes, premierSaut) {
  el.innerHTML = toutes.map(({ h, score }, i) => {
    const ss = sourcesAffichees(score);
    const vent = plage(ss.map((s) => s.conditions.vent), vv);
    const raf = plage(ss.map((s) => s.conditions.rafales ?? (s.conditions.rafalesAbsentesSignifientCalme ? s.conditions.vent : null)), vv);
    const enCause = score.regles.filter((x) => x.statut !== "ok")
      .sort((a, b) => (a.statut === "violee" ? -1 : 0) - (b.statut === "violee" ? -1 : 0));
    const actif = h.heure === etat.heureSelectionnee;
    const raisons = actif ? enCause.map(regleEnClair) : enCause.slice(0, 1).map(regleEnClair);
    return `<button type="button" class="heure ${score.verdict}" data-heure="${h.heure}" aria-pressed="${actif}">
      <span class="heure-h">${i === 0 && premierSaut > h.heure ? heureMinutes(premierSaut) : `${h.heure}h`}</span>
      <span class="heure-s" aria-label="${VERDICT_TEXTE[score.verdict]}">${VERDICT_SYMBOLE[score.verdict]}</span>
      <span class="heure-txt">${vent ? `vent <b>${vent}</b>` : "vent —"}${raf && raf !== vent ? `, rafales <b>${raf}</b>` : ""} ${uniteVent()}
        ${raisons.map((t) => `<span class="heure-raison">${echapper(t)}</span>`).join("")}
        ${actif && !enCause.length ? `<span class="heure-raison">Tout est bon pour ton niveau</span>` : ""}</span>
    </button>`;
  }).join("");
  el.onclick = (e) => {
    const cible = e.target.closest("[data-heure]");
    if (!cible) return;
    etat.heureSelectionnee = Number(cible.dataset.heure);
    rendreJour();
  };
}

function rendreJour() {
  const seuils = seuilsActifs();
  const jour = etat.meteo.jours[etat.jourSelectionne];
  const info = joursOuvertsScores().find((j) => j.index === etat.jourSelectionne);
  if (!jour || !info) return basculerVue("semaine");
  const estAujourdhui = jour.date === todayIso();

  $("#jour-titre").textContent =
    `${JOURS_FR[info.date.getDay()]} ${info.date.getDate()} ${MOIS_FR[info.date.getMonth()]}`;
  const o = info.ouverture;
  const texteOuverture = o.source === "club"
    ? `Ouverture confirmée par le club${o.start ? `, début prévu à ${o.start}` : ""}${o.pointMeteo ? ` · point météo à ${o.pointMeteo}` : ""}`
    : o.type === "vendredi" ? "Le club ouvre à 16h" : "Le club ouvre à 8h30";
  $("#jour-soustitre").textContent = `${texteOuverture} · sauts du lever au coucher du soleil (${jour.sunrise ? heureMinutes(heureDecimale(jour.sunrise)) : "—"} – ${heureMinutes(heureDecimale(jour.sunset))}) · ${echeanceEnClair(info.index)}`;

  $("#jour-verdict").className = `hero ${info.verdictJour}`;
  $("#jour-verdict-texte").innerHTML =
    `<span aria-hidden="true">${VERDICT_SYMBOLE[info.verdictJour]}</span> ${VERDICT_TEXTE[info.verdictJour]}`;
  const fenetre = texteFenetre(info.meilleureFenetre);
  $("#jour-verdict-quand").innerHTML = (fenetre
    ? `De <strong>${fenetre.replace(" → ", "</strong> à <strong>")}</strong>`
    : "Aucun créneau de 2 heures d'affilée")
    + `<br><span class="hero-confiance">${confianceEnClair(info)}</span>`
    + `<br><span class="hero-precision technique">Données : ${info.precision === "hr" ? PRECISION_TEXTE.hr + (info.heures.some((x) => x.score.sources.some((src) => src.type === "taf")) ? " + TAF Charleroi" : "") : info.precision === "regional" ? PRECISION_TEXTE.regional + " (moins précis)" : "1,3-2,2 km puis 7-10 km"}</span>`;
  $("#jour-jauge").innerHTML = info.accordFenetre ? `
    <span class="jauge-valeur">${texteAccord(info.accordFenetre)}</span>
    <span class="jauge-label">sources<br>favorables${info.accordFenetre.partielles ? `<br>${textePartielles(info.accordFenetre)}` : ""}</span>` : "";

  $("#jour-creneaux").innerHTML = info.creneaux
    .map((c) => {
      const f = texteFenetre(c.fenetre);
      return `<span class="badge ${c.verdict}">${c.label}${f ? ` · ${f}` : ""}</span>`;
    })
    .join("");

  rendrePourquoi($("#jour-pourquoi"), info);
  const marge = $("#jour-marge");
  marge.hidden = !(seuils.marge > 0);
  if (seuils.marge > 0) {
    marge.textContent = `Limite de vent appliquée : ${vv(seuils.ventMax)} ${uniteVent()} — ta marge de ${vv(seuils.marge)} ${uniteVent()} sous la limite du règlement (${vv(seuils.ventMaxReglement)} ${uniteVent()}).`;
  }
  $("#legende-unite").textContent = uniteVent();

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

  rendreHeures($("#jour-heures"), toutes, Math.min(...info.creneaux.map((c) => c.debut)));
  $("#jour-technique").open = etat.reglages.expert || $("#jour-technique").open;
  rendreMatrice(toutes, estAujourdhui);
  const sel = toutes.find((x) => x.h.heure === etat.heureSelectionnee) ?? toutes[0];
  if (sel) rendreDetailHeure(sel, seuils);
}

// ------------------------------------------------------------
// Tableau horaire
// ------------------------------------------------------------
const tempsCourt = (c) => (c.orage ? "TS" : c.cb ? (c.convectif ?? "CB") : c.precip ? "RA" : c.brouillard ? "FG" : null);

const LIGNES = [
  { cle: "verdict", label: "Verdict" },
  { cle: "accord", label: "Sources ✓" },
  { regle: "ventNiveau", label: "Vent moyen", val: (ss) => plage(ss.map((s) => s.conditions.vent), vv) },
  { regle: "rafales", label: "Rafales", val: (ss) => plage(ss.map((s) => s.conditions.rafales ?? (s.conditions.rafalesAbsentesSignifientCalme ? s.conditions.vent : null)), vv) },
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
  { regle: "orage", label: "Orage", val: (ss) => (ss.some((s) => s.conditions.orage) ? "TS" : ss.some((s) => s.conditions.cb) ? (ss.some((s) => s.conditions.convectif === "CB") ? "CB" : "TCU") : "—") },
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
    : `<li class="ok">Toutes les règles respectées pour « ${echapper(seuils.label)} » (${[`${texteAccord(score.accord)} sources favorables`, textePartielles(score.accord)].filter(Boolean).join(", ")})</li>`;

  // Règles, avec leur source réglementaire.
  $("#facteurs").innerHTML = score.regles.map((x) => `
    <div class="facteur f-${x.statut === "violee" ? "bloquant" : x.statut !== "ok" ? "limite" : x.total ? "ok" : "na"}">
      <span class="f-point" aria-hidden="true"></span>
      <span class="f-label">${echapper(x.label)} <em class="f-tag">${echapper(x.source)}</em></span>
      <strong class="f-valeur">${x.statut === "ok" && !x.total ? "sans donnée" : LIBELLE_STATUT[x.statut]}</strong>
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
    const ok = s.favorable;
    const enEchec = Object.values(s.resultats).some((res) => res.statut === "echec");
    const raf = c.rafales ?? (c.rafalesAbsentesSignifientCalme ? c.vent : null);
    const plafond = c.plafond != null ? court(c.plafond) : c.coucheBasse ? "?" : c.plafondAuMoins ? ">2k" : "—";
    const nom = s.type === "modele" ? `${s.nom} <small>${s.maille}</small>` : s.nom;
    return `<tr class="${ok ? "src-oui" : enEchec ? "src-non" : "src-limite"}">
      <th scope="row">${nom}</th>
      <td>${vv(c.vent)}</td><td>${vv(raf)}</td>
      <td>${plafond}</td><td>${c.visibilite != null ? court(Math.min(c.visibilite, 99000)) : "—"}</td>
      <td>${tempsCourt(c) ?? "—"}</td>
      <td class="src-verdict">${s.partielle ? "~" : ok ? "✓" : enEchec ? "✕" : "▲"}</td></tr>`;
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
    <p class="note-hypotheses">Vent en ${uniteVent()}, distances en m (k = km). Plafond « &gt;2k » : le modèle ne prévoit aucune couche ≥ 5/8 sous 2 km ;
      « ? » : couche basse ≥ 5/8 dont le modèle ne fournit pas la base (non estimée).
      « ~ » : source partielle — elle ne contredit aucune règle, mais ne fournit pas toutes les données légales (base des nuages ou visibilité).
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
    <div class="profil-entete"><span>Alt. AGL</span><span>Vent (${uniteVent()})</span><span>T°</span></div>
    ${lignes.map((l) => `
    <div class="niveau">
      <div class="niv-alt"><strong>${l.agl} m</strong></div>
      <div class="niv-vent">
        <span class="fleche-icone" style="transform: rotate(${rotationFleche(l.dir)}deg)">➤</span>
        <b>${vv(l.vent)}</b><small>${cardinal(l.dir)}</small>
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
    <div class="ligne"><span>Vent (${echapper(s?.nom ?? "—")})</span><strong>${cardinal(dir)} ${r(dir)}° · ${vv(vent)} ${uniteVent()}</strong></div>
    <div class="ligne"><span>Traversier</span><strong>${vv(vp.traversier)} ${uniteVent()}</strong></div>
    <div class="ligne"><span>De face</span><strong>${vv(vp.face)} ${uniteVent()}</strong></div>
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
const segment = (cle, valeur, label, actif) =>
  `<button type="button" class="segment" data-${cle}="${valeur}" aria-pressed="${actif}">${label}</button>`;

function rendreReglages() {
  const p = etat.reglages;
  $("#reglage-prenom").value = p.prenom;
  $("#reglage-sauts").value = p.sauts ?? "";
  $("#reglage-niveau").innerHTML = Object.entries(NIVEAUX_PRATIQUE)
    .map(([cle, n]) => `<option value="${cle}"${cle === p.niveau ? " selected" : ""}>${n.label}</option>`)
    .join("");
  $("#reglage-jours").innerHTML = [1, 2, 3, 4, 5, 6, 0]
    .map((d) => `<label class="jour-case"><input type="checkbox" data-jour="${d}"${p.jours[d] ? " checked" : ""}><span>${JOURS_SEMAINE[d]}</span></label>`).join("")
    + `<label class="jour-case large"><input type="checkbox" data-jour="feries"${p.jours.feries ? " checked" : ""}><span>jours fériés</span></label>`;

  const s = seuilsActifs();
  const champ = $("#reglage-marge");
  champ.max = Math.min(MARGE_MAX, s.ventMaxReglement - 5);
  champ.value = p.marge;
  $("#reglage-marge-unite").textContent = "km/h";
  $("#reglage-vent-borne").textContent =
    `Limite du règlement pour « ${s.label} » : ${s.ventMaxReglement} km/h (RSB §3.4.2). Avec ta marge : ${s.ventMax} km/h`
    + (etat.reglages.unite !== "kmh" ? ` (${vv(s.ventMax)} ${uniteVent()})` : "") + ". Une marge ne peut que durcir.";
  $("#reglage-resume").innerHTML = `
    <li>Vent moyen et rafales ≤ <strong>${s.ventMax} km/h</strong>${s.marge > 0 ? ` (marge de ${s.marge} km/h)` : ""}</li>
    <li>Vent moyen ≤ <strong>${LEGAL_BE.ventMoyenMaxSol} km/h</strong> (25 kts, loi)</li>
    <li>Base des nuages ≥ <strong>${LEGAL_BE.plafondMinAGL} m</strong> (3000 ft) · visibilité ≥ <strong>3 km</strong></li>
    <li>Ouverture : <strong>${s.hauteurOuverture} m</strong> — ${echapper(s.sourceOuverture)}</li>`;

  const t = p.trajet ?? {};
  $("#reglage-trajet-km").value = t.distanceAllerKm ?? "";
  $("#reglage-trajet-min").value = t.dureeAllerMin ?? "";
  $("#reglage-trajet-conso").value = t.consoL100 ?? "";
  $("#reglage-trajet-carburant").innerHTML = Object.entries(CARBURANTS)
    .map(([cle, c]) => `<option value="${cle}"${cle === (t.carburant ?? "diesel") ? " selected" : ""}>${c.label}</option>`).join("");

  $("#reglage-expert").checked = p.expert;
  $("#reglage-theme").innerHTML = Object.entries(THEMES).map(([cle, l]) => segment("theme", cle, l, cle === p.theme)).join("");
  $("#reglage-unite").innerHTML = Object.entries(UNITES_VENT).map(([cle, u]) => segment("unite", cle, u.label, cle === p.unite)).join("");
}

/** Applique une modification du profil : validée, enregistrée, affichée. */
function majProfil(modif, { rerendre = true } = {}) {
  etat.reglages = normaliserProfil({ ...etat.reglages, ...modif });
  sauverReglages();
  if (rerendre) rendreReglages();
  appliquerTheme();
}

/** Mode expert : les éléments `.technique` ne s'affichent que pour qui le demande. */
function appliquerExpert() {
  document.body.classList.toggle("expert", etat.reglages.expert);
}

function message(texte) {
  $("#reglage-message").textContent = texte;
}

function brancherReglages() {
  $("#reglage-prenom").addEventListener("change", (e) => majProfil({ prenom: e.target.value }));
  $("#reglage-sauts").addEventListener("change", (e) => {
    const v = Number(e.target.value);
    majProfil({ sauts: e.target.value !== "" && Number.isInteger(v) && v >= 0 ? v : null });
  });
  $("#reglage-niveau").addEventListener("change", (e) => majProfil({ niveau: e.target.value, niveauChoisi: true }));
  $("#reglage-marge").addEventListener("change", (e) => {
    const v = Math.round(Number(e.target.value));
    majProfil({ marge: Number.isFinite(v) ? Math.max(0, Math.min(Number(e.target.max), v)) : 0 });
  });
  $("#reglage-jours").addEventListener("change", (e) => {
    const cle = e.target.dataset.jour;
    if (cle == null) return;
    majProfil({ jours: { ...etat.reglages.jours, [cle]: e.target.checked } });
  });
  $("#reglage-expert").addEventListener("change", (e) => { majProfil({ expert: e.target.checked }); appliquerExpert(); });
  $("#reglage-theme").addEventListener("click", (e) => {
    const v = e.target.closest("[data-theme]")?.dataset.theme;
    if (v) majProfil({ theme: v });
  });
  $("#reglage-unite").addEventListener("click", (e) => {
    const v = e.target.closest("[data-unite]")?.dataset.unite;
    if (v) majProfil({ unite: v });
  });

  // Trajet : un champ vide ou invalide efface la valeur, rien n'est supposé.
  const champsTrajet = { "#reglage-trajet-km": "distanceAllerKm", "#reglage-trajet-min": "dureeAllerMin", "#reglage-trajet-conso": "consoL100" };
  for (const [selecteur, cle] of Object.entries(champsTrajet)) {
    $(selecteur).addEventListener("change", (e) => {
      const v = Number(String(e.target.value).replace(",", "."));
      const trajet = { ...(etat.reglages.trajet ?? {}) };
      if (e.target.value !== "" && Number.isFinite(v) && v > 0) trajet[cle] = v;
      else { delete trajet[cle]; e.target.value = ""; }
      majProfil({ trajet }, { rerendre: false });
    });
  }
  $("#reglage-trajet-carburant").addEventListener("change", (e) => {
    majProfil({ trajet: { ...(etat.reglages.trajet ?? {}), carburant: e.target.value } }, { rerendre: false });
  });

  $("#reglage-exporter").addEventListener("click", async () => {
    const code = exporterProfil(etat.reglages);
    $("#reglage-code").value = code;
    try {
      await navigator.clipboard.writeText(code);
      message("Code copié. Colle-le dans « Coller un code » sur ton autre appareil.");
    } catch {
      $("#reglage-code").select();
      message("Copie automatique impossible : le code est sélectionné ci-dessus, copie-le à la main.");
    }
  });
  $("#reglage-importer").addEventListener("click", () => {
    const p = importerProfil($("#reglage-code").value);
    if (!p) { message("Code illisible : vérifie qu'il commence par V4K2- et qu'il est complet."); return; }
    etat.reglages = p;
    sauverReglages();
    rendreReglages();
    appliquerTheme();
    appliquerExpert();
    $("#reglage-code").value = "";
    message("Profil importé.");
  });
  $("#reglage-effacer").addEventListener("click", () => {
    if ($("#reglage-effacer").dataset.confirme !== "1") {
      $("#reglage-effacer").dataset.confirme = "1";
      $("#reglage-effacer").textContent = "Confirmer : tout effacer";
      return;
    }
    try { localStorage.clear(); } catch { /* stockage indisponible */ }
    location.reload();
  });

  brancherBienvenue();
}

// ------------------------------------------------------------
// Bienvenue : premier lancement (prénom, niveau, sauts)
// ------------------------------------------------------------
function rendreBienvenue() {
  $("#bv-niveaux").innerHTML = Object.entries(NIVEAUX_PRATIQUE)
    .map(([cle, n]) => segment("niveau", cle, n.label, false)).join("");
}

function brancherBienvenue() {
  let niveau = null;
  $("#bv-niveaux").addEventListener("click", (e) => {
    const cle = e.target.closest("[data-niveau]")?.dataset.niveau;
    if (!NIVEAUX_PRATIQUE[cle]) return;
    niveau = cle;
    for (const b of $("#bv-niveaux").querySelectorAll("[data-niveau]")) b.setAttribute("aria-pressed", String(b.dataset.niveau === cle));
    $("#bv-ok").disabled = false;
  });
  const terminer = (modif) => {
    majProfil({ ...modif, niveauChoisi: true }, { rerendre: false });
    basculerVue("semaine");
    rendreSemaine();
  };
  $("#bv-ok").addEventListener("click", () => {
    const sauts = Number($("#bv-sauts").value);
    terminer({ niveau, prenom: $("#bv-prenom").value, sauts: $("#bv-sauts").value !== "" && Number.isInteger(sauts) && sauts >= 0 ? sauts : null });
  });
  $("#bv-passer").addEventListener("click", () => terminer({ niveau: "tandem" }));
}

// ------------------------------------------------------------
// Navigation, thème, fraîcheur
// ------------------------------------------------------------
function basculerVue(nom) {
  for (const v of ["bienvenue", "semaine", "jour", "reglages"]) {
    $(`#vue-${v}`).hidden = v !== nom;
  }
  window.scrollTo({ top: 0 });
  planifierAvion();
}

function appliquerTheme() {
  let nuit;
  const choix = etat.reglages.theme;
  const aujourdHui = etat.meteo?.jours?.[0];
  const hd = heureCourante();
  if (choix === "nuit" || choix === "jour") {
    nuit = choix === "nuit";
  } else if (aujourdHui?.sunrise && aujourdHui?.sunset) {
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
  // Une source absente se dit : le verdict repose alors sur moins de voix.
  const manquants = etat.aeroCharge
    ? [etat.aero.taf ? null : "TAF", etat.aero.metar ? null : "METAR"].filter(Boolean) : [];
  const absents = manquants.length ? ` · ${manquants.join(" et ")} ${AERODROME.station} indisponible${manquants.length > 1 ? "s" : ""}` : "";
  const echec = etat.echecRechargement ? ` · dernière tentative de mise à jour échouée (${etat.echecRechargement})` : "";
  if (ageMin > AGE_PERIME_MIN) {
    maj.innerHTML = `⚠️ <strong>Prévisions pas mises à jour depuis ${r(ageMin / 60)} h</strong> (dernière fois à ${heureBruxelles(date)}) — vérifie ta connexion avant de te fier au verdict.`;
    maj.classList.add("perime");
  } else {
    maj.innerHTML = `Prévisions mises à jour à ${heureBruxelles(date)}${echec ? " · la dernière mise à jour a échoué" : ""}
      <span class="technique"><br>${echapper(liste)}${echapper(absents)}${echapper(echec)}</span>`;
    maj.classList.remove("perime");
  }
}

function rafraichirVueCourante() {
  if (!$("#vue-jour").hidden) rendreJour();
  else if (!$("#vue-semaine").hidden) rendreSemaine();
}

// ------------------------------------------------------------
// Rechargement : la page reste vivante entre deux ouvertures (TWA/WebAPK),
// les données sont donc rechargées quand l'app revient à l'écran. Un
// rechargement réussi équivaut à relancer l'app ; un rechargement raté
// laisse les données en place, avec leur heure réelle et la cause affichée.
// ------------------------------------------------------------
let derniereTentative = 0;
let rechargementEnCours = false;

async function rechargerDonnees() {
  if (rechargementEnCours) return;
  rechargementEnCours = true;
  derniereTentative = Date.now();
  try {
    const [meteo, aero, club] = await Promise.allSettled([chargerMeteo(), chargerAero(), chargerClub(RELAIS_CLUB)]);
    if (club.status === "fulfilled") etat.club = club.value;
    if (aero.status === "fulfilled") {
      etat.aero = aero.value;
      etat.aeroCharge = true;
    }
    if (meteo.status === "fulfilled") {
      // Le jour affiché est retrouvé par sa date : après minuit, les index glissent.
      const dateSel = etat.meteo.jours[etat.jourSelectionne]?.date;
      etat.meteo = meteo.value;
      etat.echecRechargement = null;
      if (dateSel) {
        const index = etat.meteo.jours.findIndex((j) => j.date === dateSel);
        if (index >= 0) etat.jourSelectionne = index;
        else {
          etat.jourSelectionne = null;
          etat.heureSelectionnee = null;
          if (!$("#vue-jour").hidden) basculerVue("semaine");
        }
      }
      appliquerTheme();
    } else {
      etat.echecRechargement = meteo.reason?.message ?? "erreur réseau";
    }
    afficherFraicheur();
    rafraichirVueCourante();
  } finally {
    rechargementEnCours = false;
  }
}

/** Remet l'âge des données à jour et recharge si elles ont assez vieilli. */
function verifierFraicheur() {
  if (document.hidden || !etat.meteo) return;
  afficherFraicheur();
  if (doitRecharger(derniereTentative)) rechargerDonnees();
}

// ------------------------------------------------------------
// Initialisation
// ------------------------------------------------------------
async function init() {
  appliquerTheme();
  appliquerExpert();

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
  document.addEventListener("visibilitychange", planifierAvion);
  brancherReglages();

  // METAR + TAF et page du club lancés tout de suite, branchés dès qu'ils arrivent.
  const aeroPromesse = chargerAero();
  chargerClub(RELAIS_CLUB).then((club) => {
    etat.club = club;
    if (etat.meteo) rafraichirVueCourante();
  });
  derniereTentative = Date.now();

  try {
    const [meteo, carburant] = await Promise.allSettled([chargerMeteo(), prixDiesel()]);
    if (meteo.status !== "fulfilled") throw meteo.reason;
    etat.meteo = meteo.value;
    etat.carburant = carburant.status === "fulfilled" ? carburant.value : null;
    appliquerTheme();
    afficherFraicheur();
    rendreSemaine();
    $("#chargement").hidden = true;
    if (etat.reglages.niveauChoisi) {
      basculerVue("semaine");
    } else {
      rendreBienvenue();
      basculerVue("bienvenue");
    }
    chargerAvion().then(planifierAvion);

    etat.aero = await aeroPromesse;
    etat.aeroCharge = true;
    afficherFraicheur();
    if (etat.aero.metar || etat.aero.taf) rafraichirVueCourante();

    document.addEventListener("visibilitychange", verifierFraicheur);
    window.addEventListener("pageshow", verifierFraicheur);
    window.addEventListener("focus", verifierFraicheur);
    setInterval(verifierFraicheur, 60000);
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
