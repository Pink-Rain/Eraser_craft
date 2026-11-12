/**
 * L'inventaire du personnage vu par un atelier, et tout ce que l'atelier y écrit : toujours par
 * les API d'Eraser (qui vérifient les droits), jamais autrement.
 *
 * Une création se fait en deux temps : le nouvel item d'abord (`create-item`), puis le retrait
 * de ce qui a servi (`set-quantity`, avec la quantité que la page a vue : si l'inventaire a changé
 * entre-temps, Eraser refuse et rien n'est retiré à tort). Entre les deux, une note « création en
 * cours » est gardée par la partie serveur de l'extension.
 */
import type { Eraser } from "@/lib/extension-api"
import type { CharacterInventoryRecord, InventoryContainerRecord, InventoryItemRecord, InventorySlotRecord, InventoryTransferTarget } from "@/lib/inventory-schema"

import type { PendingCreation, PendingTake } from "./book"
import { fold, type Atelier, type AtelierCatalog, type CraftSettings } from "./settings"

/** Un item que le personnage a sur lui, toutes cases confondues (même nom). */
export type OwnedItem = {
  key: string
  name: string
  item: InventoryItemRecord
  slots: Array<{ slot: InventorySlotRecord; container: InventoryContainerRecord }>
  quantity: number
}

export class CraftError extends Error {}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new CraftError(data.error || `Eraser a refusé (${response.status}).`)
  return data
}

export async function loadInventory(eraser: Eraser, characterId: string, reload = false): Promise<CharacterInventoryRecord> {
  const data = await readJson<{ inventory: CharacterInventoryRecord }>(await eraser.eraser(`/api/characters/${encodeURIComponent(characterId)}/inventory${reload ? "?reload=1" : ""}`))
  return data.inventory
}

async function post(eraser: Eraser, characterId: string, body: Record<string, unknown>): Promise<CharacterInventoryRecord> {
  const data = await readJson<{ inventory: CharacterInventoryRecord }>(await eraser.eraser(`/api/characters/${encodeURIComponent(characterId)}/inventory`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }))
  return data.inventory
}

