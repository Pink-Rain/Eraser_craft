# Eraser Craft

Extension d'[Eraser](https://github.com/Pink-Rain/Eraser) : les ateliers de fabrication des personnages.
Elle s'ouvre en fenêtre par-dessus la fiche du personnage, depuis le coin « Craft » de l'onglet Inventaire.

> **État : en conception.** Les fenêtres sont dessinées et validées sur maquette ; le code n'est pas encore écrit.

## Les ateliers

| Atelier | Compétence | Ce qui entre | Ce qui sort |
| --- | --- | --- | --- |
| **Maquillage** | Maquillage · Charisme | Des pigments (items de type Pigment), seuls ou mélangés | Une peinture de guerre, ou un nouveau pigment |
| **Cuisine** | Cuisine · Sagesse | Des ingrédients (crus ou cuits) et un contenant | Un plat ou un bocal |
| **Alchimie** | Alchimie · Intelligence | Une base, des ingrédients d'alchimie et un récipient | Une potion, un venin, un onguent ou un gaz |
| **Couture** | Couture · Dextérité | Un patron, des étoffes et des ornements ; ou un vêtement à retoucher | Un équipement |
| **Artisanat** | Artisanat · Intelligence | Un plan, des matériaux et des outils | Un objet, une arme, un outil, ou les récipients des autres ateliers |
| **Œuvrerie** | Selon l'œuvre | Un support, du texte, et des pigments si on veut | Un livre, un parchemin, une peinture ou une carte |

### Principes communs

- **Tout est item.** Ingrédients, bases, contenants, récipients, pigments, étoffes, matériaux : ce sont des
  items de l'inventaire du personnage, reconnus par leur **type** (Pigment, Base, Alchimie…), jamais par un
  sous-type.
- Les items utilisés sont consommés, sauf les **outils** de l'Artisanat, qu'il suffit d'avoir.
- Le résultat est un nouvel item, que le joueur range dans son inventaire, celui de la campagne ou celui d'un
  autre joueur.
- La Cuisine et l'Alchimie ont un **carnet** : les créations réussies, et les recettes notées sans cuisiner
  (données par un PNJ, par exemple).
- Le Maquillage et l'Œuvrerie partagent les pigments. Les couleurs, leurs mélanges, leurs effets de
  maquillage et les émotions des œuvres viennent de l'**Index des couleurs** d'Eraser. Une teinte se
  découvre en la créant ; son effet se débloque à part, par le joueur, quand le MJ le lui dit.

## Comment l'extension se branche sur Eraser

- C'est une extension de l'**API 3** d'Eraser : un module de démarrage (`boot`, `activate(eraser)`) qui pose
  ses composants dans les emplacements d'Eraser et ouvre ses fenêtres avec `eraser.ui.dialog`.
- Elle lit et modifie l'inventaire **uniquement par les API d'Eraser** (`eraser.eraser("/api/…")`), qui
  vérifient les droits. Elle n'appelle jamais Google elle-même.
- Ses propres données (carnets, teintes découvertes, effets débloqués, créations en cours) sont gardées sur
  le serveur partagé, dans la portée `extension:craft`.
- Une création se fait en deux temps : d'abord le nouvel item, ensuite le retrait des items utilisés. Une
  note « création en cours » permet de terminer ou d'annuler proprement si Eraser se ferme au milieu.

### Ce qu'il manque encore côté Eraser

- Un **emplacement** dans l'inventaire du personnage, là où se trouve le coin Craft, qui donne le
  personnage, sa campagne et si on peut le modifier.
- Un **signal** pour dire à la fiche de relire l'inventaire après une création.
- La **liaison** de cette extension dans `linkedExtensions` (`lib/extensions.ts`), avec l'identifiant `craft`.

## Publier

Comme les autres extensions d'Eraser : une Release GitHub qui joint `eraser-extension.json` et
`eraser-extension.pack.gz`, fabriqués par `scripts/pack-extension.mjs`. Eraser d'abord quand l'extension
dépend d'un changement d'Eraser, puis l'extension.
