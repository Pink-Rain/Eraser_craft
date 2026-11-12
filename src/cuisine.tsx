/**
 * La Cuisine : des ingrédients (crus ou cuits) et un contenant, ou aucun, donnent un plat. Chaque
 * portion du plat rend toute sa Nutrition à la barre de rassasiement, d'un clic dans l'inventaire.
 * La conservation est écrite dans l'effet du contenant ; le contenant s'ajoute au recyclage du plat.
 * Les effets des ingrédients suivent les effets cachés d'Eraser (débloqués au clic droit).
 *
 * Le test se lance à la table : le joueur dit ce qu'il a obtenu.
 *   Réussite : le plat. Échec : Nutrition ÷ 2, arrondie en dessous.
 *   Réussite critique : Nutrition et portions doublées. Échec critique : tout est perdu, pas de plat.
 */
import { useState, type ReactElement, type ReactNode } from "react"
import { CookingPot, Drumstick, Plus, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { ExtensionDialogProps } from "@/lib/extension-api"

import { AtelierLoading, Destination, PendingBanner, useAtelier } from "./atelier"
import { newRecipeId, type CuisineRecipe } from "./book"
import { CraftError, craft, effectHidden, effectLines, effectLockable, hasType, numberIn, ownedItems, plannedTakes, type OwnedItem } from "./inventory"
import { META, fold, type AtelierCatalog } from "./settings"
import { BookStrip, EffectList, ItemIcon, ItemRow, ItemTip, Label, LockMenu, Notice, OutcomeAsk, Segmented, colors, type EffectLine, type OutcomeKey } from "./ui"

const accent = colors.cuisine
const MAX = 99

type Line = { key: string; cooked: boolean }
type Shown = { key: string; name: string; type: string; subtype: string; icon?: string; image?: string; owned: OwnedItem | null }
type Result =
  | { fumble: true; lostPot: boolean; skipped: string[] }
  | { fumble: false; label: string; name: string; nutrition: number; portions: number; potEffect: string; potName: string; fx: EffectLine[]; slotId: string | null; itemId: string; skipped: string[] }

/** Un item vu par l'atelier : celui du personnage, à défaut celui de l'index (noter une recette). */
function shownOf(key: string, owned: OwnedItem[], catalog: AtelierCatalog): Shown | null {
  const mine = owned.find((item) => item.key === key)
  if (mine) return { key, name: mine.name, type: mine.item.type, subtype: mine.item.subtype, icon: mine.item.icon, image: mine.item.image, owned: mine }
  const row = catalog[key]
  if (!row) return null
  return { key, name: row[META.name] || key, type: row[META.type] || "", subtype: row[META.subtype] || "", icon: row[META.icon] || "", owned: null }
}

export function CuisineWindow({ eraser, characterId }: ExtensionDialogProps<{ characterId: string }>) {
  const { data, setData, error, setError, saveBook, toggleEffect } = useAtelier<CuisineRecipe>(eraser, characterId, "cuisine")
  const [mode, setMode] = useState<"cook" | "note">("cook")
  const [lines, setLines] = useState<Line[]>([])
  const [pot, setPot] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [query, setQuery] = useState("")
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [notice, setNotice] = useState("")

  if (!data) return <AtelierLoading error={error} />
  const { settings: { cuisine: settings }, catalog, effects } = data
  const owned = ownedItems(data.inventory)
  const cook = mode === "cook"
  const isIngredientType = (type: string) => hasType({ type }, settings.ingredientTypes)
  const isContainerType = (type: string) => hasType({ type }, settings.containerTypes)

  // Les listes : ce que le personnage a ; pour noter une recette, aussi ce que l'index connaît.
  const listOf = (accepts: (type: string) => boolean) => {
    const mine = owned.filter((item) => accepts(item.item.type)).map((item) => shownOf(item.key, owned, catalog)!)
    if (cook) return mine
    const known = new Set(mine.map((item) => item.key))
    const others = Object.keys(catalog).filter((key) => !known.has(key) && accepts(catalog[key][META.type] || "")).map((key) => shownOf(key, owned, catalog)!).sort((a, b) => a.name.localeCompare(b.name, "fr"))
    return [...mine, ...others]
  }
  const folded = fold(query)
  const ingredients = listOf(isIngredientType).filter((item) => !folded || fold(item.name).includes(folded))
  const containers = listOf(isContainerType)

  const used = (key: string) => lines.filter((line) => line.key === key).length
  const left = (key: string) => (owned.find((item) => item.key === key)?.quantity ?? 0) - used(key)
  const values = (key: string) => {
    const row = catalog[key] ?? {}
    return { raw: numberIn(row[settings.rawColumn]), cooked: numberIn(row[settings.cookedColumn]), portions: numberIn(row[settings.portionsColumn]) }
  }
  const gives = (line: Line) => line.cooked ? values(line.key).cooked : values(line.key).raw
  const nutrition = Math.min(MAX, lines.reduce((total, line) => total + gives(line), 0))
  const portions = Math.min(MAX, lines.reduce((total, line) => total + values(line.key).portions, 0))
  const potShown = pot ? shownOf(pot, owned, catalog) : null
  const potEffect = potShown?.owned ? effectLines(potShown.owned.item).join(" ") : ""

  const hiddenFor = (item: Shown) => effectHidden(effects, item)
  // Les effets du plat : ceux des ingrédients débloqués ; « Effet inconnu » pour chacun des autres.
  const fxOf = (keys: string[]): EffectLine[] => [...new Set(keys)].flatMap((key) => {
    const item = shownOf(key, owned, catalog)
    if (!item?.owned) return []
    const text = effectLines(item.owned.item)
    if (!text.length) return []
    return hiddenFor(item) ? [{ text: "", locked: true }] : text.map((line) => ({ text: line }))
  })

  const reset = () => { setLines([]); setPot(null); setName(""); setResult(null) }
  const switchMode = (next: "cook" | "note") => { setMode(next); setResult(null); if (next === "note") { setLines([]); setPot(null); setName("") } }
  const addLine = (key: string) => { setResult(null); setLines((current) => [...current, { key, cooked: true }]) }

  const canCook = lines.length > 0 && lines.every((line) => left(line.key) >= 0) && (!potShown || (potShown.owned?.quantity ?? 0) > 0) && !busy

  const cookIt = async (outcome: OutcomeKey | null) => {
    setAsking(false)
    if (!outcome) return
    const counts = new Map<string, number>()
    for (const line of lines) counts.set(line.key, (counts.get(line.key) ?? 0) + 1)
    if (pot) counts.set(pot, (counts.get(pot) ?? 0) + 1)
    const takes = plannedTakes(owned, counts)
    if (!takes) { setError("Il manque un ingrédient : l'inventaire a changé."); return }
    const dishName = name.trim() || "Plat sans nom"
    const potName = potShown?.name ?? ""
    setBusy(true)
    setError("")
    try {
      if (outcome === "fumble") {
        const done = await craft(eraser, characterId, "cuisine", data.inventory, takes, null)
        setData({ ...data, inventory: done.inventory, pending: null })
        setResult({ fumble: true, lostPot: Boolean(pot), skipped: done.skipped })
      } else {
        const finalNutrition = outcome === "fail" ? Math.floor(nutrition / 2) : outcome === "crit" ? Math.min(MAX, nutrition * 2) : nutrition
        const finalPortions = Math.max(1, Math.min(MAX, outcome === "crit" ? portions * 2 : portions))
        const keys = [...new Set(lines.map((line) => line.key))]
        const effectSources = keys.flatMap((key) => {
          const item = shownOf(key, owned, catalog)
          return item?.owned ? effectLines(item.owned.item).map((text) => ({ source: item.name, text: text.slice(0, 300) })) : []
        }).slice(0, 30)
        const description = `Préparé avec : ${lines.map((line) => `${shownOf(line.key, owned, catalog)?.name ?? line.key} (${line.cooked ? "cuit" : "cru"})`).join(", ")}${potName ? `, dans ${potName}` : ""}.`
        const done = await craft(eraser, characterId, "cuisine", data.inventory, takes, {
          name: dishName,
          description: description.slice(0, 1200),
          type: settings.resultType || "Nourriture",
          subtype: settings.resultSubtype,
          effect: potEffect.slice(0, 1200),
          reserve: { count: finalPortions, total: finalPortions, unit: "portion", ...(finalNutrition > 0 ? { nutrition: finalNutrition } : {}) },
          ...(potName ? { recycle: [potName] } : {}),
          ...(effectSources.length ? { effectSources } : {}),
        })
        const fx = fxOf(keys)
        const book = data.book.some((recipe) => fold(recipe.name) === fold(dishName)) ? data.book
          : [{ id: newRecipeId(), name: dishName, from: "reussie" as const, fav: false, pot: potName || null, lines: lines.map((line) => ({ name: shownOf(line.key, owned, catalog)?.name ?? line.key, cooked: line.cooked })) }, ...data.book]
        setData({ ...data, inventory: done.inventory, pending: null })
        if (book !== data.book) void saveBook(book)
        const createdSlot = done.inventory.containers.flatMap((container) => container.slots).find((slot) => slot.id === done.slotId)
        setResult({ fumble: false, label: { ok: "Plat réussi", fail: "Échec", crit: "Réussite critique" }[outcome], name: dishName, nutrition: finalNutrition, portions: finalPortions, potEffect, potName, fx, slotId: done.slotId, itemId: createdSlot?.itemId ?? "", skipped: done.skipped })
      }
      setLines([])
      setName("")
      if (pot && left(pot) - 1 <= 0) setPot(null)
    } catch (reason) {
      setError(reason instanceof CraftError || reason instanceof Error ? reason.message : "La création n'a pas abouti.")
    } finally {
      setBusy(false)
    }
  }

  const saveNote = () => {
    const recipe: CuisineRecipe = { id: newRecipeId(), name: name.trim() || "Recette sans nom", from: "notee", fav: false, pot: potShown?.name ?? null, lines: lines.map((line) => ({ name: shownOf(line.key, owned, catalog)?.name ?? line.key, cooked: line.cooked })) }
    void saveBook([recipe, ...data.book])
    setNotice(`« ${recipe.name} » est noté dans le carnet.`)
    setMode("cook")
    reset()
  }

  const loadRecipe = (recipe: CuisineRecipe) => {
    setMode("cook")
    setResult(null)
    setLines(recipe.lines.map((line) => ({ key: fold(line.name), cooked: line.cooked })))
    setPot(recipe.pot ? fold(recipe.pot) : null)
    setName(recipe.name)
  }

  const ingredientTip = (item: Shown, children: ReactElement) => {
    const v = values(item.key)
    const hidden = hiddenFor(item)
    const tip = <ItemTip title={item.name} lines={[`Cru ${v.raw} · cuit ${v.cooked} · ${v.portions} portion${v.portions > 1 ? "s" : ""}`]} effect={item.owned ? effectLines(item.owned.item) : undefined} locked={hidden}>{children}</ItemTip>
    return <LockMenu name={item.name} lockable={Boolean(item.owned) && effectLockable(effects, item)} hidden={hidden} onToggle={() => toggleEffect(item.name, hidden)}>{tip}</LockMenu>
  }

  const missing = (itemName: string) => !owned.some((item) => item.key === fold(itemName))

  return <TooltipProvider delayDuration={250}>
    <div className="relative grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,250px)_minmax(0,1fr)]">
      {data.pending && <PendingBanner eraser={eraser} characterId={characterId} pending={data.pending} onDone={(inventory) => setData({ ...data, pending: null, ...(inventory ? { inventory } : {}) })} />}
      {error && <Notice tone="erreur" onClose={() => setError("")}>{error}</Notice>}
      {notice && <Notice tone="info" onClose={() => setNotice("")}>{notice}</Notice>}

      <div className="grid min-h-[380px] min-w-0 grid-rows-[auto_1fr_auto_auto] overflow-hidden rounded-xl border border-border/70 bg-background/45">
        <div className="flex items-center gap-2 px-3 pb-1 pt-2.5">
          <Label className="flex-1">Ingrédients</Label>
          <label className="relative flex items-center">
            <Search className="pointer-events-none absolute left-1.5 size-3 text-muted-foreground" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher" aria-label="Chercher un ingrédient" autoComplete="off" className="h-6 w-24 rounded-md border border-transparent bg-muted/60 pl-5 pr-1.5 text-xs focus:border-input focus-visible:outline-none" />
          </label>
        </div>
        <div className="grid max-h-[250px] content-start gap-px overflow-y-auto px-1.5 pb-2 pt-0.5">
          {ingredients.map((item) => <span key={item.key} className="block">{ingredientTip(item, <span className="block"><ItemRow item={item} accent={accent} quantity={cook ? left(item.key) : undefined} disabled={cook && left(item.key) <= 0} onClick={() => addLine(item.key)} /></span>)}</span>)}
          {!ingredients.length && <p className="px-1.5 py-2 text-[13px] text-muted-foreground">{folded ? "Rien trouvé." : cook ? "Aucun ingrédient sur toi." : "Aucun ingrédient dans l'index."}</p>}
        </div>
        <div className="border-t border-border/70 px-3 pb-1 pt-2.5"><Label>Contenants</Label></div>
        <div className="grid content-start gap-px px-1.5 pb-2.5 pt-0.5">
          {containers.map((item) => <ItemTip key={item.key} title={item.name} effect={item.owned ? effectLines(item.owned.item) : undefined}><span className="block"><ItemRow item={item} accent={accent} quantity={cook ? item.owned?.quantity ?? 0 : undefined} pressed={pot === item.key} onClick={() => { setResult(null); setPot(item.key) }} /></span></ItemTip>)}
          <ItemRow item={null} accent={accent} pressed={pot === null} onClick={() => { setResult(null); setPot(null) }}>Sans contenant</ItemRow>
        </div>
      </div>

      <div className="grid min-w-0 grid-rows-[auto_auto_1fr_auto] gap-3 rounded-xl border border-border/70 bg-background/45 px-3.5 py-3">
        {result ? <ResultPane result={result} eraser={eraser} characterId={characterId} onAgain={reset} /> : <>
          <div><Segmented label="Mode" value={mode} onChange={switchMode} options={[["cook", "Cuisiner"], ["note", "Noter une recette"]]} /></div>
          <div className="grid content-start gap-1">
            {lines.length ? lines.map((line, index) => {
              const item = shownOf(line.key, owned, catalog)
              const short = cook && left(line.key) < 0
              const row = <div className="group grid grid-cols-[30px_minmax(0,1fr)_auto_auto_24px] items-center gap-2.5 rounded-md px-1 py-0.5 hover:bg-muted/55">
                <ItemIcon item={item} className="size-7.5" />
                <span className={short ? "truncate text-sm text-destructive" : "truncate text-sm"}>{item?.name ?? line.key}</span>
                <Segmented label="Cuisson" value={line.cooked ? "cuit" : "cru"} onChange={(value) => setLines((current) => current.map((entry, at) => at === index ? { ...entry, cooked: value === "cuit" } : entry))} options={[["cru", "Cru"], ["cuit", "Cuit"]]} />
                <span className="inline-flex items-center gap-0.5 text-sm tabular-nums" style={{ color: accent }}>{gives(line)}<Drumstick className="size-3.5" /></span>
                <button type="button" onClick={() => setLines((current) => current.filter((_, at) => at !== index))} aria-label={`Retirer ${item?.name ?? ""}`} className="grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100"><X className="size-3.5" /></button>
              </div>
              return <div key={index}>{item ? ingredientTip(item, row) : row}</div>
            }) : <p className="px-1 py-2 text-[13px] text-muted-foreground">Clique sur un ingrédient.</p>}
          </div>
          <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1 self-end border-t border-border/70 pt-3">
            <ItemIcon item={{ name: "", type: "", subtype: "", icon: "eraser:alchimie/nourriture" }} className="row-span-2 size-16" />
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} aria-label={cook ? "Nom du plat" : "Nom de la recette"} placeholder={cook ? "Nom du plat" : "Nom de la recette"} autoComplete="off" className="w-full border-0 border-b border-dashed border-transparent bg-transparent p-0 font-display text-xl font-semibold hover:border-input focus:border-input focus:outline-none" />
            <DishStats nutrition={nutrition} portions={portions} />
            {potEffect && <EffectList lines={[{ text: potEffect }]} accent={accent} />}
            <EffectList lines={fxOf(lines.map((line) => line.key))} accent={accent} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {cook
              ? <Button type="button" size="sm" disabled={!canCook} onClick={() => setAsking(true)}><CookingPot />Cuisiner</Button>
              : <Button type="button" size="sm" disabled={!lines.length} onClick={saveNote}><Plus />Noter dans le carnet</Button>}
          </div>
        </>}
      </div>

      <BookStrip<CuisineRecipe>
        title="Carnet de recettes" unit={["recette", "recettes"]} accent={accent} book={data.book}
        onChange={(book) => void saveBook(book)} onLoad={loadRecipe} noteLabel="Noter une recette"
        onNote={() => switchMode("note")}
        renderInner={(recipe) => {
          return <>
            <span className="flex gap-0.5">{recipe.lines.map((line, index) => {
              const item = shownOf(fold(line.name), owned, catalog)
              return <span key={index} title={line.name} className={missing(line.name) ? "opacity-30" : undefined}><ItemIcon item={item ?? { name: line.name, type: "", subtype: "" }} className="size-6" /></span>
            })}</span>
            <span className="flex flex-wrap gap-1.5">
              {recipe.pot && <Pill color={accent}>{recipe.pot}</Pill>}
              <Pill color="var(--muted-foreground)">{recipe.from === "reussie" ? "Réussie" : "Notée"}</Pill>
            </span>
          </>
        }}
      />
      {asking && <OutcomeAsk onPick={cookIt} choices={[["ok", "Réussite", "Le plat, comme prévu"], ["fail", "Échec", "Nutrition divisée par deux"], ["crit", "Réussite critique", "Nutrition et portions doublées"], ["fumble", "Échec critique", "Ingrédients perdus, pas de plat"]]} />}
      {busy && <div className="absolute inset-0 z-10 grid place-items-center rounded-[inherit] bg-background/40" aria-busy="true" />}
    </div>
  </TooltipProvider>
}

