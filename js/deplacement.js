// ============================================================
// Vent4000 — « Est-ce que ça vaut le déplacement ? »
//
// C'est la question que pose réellement l'app, et elle n'est PAS la même
// que « ça saute ? ». Depuis Bouillon, chaque tentative coûte 226 km,
// ~3 h de route et ~34 € de carburant : une journée orange qu'on tenterait
// sans réfléchir en habitant à 15 minutes devient un pari à 34 €.
//
// ⚠ PÉRIMÈTRE. Les seuils météo, eux, sont sourcés (CIR/GDF-05 et RSB
// FWCP — voir config.js). L'arbitrage « ça vaut le trajet » ne l'est pas
// et ne le sera jamais : c'est une tolérance au risque personnelle, pas
// une règle fédérale. Ce module ne prétend donc pas remplacer le verdict
// du club — il dit sur quoi se baser AVANT que le club ne se prononce,
// et surtout QUAND décider.
//
// Deux faits qui structurent toute la logique :
//
//  1. Le club publie sa banderole météo « le matin même (à partir de 7h10
//     et non la veille) », 14h30 le vendredi (FAQ paraclubnamur.be).
//     Le vrai point de décision est donc le matin du jour J — pas la
//     veille, pas trois jours avant. Tout ce que l'app dit au-delà de J+0
//     sert à PLANIFIER (garder le créneau libre), pas à partir.
//
//  2. Le club pratique le standby plutôt que l'annulation sèche : « soit
//     nous attendrons que les conditions météorologiques s'améliorent au
//     cours de la journée (standby) […] Le parachutisme est un sport de
//     patience » (FAQ). Un déplacement sur journée moyenne n'est donc pas
//     binaire : l'attente sur place fait partie du jeu. C'est ce qui rend
//     une fenêtre LONGUE bien plus précieuse qu'une fenêtre courte, même
//     à verdict égal.
//
// Module 100 % pur : aucune dépendance DOM ni fetch, testable en Node,
// réutilisable par le futur script d'alerte Telegram.
// ============================================================

import { coutAllerRetour } from "./config.js";

/** Fenêtre en dessous de laquelle un retard de créneau suffit à tout perdre. */
export const DUREE_FENETRE_CONFORTABLE = 3; // heures
/** Au-delà, la prévision est trop lointaine pour engager 226 km. */
export const ECHEANCE_PLANIFICATION = 3;    // jours

/**
 * @param {object} p
 * @param {"vert"|"orange"|"rouge"} p.verdict — verdict du jour
 * @param {number} p.duree — durée de la meilleure fenêtre, en heures
 * @param {"haute"|"moyenne"|"faible"|"unique"} p.confiance — accord multi-modèle
 * @param {number} p.echeanceJours — 0 = aujourd'hui
 * @returns {{niveau:string, titre:string, detail:string, cout:object}}
 *   niveau ∈ "partir" | "planifier" | "reconfirmer" | "renoncer"
 */
export function conseilDeplacement({ verdict, duree = 0, confiance = "unique", echeanceJours = 0 }) {
  const cout = coutAllerRetour();
  const aujourdhui = echeanceJours === 0;
  const fenetreConfortable = duree >= DUREE_FENETRE_CONFORTABLE;
  const confianceSolide = confiance === "haute" || confiance === "moyenne";

  // Rien de sautable : la question du déplacement ne se pose pas.
  if (verdict === "rouge" || duree <= 0) {
    return {
      niveau: "renoncer",
      titre: aujourdhui ? "N'y va pas" : "Peu probable",
      detail: aujourdhui
        ? "Aucune fenêtre sautable aujourd'hui selon tes seuils."
        : "Aucune fenêtre sautable prévue ce jour-là. À revoir si la prévision change.",
      cout,
    };
  }

  // Trop loin pour engager le trajet : la prévision bougera encore.
  if (echeanceJours > ECHEANCE_PLANIFICATION) {
    return {
      niveau: "planifier",
      titre: "Trop tôt pour décider",
      detail: `Créneau possible, mais à J+${echeanceJours} la prévision bougera encore. ` +
        "Garde la date de côté et reconfirme en milieu de semaine.",
      cout,
    };
  }

  // Aujourd'hui : c'est le seul moment où « partir » a un sens, parce que
  // c'est le seul où la banderole du club existe déjà (dès 7h10).
  if (aujourdhui) {
    if (verdict === "vert" && confianceSolide && fenetreConfortable) {
      return {
        niveau: "partir",
        titre: "Ça vaut le déplacement",
        detail: `Fenêtre de ${duree} h, modèles d'accord. ` +
          "Vérifie quand même la banderole du club avant de prendre la route.",
        cout,
      };
    }
    const fragilite = !fenetreConfortable
      ? `fenêtre courte (${duree} h)`
      : !confianceSolide ? "modèles peu d'accord" : "conditions justes";
    return {
      niveau: "reconfirmer",
      titre: "Pari ouvert",
      detail: `Sautable mais ${fragilite}. Le club pratique le standby, ` +
        "donc l'attente sur place fait partie du jeu — c'est à toi de dire si ça vaut les " +
        `${cout.euros} € et ${Math.round(cout.minutes / 60)} h de route.`,
      cout,
    };
  }

  // J+1 à J+3 : on planifie, on ne part pas. La décision se prend le matin.
  if (verdict === "vert" && confianceSolide && fenetreConfortable) {
    return {
      niveau: "planifier",
      titre: "Garde le créneau",
      detail: `Fenêtre de ${duree} h qui tient la route. ` +
        "Décision finale le matin même : le club publie sa banderole dès 7h10.",
      cout,
    };
  }
  return {
    niveau: "reconfirmer",
    titre: "À surveiller",
    detail: "Créneau plausible mais fragile. Revérifie la veille, puis le matin même " +
      "avant de faire 113 km.",
    cout,
  };
}
