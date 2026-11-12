/**
 * Les carnets (Cuisine : recettes ; Alchimie : formules) et la note d'une création en cours.
 * Une recette nomme ses items (pas leurs identifiants) : elle survit à l'inventaire qui change,
 * et se recharge d'après ce que le personnage a sur lui.
 *
 * Module commun aux pages et à la partie serveur (qui vérifie tout ce qu'elle garde).
 */
import type { Atelier } from "./settings"

export type RecipeOrigin = "reussie" | "notee"

export type CuisineRecipe = {
  id: string
  name: string
  from: RecipeOrigin
  fav: boolean
  /** Le contenant (son nom), ou `null` : sans contenant. */
  pot: string | null
  lines: Array<{ name: string; cooked: boolean }>
}

export type AlchimieRecipe = {
  id: string
  name: string
  from: RecipeOrigin
  fav: boolean
  base: string
  ings: string[]
  pot: string | null
}

export type Recipe = CuisineRecipe | AlchimieRecipe

/** Ce qu'une création retire de l'inventaire, case par case, tel que la page l'a vu. */
export type PendingTake = { slotId: string; itemId: string; name: string; quantity: number; count: number }

/**
 * Une création en deux temps (l'item, puis le retrait de ce qui a servi). Gardée avant la
 * première écriture, effacée après la dernière : si Eraser se ferme entre les deux, l'atelier
 * propose de terminer.
 */
export type PendingCreation = { atelier: Atelier; name: string; created: boolean; take: PendingTake[]; at: string }

const MAX_RECIPES = 80
const MAX_LINES = 30
const name = (value: unknown, max = 160) => typeof value === "string" ? value.trim().slice(0, max) : ""
const id = (value: unknown) => typeof value === "string" && /^[\w-]{1,40}$/.test(value) ? value : Math.random().toString(36).slice(2, 12)

export function normalizeBook(atelier: Atelier, value: unknown): Recipe[] {
  if (!Array.isArray(value)) return []
  const out: Recipe[] = []
  for (const raw of value.slice(0, MAX_RECIPES)) {
    if (!raw || typeof raw !== "object") continue
    const entry = raw as Record<string, unknown>
    const common = { id: id(entry.id), name: name(entry.name) || "Sans nom", from: entry.from === "notee" ? "notee" as const : "reussie" as const, fav: entry.fav === true, pot: name(entry.pot) || null }
    if (atelier === "cuisine") {
      const lines = Array.isArray(entry.lines) ? entry.lines.slice(0, MAX_LINES).flatMap((line) => {
        if (!line || typeof line !== "object") return []
        const item = line as Record<string, unknown>
        const itemName = name(item.name)
        return itemName ? [{ name: itemName, cooked: item.cooked !== false }] : []
      }) : []
      if (lines.length) out.push({ ...common, lines })
    } else {
      const base = name(entry.base)
      const ings = Array.isArray(entry.ings) ? entry.ings.slice(0, MAX_LINES).map((ing) => name(ing)).filter(Boolean) : []
      if (base && ings.length) out.push({ ...common, base, ings })
    }
  }
  return out
}

export function normalizePending(value: unknown): PendingCreation | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  if (raw.atelier !== "cuisine" && raw.atelier !== "alchimie") return null
  const take = Array.isArray(raw.take) ? raw.take.slice(0, 60).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const item = entry as Record<string, unknown>
    const slotId = name(item.slotId, 120)
    const quantity = Number(item.quantity)
    const count = Number(item.count)
    if (!slotId || !Number.isInteger(quantity) || !Number.isInteger(count) || count < 1 || quantity < count) return []
    return [{ slotId, itemId: name(item.itemId, 120), name: name(item.name), quantity, count }]
  }) : []
  return { atelier: raw.atelier, name: name(raw.name) || "Sans nom", created: raw.created === true, take, at: name(raw.at, 40) || new Date().toISOString() }
}

export const newRecipeId = () => Math.random().toString(36).slice(2, 12)