/** Les items du personnage, regroupés par nom (les cases d'une même pile ou de plusieurs sacs). */
export function ownedItems(inventory: CharacterInventoryRecord): OwnedItem[] {
  const byName = new Map<string, OwnedItem>()
  for (const container of inventory.containers) {
    if (container.category === "Bourse") continue
    for (const slot of container.slots) {
      if (!slot.item || slot.quantity < 1) continue
      const key = fold(slot.item.name)
      if (!key) continue
      const known = byName.get(key)
      if (known) {
        known.slots.push({ slot, container })
        known.quantity += slot.quantity
      } else {
        byName.set(key, { key, name: slot.item.name, item: slot.item, slots: [{ slot, container }], quantity: slot.quantity })
      }
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"))
}

export const hasType = (item: { type: string }, types: string[]) => {
  const type = fold(item.type || "")
  return Boolean(type) && types.some((candidate) => fold(candidate) === type)
}

/** Le texte d'un effet, sans sa mise en forme. */
export function plainText(value: string) {
  return value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim()
}

/** Les lignes d'un effet (une par ligne écrite). */
export function effectLines(item: InventoryItemRecord): string[] {
  return plainText(item.effect || "").split("\n").map((line) => line.trim()).filter(Boolean)
}

/** Un nombre écrit dans une case (« 3 », « 2,5 », « 3 portions ») ; 0 si rien. */
export function numberIn(value: string | undefined) {
  const match = /-?\d+(?:[.,]\d+)?/.exec(value ?? "")
  return match ? Math.max(0, Math.floor(Number(match[0].replace(",", ".")))) : 0
}

/* ---------- réglages, catalogue, carnets (partie serveur de l'extension) ---------- */

export async function loadSettings(eraser: Eraser): Promise<CraftSettings> {
  return (await readJson<{ settings: CraftSettings }>(await eraser.server("reglages"))).settings
}

export async function loadCatalog(eraser: Eraser, atelier: Atelier): Promise<AtelierCatalog> {
  return (await readJson<{ catalog: AtelierCatalog }>(await eraser.server(`catalogue/${atelier}`))).catalog
}

export async function serverJson<T>(eraser: Eraser, path: string, init?: { method: string; body?: unknown }): Promise<T> {
  return readJson<T>(await eraser.server(path, init ? { method: init.method, headers: { "content-type": "application/json" }, body: init.body === undefined ? undefined : JSON.stringify(init.body) } : undefined))
}

/* ---------- l'œil des effets (le même que dans l'inventaire) ---------- */

/**
 * L'effet d'un item est caché d'office, comme dans l'inventaire : il se voit quand le joueur l'a
 * montré par l'œil (dans l'inventaire ou dans l'atelier), pour l'une de ses cases.
 */
export function effectHidden(eraser: Eraser, owned: OwnedItem | null) {
  if (!owned) return true
  return !owned.slots.some(({ slot }) => eraser.inventory.effectShown(slot.id))
}

/** Montre ou cache l'effet d'un item, pour toutes ses cases (l'œil de l'inventaire suit). */
export function showEffect(eraser: Eraser, owned: OwnedItem, shown: boolean) {
  eraser.inventory.showEffects(owned.slots.map(({ slot }) => slot.id), shown)
}

/* ---------- créer, retirer, ranger ailleurs ---------- */

/** Ce qu'il faut retirer : `count` exemplaires de chaque item nommé, pris case par case. */
export function plannedTakes(owned: OwnedItem[], counts: Map<string, number>): PendingTake[] | null {
  const takes: PendingTake[] = []
  for (const [key, wanted] of counts) {
    const item = owned.find((candidate) => candidate.key === key)
    if (!item || item.quantity < wanted) return null
    let left = wanted
    for (const { slot } of item.slots) {
      if (left <= 0) break
      const count = Math.min(left, slot.quantity)
      takes.push({ slotId: slot.id, itemId: slot.itemId, name: item.name, quantity: slot.quantity, count })
      left -= count
    }
  }
  return takes
}

/** Le contenant où poser ce qui est créé : l'inventaire classique (plein : Eraser le pose au sol). */
function destinationOf(inventory: CharacterInventoryRecord) {
  const classic = inventory.containers.filter((container) => container.category === "Inventaire")
  return classic.find((container) => !container.custom && container.used < container.capacity)
    ?? classic.find((container) => !container.custom)
    ?? classic[0]
    ?? inventory.containers.find((container) => container.category === "Au sol")
    ?? null
}

export type CreatedItem = {
  name: string
  description: string
  type: string
  subtype: string
  effect: string
  reserve?: { count: number; total: number; unit: "portion" | "dose"; nutrition?: number }
  recycle?: string[]
  effectSources?: Array<{ source: string; text: string }>
}

const pendingPath = (characterId: string) => `en-cours/${encodeURIComponent(characterId)}`

export async function loadPending(eraser: Eraser, characterId: string) {
  return (await serverJson<{ pending: PendingCreation | null }>(eraser, pendingPath(characterId))).pending
}

export async function forgetPending(eraser: Eraser, characterId: string) {
  await serverJson(eraser, pendingPath(characterId), { method: "DELETE" })
}

/**
 * Retire ce qui a servi. Une case qui a changé entre-temps (Eraser répond 409) est laissée :
 * mieux vaut un ingrédient de trop qu'un objet retiré à tort. Rend les noms laissés.
 */
export async function removeTakes(eraser: Eraser, characterId: string, takes: PendingTake[]): Promise<string[]> {
  const skipped: string[] = []
  for (const take of takes) {
    try {
      await post(eraser, characterId, { action: "set-quantity", slotId: take.slotId, quantity: take.quantity - take.count, expectedItemId: take.itemId, expectedQuantity: take.quantity })
    } catch {
      skipped.push(take.name)
    }
  }
  return skipped
}

/**
 * Crée l'item (s'il y en a un), puis retire ce qui a servi. Rend l'inventaire relu, la case du
 * nouvel item et les items qui n'ont pas pu être retirés.
 */
export async function craft(eraser: Eraser, characterId: string, atelier: Atelier, inventory: CharacterInventoryRecord, takes: PendingTake[], created: CreatedItem | null) {
  const note: PendingCreation = { atelier, name: created?.name ?? "", created: false, take: takes, at: new Date().toISOString() }
  await serverJson(eraser, pendingPath(characterId), { method: "PUT", body: note }).catch(() => undefined)
  let slotId: string | null = null
  if (created) {
    const destination = destinationOf(inventory)
    if (!destination) throw new CraftError("Ce personnage n'a pas d'inventaire où ranger ce qui est créé.")
    const before = new Map(inventory.containers.flatMap((container) => container.slots.map((slot) => [slot.id, slot.item?.id ?? ""] as const)))
    const after = await post(eraser, characterId, { action: "create-item", containerId: destination.id, ...created })
    // La case du nouvel item : une case nouvelle, ou une case vide qui a reçu un item de ce nom.
    const slot = after.containers.flatMap((container) => container.slots).find((candidate) => candidate.item && fold(candidate.item.name) === fold(created.name) && before.get(candidate.id) !== candidate.item.id)
    slotId = slot?.id ?? null
    await serverJson(eraser, pendingPath(characterId), { method: "PUT", body: { ...note, created: true } }).catch(() => undefined)
  }
  const skipped = await removeTakes(eraser, characterId, takes)
  await forgetPending(eraser, characterId).catch(() => undefined)
  eraser.inventory?.changed(characterId)
  return { inventory: await loadInventory(eraser, characterId), slotId, skipped }
}

export async function transferTargets(eraser: Eraser, characterId: string): Promise<InventoryTransferTarget[]> {
  return (await readJson<{ transferTargets: InventoryTransferTarget[] }>(await eraser.eraser(`/api/characters/${encodeURIComponent(characterId)}/inventory?targets=1`))).transferTargets
}

export async function transfer(eraser: Eraser, characterId: string, slotId: string, itemId: string, targetId: string) {
  await post(eraser, characterId, { action: "transfer-item", slotId, targetId, expectedItemId: itemId, expectedQuantity: 1 })
  eraser.inventory?.changed(characterId)
  eraser.inventory?.changed(targetId)
}
