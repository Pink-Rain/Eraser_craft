// Les réglages, les carnets et la partie serveur de l'extension, et ce qu'elle attend d'Eraser
// (ses emplacements, ce que `create-item` accepte), avec les modules d'Eraser comme à l'exécution.
import assert from "node:assert/strict"
import { after, test } from "node:test"

import { loadEraser, loadOwn, vite } from "./eraser.mjs"

after(() => vite.close())

test("des réglages incomplets ou abîmés reprennent leurs valeurs d'origine", async () => {
  const { normalizeSettings, defaultSettings } = await loadOwn("src/settings.ts")
  assert.deepEqual(normalizeSettings(null), defaultSettings)
  const settings = normalizeSettings({ cuisine: { rawColumn: "  Nutri crue ", ingredientTypes: ["Légume", "", 3, "Légume"] }, alchimie: { index: "" } })
  assert.equal(settings.cuisine.rawColumn, "Nutri crue")
  assert.deepEqual(settings.cuisine.ingredientTypes, ["Légume"])
  assert.equal(settings.cuisine.cookedColumn, defaultSettings.cuisine.cookedColumn)
  assert.equal(settings.alchimie.index, "objects")
})

test("un carnet ne garde que des recettes complètes", async () => {
  const { normalizeBook, normalizePending } = await loadOwn("src/book.ts")
  const cuisine = normalizeBook("cuisine", [{ id: "a", name: "Ragoût", from: "notee", fav: true, pot: "Bol", lines: [{ name: "Viande", cooked: false }, { name: "" }] }, { name: "Vide", lines: [] }, "rien"])
  assert.equal(cuisine.length, 1)
  assert.deepEqual(cuisine[0], { id: "a", name: "Ragoût", from: "notee", fav: true, pot: "Bol", lines: [{ name: "Viande", cooked: false }] })
  const alchimie = normalizeBook("alchimie", [{ name: "Venin", base: "Sang", ings: ["Ortie", "Ortie"], pot: null }, { name: "Sans base", ings: ["Ortie"] }])
  assert.equal(alchimie.length, 1)
  assert.deepEqual(alchimie[0].ings, ["Ortie", "Ortie"])
  assert.equal(normalizePending({ atelier: "forge" }), null)
  const pending = normalizePending({ atelier: "cuisine", name: "Plat", created: true, take: [{ slotId: "s1", itemId: "i1", name: "Viande", quantity: 2, count: 1 }, { slotId: "s2", quantity: 1, count: 3 }] })
  assert.equal(pending.take.length, 1)
})

function fakeEraser({ role = "joueur", path, indexes } = {}) {
  const data = new Map()
  return {
    data,
    eraser: {
      api: 4,
      account: { uid: "u1", displayName: "Lou", role },
      path,
      store: { get: async (key) => data.get(key) ?? null, set: async (key, value) => { data.set(key, value) }, remove: async (key) => { data.delete(key) } },
      indexes,
    },
  }
}

test("la partie serveur : réglages réservés aux administrateurs, catalogue limité aux colonnes réglées", async () => {
  const server = (await loadOwn("src/server.ts")).default
  const index = {
    key: "objects", title: "Index des items",
    tabs: [
      { name: "Nourriture", headers: ["Nom", "Type", "Icône", "Nutrition cru", "Nutrition cuit", "Portions", "Prix secret"], rows: [["Viande grasse", "Ingrédient", "", "1", "3", "2", "99"], ["", "", "", "", "", "", ""]] },
      { name: "Divers", headers: ["Nom", "Type"], rows: [["Bol en bois", "Contenant"]] },
    ],
  }
  const indexes = { list: async () => [{ key: "objects", title: "Index des items", tabs: index.tabs.map((tab) => ({ name: tab.name, columns: tab.headers })) }], read: async (key) => key === "objects" ? index : null }

  const player = fakeEraser({ path: ["reglages"], indexes })
  assert.equal((await server.fetch(new Request("http://x/", { method: "PUT", body: "{}" }), player.eraser)).status, 403)
  assert.equal((await server.fetch(new Request("http://x/"), { ...player.eraser, path: ["index"] })).status, 403)

  const admin = fakeEraser({ role: "admin", path: ["reglages"], indexes })
  const saved = await server.fetch(new Request("http://x/", { method: "PUT", body: JSON.stringify({ cuisine: { portionsColumn: "Portions" } }) }), admin.eraser)
  assert.equal(saved.status, 200)
  assert.ok(admin.data.get("reglages"))
  const listed = await (await server.fetch(new Request("http://x/"), { ...admin.eraser, path: ["index"] })).json()
  assert.equal(listed.indexes[0].key, "objects")

  const catalog = (await (await server.fetch(new Request("http://x/"), { ...player.eraser, path: ["catalogue", "cuisine"] })).json()).catalog
  assert.deepEqual(catalog["viande grasse"], { "__nom": "Viande grasse", "__type": "Ingrédient", "__icone": "", "Nutrition cru": "1", "Nutrition cuit": "3", "Portions": "2" })
  assert.equal(catalog["bol en bois"]["__type"], "Contenant")
  assert.ok(!JSON.stringify(catalog).includes("Prix secret"), "une colonne non réglée ne sort pas")

  const older = fakeEraser({ path: ["catalogue", "cuisine"] })
  assert.equal((await server.fetch(new Request("http://x/"), older.eraser)).status, 409)
})

