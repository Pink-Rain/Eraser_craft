/**
 * La partie serveur de l'extension (`/api/extensions/craft/serveur/<chemin>`). Eraser lui confie
 * la requête avec `eraser` : le compte qui demande, le chemin, `store` (ses données sur le serveur
 * partagé, portée `extension:craft`) et, depuis l'API 4, `indexes` (la lecture des index par
 * Eraser). Elle n'appelle jamais Google elle-même.
 *
 *   GET  reglages                    les réglages des ateliers (tout compte)
 *   PUT  reglages                    les enregistrer (administrateur)
 *   GET  index                       les index et leurs colonnes, pour les réglages (administrateur)
 *   GET  catalogue/<atelier>         ce que l'atelier lit dans son index : nom → colonnes choisies
 *   GET  carnet/<atelier>/<perso>    le carnet d'un personnage ; PUT : le remplacer
 *   GET  en-cours/<perso>            la création pas terminée d'un personnage ; PUT / DELETE
 *
 * Un joueur n'ouvre pas les index : le catalogue ne lui donne que les colonnes réglées pour
 * l'atelier, des items de cet index.
 */
import { META, atelierColumns, fold, normalizeSettings, type Atelier, type AtelierCatalog, type CraftSettings } from "./settings"
import { normalizeBook, normalizePending } from "./book"

type Store = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> }
type IndexSummary = { key: string; title: string; tabs: Array<{ name: string; columns: string[] }> }
type IndexContent = { key: string; title: string; tabs: Array<{ name: string; headers: string[]; rows: string[][] }> }
type ServerEraser = {
  api: number
  account: { uid: string; displayName: string; role: "admin" | "mj" | "joueur" }
  path: string[]
  store: Store
  indexes?: { list(): Promise<IndexSummary[]>; read(key: string): Promise<IndexContent | null> }
}

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8" } })
const refuse = (message: string, status: number) => json({ error: message }, status)
const ateliers: Atelier[] = ["cuisine", "alchimie"]
const isAtelier = (value: string | undefined): value is Atelier => ateliers.includes(value as Atelier)
/** Un identifiant de personnage tel qu'Eraser les écrit (lettres, chiffres, tirets, deux-points). */
const validOwner = (value: string | undefined): value is string => typeof value === "string" && /^[\w:.-]{1,120}$/.test(value)

async function readSettings(store: Store): Promise<CraftSettings> {
  const raw = await store.get("reglages").catch(() => null)
  if (!raw) return normalizeSettings(null)
  try { return normalizeSettings(JSON.parse(raw)) } catch { return normalizeSettings(null) }
}

/** Les catalogues lus récemment : l'index est déjà en mémoire chez Eraser, mais pas son tri. */
const catalogs = new Map<string, { at: number; value: Promise<AtelierCatalog> }>()
const CATALOG_MS = 30_000

function catalogOf(eraser: ServerEraser, index: string, nameColumn: string, columns: string[]): Promise<AtelierCatalog> {
  const cacheKey = JSON.stringify([index, nameColumn, columns])
  const known = catalogs.get(cacheKey)
  if (known && Date.now() - known.at < CATALOG_MS) return known.value
  const value = (async () => {
    const content = await eraser.indexes!.read(index)
    const catalog: AtelierCatalog = {}
    if (!content) return catalog
    for (const tab of content.tabs) {
      const headers = tab.headers.map(fold)
      const nameAt = headers.indexOf(fold(nameColumn))
      if (nameAt < 0) continue
      const at = columns.map((column) => [column, headers.indexOf(fold(column))] as const).filter(([, position]) => position >= 0)
      // Ce qui sert à montrer l'item quand le personnage ne l'a pas (noter une recette) : son type et son icône.
      const meta = ([[META.type, "type"], [META.subtype, "sous-type"], [META.icon, "icone"]] as const).map(([key, header]) => [key, headers.indexOf(header)] as const).filter(([, position]) => position >= 0)
      for (const row of tab.rows) {
        const name = fold(row[nameAt] ?? "")
        if (!name || catalog[name]) continue
        catalog[name] = Object.fromEntries([
          [META.name, String(row[nameAt]).trim().slice(0, 160)],
          ...meta.map(([key, position]) => [key, String(row[position] ?? "").trim().slice(0, 300)]),
          ...at.map(([column, position]) => [column, String(row[position] ?? "").trim().slice(0, 200)]),
        ])
      }
    }
    return catalog
  })()
  value.catch(() => catalogs.delete(cacheKey))
  catalogs.set(cacheKey, { at: Date.now(), value })
  return value
}

