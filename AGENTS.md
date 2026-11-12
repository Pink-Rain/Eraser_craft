# Instructions pour les IA travaillant sur Eraser Craft

Eraser Craft est l'extension des ateliers de fabrication d'Eraser (dépôt principal :
`Pink-Rain/Eraser`). Le contrat des extensions est décrit dans la section « Extensions » de
l'`ARCHITECTURE.md` d'Eraser ; elle demande l'**API 4**.

## Ce qui vit où

- `src/boot.tsx` : `activate(eraser)`, petit. Pose le coin « Craft » (`src/corner.tsx`) dans
  l'emplacement `inventaire.bourse` et la roue de réglages (`src/settings-gear.tsx`) dans
  `administration.extension`. Les fenêtres se chargent au premier clic (`import()` → `dist/parts/`).
- `src/cuisine.tsx`, `src/alchimie.tsx` : les ateliers ; `src/atelier.tsx` (chargement commun,
  création interrompue, « Ranger dans ») ; `src/ui.tsx` (icône d'item, résultat du test, carnet,
  infobulles, menu des effets cachés).
- `src/inventory.ts` : tout ce qui lit ou écrit l'inventaire, **uniquement par les API d'Eraser**
  (`create-item` avec `reserve`, `recycle`, `effectSources` ; `set-quantity` avec la quantité vue ;
  `transfer-item` ; `/api/characters/<id>/effects`). Jamais Google.
- `src/server.ts` (→ `dist/server.mjs`) : réglages (écrits par un administrateur), catalogue de
  l'atelier (lu par `eraser.indexes`, filtré aux colonnes réglées : un joueur n'ouvre pas les
  index), carnets par personnage, note de création en cours. Données dans `extension:craft`.
- `src/settings.ts`, `src/book.ts` : modules communs (aucun import), vérifiés côté serveur.
- **Rien n'est écrit en dur** : index, colonnes et types d'items se choisissent derrière la roue
  crantée (Administration › Extensions). Une nouvelle colonne nécessaire = un nouveau réglage.

## Règles des ateliers

- Pas de dés : le test se lance à la table, le joueur choisit le résultat dans la fenêtre.
- Cuisine — réussite : le plat ; échec : Nutrition ÷ 2 (arrondie en dessous) ; réussite critique :
  Nutrition et portions doublées ; échec critique : tout est perdu, pas de plat. Chaque portion
  rend toute la Nutrition. Le contenant est consommé et ajouté au recyclage du plat.
- Alchimie — réussite : la formule ; échec : chaque ingrédient a 75 % de chances de ne pas
  compter ; réussite critique : ingrédients non consommés ; échec critique : tout est perdu. Un
  ingrédient posé deux fois compte deux fois. Le récipient donne les doses.
- Effets cachés : ceux d'Eraser (types réglés dans Administration › Effets cachés), débloqués au
  clic droit, le même réglage que dans l'inventaire.

## Construire, vérifier, publier

- Copie d'Eraser avec ses dépendances : `ERASER_DIR=/chemin/vers/Eraser` ou `./eraser`.
- `npm run build`, `npm run check`, `npm test`, `npm run pack`.
- Publier : incrémenter `version`, réécrire `RELEASE.md`, pousser sur `main` (le workflow publie
  la Release). Si l'extension a besoin d'un Eraser plus récent, publier Eraser d'abord.
