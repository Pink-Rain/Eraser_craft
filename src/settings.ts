/**
 * Les réglages de l'extension, choisis par un administrateur derrière la roue crantée
 * (Administration › Extensions) : pour chaque atelier, l'index où lire les items et les colonnes
 * dont il a besoin, et les types d'items qu'il reconnaît. Rien n'est écrit en dur : les colonnes
 * se créent dans Google Sheets, sous le nom qu'on veut, puis se choisissent ici.
 *
 * Module commun aux pages et à la partie serveur (aucun import).
 */

export type CuisineSettings = {
  /** L'index où lire les ingrédients (« objects » : l'Index des items). */
  index: string
  /** La colonne du nom de l'item, pour retrouver sa ligne. */
  nameColumn: string
  /** La Nutrition d'un ingrédient pris cru, et pris cuit. */
  rawColumn: string
  cookedColumn: string
  /** Les portions qu'un ingrédient apporte au plat. */
  portionsColumn: string
  /** Les types d'items qui sont des ingrédients, et ceux qui sont des contenants. */
  ingredientTypes: string[]
  containerTypes: string[]
  /** Le type et le sous-type du plat créé. */
  resultType: string
  resultSubtype: string
}

export type AlchimieSettings = {
  index: string
  nameColumn: string
  /** La famille d'une base (Potion · Ingestion, Venin · Blessure…). */
  familyColumn: string
  /** Combien de doses donne un récipient. */
  dosesColumn: string
  baseTypes: string[]
  ingredientTypes: string[]
  vesselTypes: string[]
  /** Le type du consommable créé ; son sous-type est la famille de la base. */
  resultType: string
}

export type CraftSettings = { cuisine: CuisineSettings; alchimie: AlchimieSettings }

export const defaultSettings: CraftSettings = {
  cuisine: {
    index: "objects",
    nameColumn: "Nom",
    rawColumn: "Nutrition cru",
    cookedColumn: "Nutrition cuit",
    portionsColumn: "Portions",
    ingredientTypes: ["Ingrédient"],
    containerTypes: ["Contenant"],
    resultType: "Nourriture",
    resultSubtype: "Plat",
  },
  alchimie: {
    index: "objects",
    nameColumn: "Nom",
    familyColumn: "Famille",
    dosesColumn: "Doses",
    baseTypes: ["Base"],
    ingredientTypes: ["Alchimie"],
    vesselTypes: ["Récipient"],
    resultType: "Consommable",
  },
}

const text = (value: unknown, fallback: string, max = 120) => typeof value === "string" ? value.trim().slice(0, max) : fallback
const list = (value: unknown, fallback: string[]) => Array.isArray(value)
  ? [...new Set(value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim().slice(0, 80)).filter(Boolean))].slice(0, 20)
  : fallback

/** Des réglages relus (stockés, ou envoyés par la page) : ce qui manque prend sa valeur d'origine. */
export function normalizeSettings(value: unknown): CraftSettings {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const cuisine = raw.cuisine && typeof raw.cuisine === "object" ? raw.cuisine as Record<string, unknown> : {}
  const alchimie = raw.alchimie && typeof raw.alchimie === "object" ? raw.alchimie as Record<string, unknown> : {}
  const c = defaultSettings.cuisine
  const a = defaultSettings.alchimie
  return {
    cuisine: {
      index: text(cuisine.index, c.index) || c.index,
      nameColumn: text(cuisine.nameColumn, c.nameColumn) || c.nameColumn,
      rawColumn: text(cuisine.rawColumn, c.rawColumn),
      cookedColumn: text(cuisine.cookedColumn, c.cookedColumn),
      portionsColumn: text(cuisine.portionsColumn, c.portionsColumn),
      ingredientTypes: list(cuisine.ingredientTypes, c.ingredientTypes),
      containerTypes: list(cuisine.containerTypes, c.containerTypes),
      resultType: text(cuisine.resultType, c.resultType),
      resultSubtype: text(cuisine.resultSubtype, c.resultSubtype),
    },
    alchimie: {
      index: text(alchimie.index, a.index) || a.index,
      nameColumn: text(alchimie.nameColumn, a.nameColumn) || a.nameColumn,
      familyColumn: text(alchimie.familyColumn, a.familyColumn),
      dosesColumn: text(alchimie.dosesColumn, a.dosesColumn),
      baseTypes: list(alchimie.baseTypes, a.baseTypes),
      ingredientTypes: list(alchimie.ingredientTypes, a.ingredientTypes),
      vesselTypes: list(alchimie.vesselTypes, a.vesselTypes),
      resultType: text(alchimie.resultType, a.resultType),
    },
  }
}

export type Atelier = keyof CraftSettings

/** Les colonnes qu'un atelier lit dans son index (en plus du nom). */
export function atelierColumns(settings: CraftSettings, atelier: Atelier): string[] {
  if (atelier === "cuisine") return [settings.cuisine.rawColumn, settings.cuisine.cookedColumn, settings.cuisine.portionsColumn].filter(Boolean)
  return [settings.alchimie.familyColumn, settings.alchimie.dosesColumn].filter(Boolean)
}

/** Un nom comparé sans accents, casse ni espaces doubles. */
export function fold(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr")
}

/** Les valeurs que le catalogue donne en plus des colonnes réglées (noms qu'aucune colonne ne porte). */
export const META = { name: "__nom", type: "__type", subtype: "__sous-type", icon: "__icone" } as const

/** Ce que l'atelier sait d'un item de son index : nom replié → colonne → valeur (et `META`). */
export type AtelierCatalog = Record<string, Record<string, string>>