async function body(request: Request): Promise<unknown> {
  try { return await request.json() } catch { return null }
}

async function handle(request: Request, eraser: ServerEraser): Promise<Response> {
  const [section, first, second] = eraser.path
  const method = request.method.toUpperCase()
  const admin = eraser.account.role === "admin"

  if (section === "reglages") {
    if (method === "GET") return json({ settings: await readSettings(eraser.store) })
    if (method === "PUT") {
      if (!admin) return refuse("Seul un administrateur règle les ateliers.", 403)
      const settings = normalizeSettings(await body(request))
      await eraser.store.set("reglages", JSON.stringify(settings))
      catalogs.clear()
      return json({ settings })
    }
  }

  if (section === "index" && method === "GET") {
    if (!admin) return refuse("Seul un administrateur règle les ateliers.", 403)
    if (!eraser.indexes) return refuse("Cet Eraser ne prête pas encore ses index aux extensions : mets-le à jour.", 409)
    return json({ indexes: await eraser.indexes.list() })
  }

  if (section === "catalogue" && method === "GET" && isAtelier(first)) {
    if (!eraser.indexes) return refuse("Cet Eraser ne prête pas encore ses index aux extensions : mets-le à jour.", 409)
    const settings = await readSettings(eraser.store)
    const own = settings[first]
    try {
      return json({ catalog: await catalogOf(eraser, own.index, own.nameColumn, atelierColumns(settings, first)) })
    } catch (error) {
      return refuse(`L'index de l'atelier n'a pas pu être lu (${error instanceof Error ? error.message : "erreur inconnue"}).`, 502)
    }
  }

  if (section === "carnet" && isAtelier(first) && validOwner(second)) {
    const key = `carnet:${first}:${second}`
    if (method === "GET") {
      const raw = await eraser.store.get(key)
      return json({ book: raw ? normalizeBook(first, safeParse(raw)) : [] })
    }
    if (method === "PUT") {
      const book = normalizeBook(first, await body(request))
      const serialized = JSON.stringify(book)
      if (serialized.length > 19_500) return refuse("Le carnet est plein : supprime quelques recettes d'abord.", 413)
      await eraser.store.set(key, serialized)
      return json({ book })
    }
  }

  if (section === "en-cours" && validOwner(first)) {
    const key = `en-cours:${first}`
    if (method === "GET") {
      const raw = await eraser.store.get(key)
      return json({ pending: raw ? normalizePending(safeParse(raw)) : null })
    }
    if (method === "PUT") {
      const pending = normalizePending(await body(request))
      if (!pending) return refuse("Note de création invalide.", 400)
      await eraser.store.set(key, JSON.stringify(pending))
      return json({ pending })
    }
    if (method === "DELETE") {
      await eraser.store.remove(key)
      return json({ pending: null })
    }
  }

  return refuse("Chemin inconnu.", 404)
}

function safeParse(raw: string): unknown {
  try { return JSON.parse(raw) } catch { return null }
}

export default {
  async fetch(request: Request, eraser: ServerEraser) {
    try {
      return await handle(request, eraser)
    } catch (error) {
      const code = error instanceof Error ? error.message : ""
      if (code === "EXTENSION_DATA_UNAVAILABLE") return refuse("Le serveur partagé d'Eraser n'est pas configuré ici : les ateliers ne peuvent rien garder.", 503)
      throw error
    }
  },
}
