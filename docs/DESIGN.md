# Vent4000 — Mise à niveau du design (conception actée le 2026-10-25)

Ce document est la décision, écrite **avant** le code. Il ne change ni les
règles, ni les seuils, ni le calcul du verdict (voir README). Il change ce
que le membre voit en premier, et ce qui est à lui.

## 1. Décisions de le mainteneur

| Point | Décision |
|---|---|
| Direction de l'accueil | **« La réponse d'abord »** : la réponse en haut, le contexte en dessous |
| Périmètre | Accueil, vue Jour, Réglages, thème et typographie |
| Personnalisation | **« Mon profil »** retenu ; le reste laissé à mon conseil (§5) |
| Stockage | **Téléphone seulement**, sans compte ; export/import par code pour changer d'appareil |

Direction visuelle de base inchangée (validée en août) : « instrument de
vol », dense mais hiérarchisé, **vert / ambre / rouge réservés aux
données**, accent interactif bleu, aucun orange décoratif.

## 2. Accueil — « la réponse d'abord »

De haut en bas :

1. **Barre** : marque, puce de niveau, trajet (Maps), réglages. Inchangée, avec le prénom si renseigné (« Salut le mainteneur »).
2. **Réponse** — « Prochain jour qui saute pour toi » : jour, verdict, fenêtre, nombre de sources, « J+n ».
   - Calculée avec **mon niveau, mes jours et ma prudence** (§5).
   - Aucun jour qui saute : « Aucun jour favorable dans les 7 jours », puis le jour le moins mauvais et son motif. Jamais de case vide.
   - Un jour ouvert aujourd'hui mais déjà fini ou fermé par le club n'est jamais proposé.
3. **Maintenant** — un seul bloc au lieu de deux cartes :
   - ligne Club : état repris mot pour mot, point météo, start (inchangé fonctionnellement) ;
   - ligne Charleroi (METAR) : vent, rafales, plafond, visibilité, âge ; METAR brut repliable ;
   - l'état du club n'est **jamais mélangé** au verdict de l'app ; les deux restent séparés visuellement.
4. **Jours d'ouverture** : lignes compactes (jour, verdict, fenêtre, mini-bande horaire, x/y sources). Un tap ouvre la vue Jour. Le détail (motif, tendance, étiquettes) passe en seconde ligne.
5. **Pied** : lien « Page météo du club » (limite de sauts, membres), sources, version.

Le choix du niveau au premier lancement reste, mais devient un écran d'accueil
dédié (profil rapide : prénom facultatif + niveau), pas une carte au milieu de la liste.

## 3. Vue Jour

Principe : **verdict → fenêtre → pourquoi → détail**, chaque niveau replié sous le précédent.

- En tête : verdict et fenêtre (déjà là), puis le conseil de déplacement personnalisé (§5).
- « Pourquoi » : les règles en cause en clair, une ligne chacune, avec leur source réglementaire (déjà dans le détail horaire, à remonter).
- Tableau horaire règle × heure : conservé tel quel (c'est l'outil de précision), mais défilement horizontal avec la colonne des règles figée et l'heure courante marquée.
- Détail d'une heure, sources, boussole de piste : repliables, ordre inchangé.
- L'avertissement « journée limite » affiche le nombre de sauts du profil à côté du lien vers la limite du club (§5).

## 4. Thème et typographie

- **Lisibilité dehors** d'abord : contraste ≥ 7:1 pour les valeurs clés (vent, fenêtre), ≥ 4,5:1 ailleurs, y compris en thème jour (le texte `encre-3` sera éclairci/assombri s'il passe sous 4,5:1).
- **Échelle typographique** à 6 tailles (12 / 13,5 / 15 / 17 / 22 / 32), au lieu des tailles ponctuelles actuelles ; chiffres toujours en IBM Plex Mono tabulaire, titres en Barlow Condensed.
- **Cibles tactiles ≥ 44 px**, espacement sur la grille de 4 px déjà en place.
- **Thème** : choix manuel nuit / jour / auto (auto = comportement actuel). Respect de `prefers-reduced-motion`. Marges `safe-area` pour l'encoche.
- Verdict toujours **redondant** avec la couleur (●  ▲  ✕), pour le daltonisme (déjà le cas).
- Moins de cadres empilés : séparateurs fins à l'intérieur d'un bloc plutôt qu'une carte par info.