test("la partie serveur garde les carnets et la création en cours de chaque personnage", async () => {
  const server = (await loadOwn("src/server.ts")).default
  const { eraser, data } = fakeEraser({ path: ["carnet", "cuisine", "perso-1"] })
  const book = [{ id: "r1", name: "Ragoût", from: "reussie", fav: false, pot: null, lines: [{ name: "Viande", cooked: true }] }]
  assert.equal((await server.fetch(new Request("http://x/", { method: "PUT", body: JSON.stringify(book) }), eraser)).status, 200)
  assert.deepEqual((await (await server.fetch(new Request("http://x/"), eraser)).json()).book, book)
  assert.ok(data.has("carnet:cuisine:perso-1"))
  assert.equal((await server.fetch(new Request("http://x/"), { ...eraser, path: ["carnet", "forge", "perso-1"] })).status, 404)
  assert.equal((await server.fetch(new Request("http://x/"), { ...eraser, path: ["carnet", "cuisine", "../x"] })).status, 404)

  const pending = { atelier: "alchimie", name: "Venin", created: false, take: [{ slotId: "s", itemId: "i", name: "Ortie", quantity: 1, count: 1 }] }
  const path = ["en-cours", "perso-1"]
  await server.fetch(new Request("http://x/", { method: "PUT", body: JSON.stringify(pending) }), { ...eraser, path })
  assert.equal((await (await server.fetch(new Request("http://x/"), { ...eraser, path })).json()).pending.name, "Venin")
  await server.fetch(new Request("http://x/", { method: "DELETE" }), { ...eraser, path })
  assert.equal((await (await server.fetch(new Request("http://x/"), { ...eraser, path })).json()).pending, null)
})

test("Eraser pose les emplacements dont l'extension a besoin", async () => {
  const { extensionSlots, EXTENSION_API_VERSION } = await loadEraser("/lib/extensions.ts")
  assert.ok(EXTENSION_API_VERSION >= 5)
  assert.ok("inventaire.bourse" in extensionSlots)
  assert.ok("administration.extension" in extensionSlots)
})

test("ce que l'extension envoie à create-item passe la vérification d'Eraser", async () => {
  const { itemInstanceInput } = await loadEraser("/lib/item-instance.ts")
  const dish = itemInstanceInput({
    reserve: { count: 4, total: 4, unit: "portion", nutrition: 6 },
    recycle: ["Bol en bois"],
    effectSources: [{ source: "Paprika", text: "1 niveau de sérénité" }],
  })
  assert.deepEqual(dish.reserve, { count: 4, total: 4, unit: "portion", nutrition: 6 })
  assert.deepEqual(dish.recycle, ["Bol en bois"])
  assert.equal(dish.effectSources.length, 1)
  const potion = itemInstanceInput({ reserve: { count: 3, total: 3, unit: "dose" } })
  assert.equal(potion.reserve.unit, "dose")
})

test("un nombre écrit dans une case, et les types reconnus sans accents ni casse", async () => {
  const { numberIn, hasType, plannedTakes } = await loadOwn("src/inventory.ts")
  assert.equal(numberIn("3"), 3)
  assert.equal(numberIn("2,5 portions"), 2)
  assert.equal(numberIn(""), 0)
  assert.equal(numberIn("-4"), 0)
  assert.ok(hasType({ type: "ingredient" }, ["Ingrédient"]))
  assert.ok(!hasType({ type: "" }, ["Ingrédient"]))
  const owned = [{ key: "viande", name: "Viande", quantity: 3, slots: [{ slot: { id: "a", itemId: "v", quantity: 1 } }, { slot: { id: "b", itemId: "v", quantity: 2 } }] }]
  assert.deepEqual(plannedTakes(owned, new Map([["viande", 2]])), [
    { slotId: "a", itemId: "v", name: "Viande", quantity: 1, count: 1 },
    { slotId: "b", itemId: "v", name: "Viande", quantity: 2, count: 1 },
  ])
  assert.equal(plannedTakes(owned, new Map([["viande", 4]])), null)
})