function Pill({ color, children }: { color: string; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color, background: `color-mix(in srgb, ${color} 9%, transparent)` }}>{children}</span>
}

function DishStats({ nutrition, portions }: { nutrition: number; portions: number }) {
  return <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-muted-foreground">
    <span className="inline-flex items-center gap-px" style={{ color: accent }} aria-hidden="true">{Array.from({ length: Math.min(nutrition, 10) }, (_, index) => <Drumstick key={index} className="size-3.5" />)}</span>
    <span><b className="font-semibold text-foreground">{nutrition}</b> Nutrition par portion</span>
    <span><b className="font-semibold text-foreground">{portions}</b> portion{portions > 1 ? "s" : ""}</span>
  </span>
}

function ResultPane({ result, eraser, characterId, onAgain }: { result: Result; eraser: ExtensionDialogProps["eraser"]; characterId: string; onAgain: () => void }) {
  const skipped = result.skipped.length ? <Notice tone="info">Pas retiré (l'inventaire avait changé) : {[...new Set(result.skipped)].join(", ")}.</Notice> : null
  if (result.fumble) return <>
    <div><Label className="text-destructive">Échec critique</Label></div>
    <p className="text-[13px] text-muted-foreground">Les ingrédients{result.lostPot ? " et le contenant" : ""} sont perdus. Pas de plat.</p>
    <div>{skipped}</div>
    <div className="flex justify-end"><Button type="button" variant="outline" size="sm" onClick={onAgain}><Plus />Nouveau plat</Button></div>
  </>
  return <>
    <div><Label>{result.label}</Label></div>
    <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1">
      <ItemIcon item={{ name: "", type: "", subtype: "", icon: "eraser:alchimie/nourriture" }} className="row-span-2 size-16" />
      <span className="font-display text-xl font-semibold">{result.name}</span>
      <DishStats nutrition={result.nutrition} portions={result.portions} />
      {result.potEffect && <EffectList lines={[{ text: result.potEffect }]} accent={accent} />}
      <EffectList lines={result.fx} accent={accent} />
      {result.potName && <span className="col-span-full text-[13px] text-muted-foreground">Se recycle en : <b className="font-semibold text-foreground">{result.potName}</b></span>}
    </div>
    <div>{skipped}</div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Destination eraser={eraser} characterId={characterId} slotId={result.slotId} itemId={result.itemId} accent={accent} />
      <Button type="button" variant="outline" size="sm" onClick={onAgain}><Plus />Nouveau plat</Button>
    </div>
  </>
}