## 5. Personnalisation (conseil retenu)

Ce que l'app sait déjà faire : niveau, trajet, carburant, vent max personnel
(plus strict seulement, borné au palier du brevet — `seuilsActifs`).

| Fonction | Décision | Pourquoi |
|---|---|---|
| **Mon profil** : prénom, niveau, **nombre de sauts** | **Oui** (choix de le mainteneur) | Le club décide en sauts, pas en brevet. Le nombre de sauts s'affiche à côté du lien vers la limite du club les jours limites. Il ne change **jamais** le verdict. |
| **Mes jours** : jours où je peux venir | **Oui** | Réduit le bruit ; alimente « prochain jour qui saute pour toi » et le conseil de trajet. Simple : cases lun→dim (+ fériés). Un jour décoché reste consultable, réduit. |
| **Ma prudence** | **Déjà là, à mieux montrer** | C'est le vent max personnel existant. Présenté comme une marge (« 0 / −3 / −5 km/h sous ma limite »), borné au palier du brevet, motif « ta marge perso » affiché quand elle décide. Jamais plus souple. |
| **Mon écran** | **En partie** : thème (nuit/jour/auto) et **unité du vent** (km/h, nœuds, m/s) | Les textes de loi parlent en nœuds, le METAR aussi ; l'affichage change, **pas les seuils** (conversion exacte, tests). Choisir et réordonner les blocs : non (réglages à ne plus s'y retrouver, peu de valeur). |
| Alertes / notifications | **Non, pour l'instant** | Demande un serveur. À revoir avec le script Telegram prévu (README, pistes v2). |

Règles non négociables : une personnalisation ne peut **jamais** assouplir
une limite du règlement ; tout ce qui modifie un verdict est annoncé comme
tel (« selon ta marge perso ») ; aucune donnée personnelle ne quitte le téléphone.

## 6. Stockage

- `localStorage`, un seul objet versionné `vent4000.reglages` (`version: 2`), migration depuis le format actuel (les réglages existants ne sont pas perdus).
- Valeurs relues avec validation (types, bornes) : une valeur invalide retombe sur le défaut, jamais d'erreur.
- **Exporter / importer** : un code texte (JSON compact encodé) à copier-coller pour passer sur un autre appareil. Aucun serveur, aucun compte.
- Mode privé / stockage indisponible : l'app fonctionne avec les défauts, sans message d'erreur.

## 7. Réglages — nouvelle organisation

Cinq sections repliables : **Moi** (prénom, niveau, nombre de sauts) · **Mes jours** · **Ma prudence** · **Trajet** (distance, durée, conso, carburant) · **Affichage** (thème, unité du vent) · en pied : exporter / importer, remise à zéro. Pas de page longue : une section ouverte à la fois.

## 8. Ordre de réalisation

1. Jetons de design (échelle, contrastes, thème manuel) + tests de contraste.
2. Stockage versionné + profil (prénom, nombre de sauts, jours) + export/import + tests.
3. Accueil « réponse d'abord » (bloc Réponse, bloc Maintenant, lignes compactes).
4. Vue Jour (hiérarchie, conseil personnalisé).
5. Réglages (sections, marge perso, unité du vent).
6. Vérification sur téléphone réel (écran clair en plein jour, nuit) puis version 2.5.0.

Chaque étape : tests verts, relue dans Chrome en largeur téléphone, commit
séparé. Aucun APK sans demande.

## 9. Points ouverts

- **Unité du vent** : la rafale « 43 km/h » devient « 23 kt » ; faut-il afficher les deux ? (proposition : l'unité choisie en grand, l'autre en petit.)
- **Mes jours** : les jours fériés comptent-ils comme des week-ends ? (proposition : oui, une case « fériés » à part.)
- **Nombre de sauts** : à mettre à jour à la main ; pas de rappel automatique.
