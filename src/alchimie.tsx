/**
 * L'Alchimie : une base, un ou plusieurs ingrédients d'alchimie et un récipient donnent un
 * consommable. La base décide de sa famille (potion, venin, onguent, gaz), le récipient de ses
 * doses (chacune se consomme d'un clic dans l'inventaire). Un ingrédient posé deux fois compte
 * deux fois. L'effet d'un ingrédient est caché d'office, derrière l'œil de l'inventaire.
 *
 * Le test se lance à la table : le joueur dit ce qu'il a obtenu.
 *   Réussite : la formule. Échec : chaque ingrédient a 75 % de chances de ne pas compter.
 *   Réussite critique : les ingrédients ne sont pas consommés. Échec critique : tout est perdu.
 */
import { useState, type ReactElement, type ReactNode } from "react"
import { FlaskConical, Plus, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { ExtensionDialogProps } from "@/lib/extension-api"
import { cn } from "@/lib/utils"

import { AtelierLoading, Destination, PendingBanner, useAtelier } from "./atelier"
import { newRecipeId, type AlchimieRecipe } from "./book"
import { craft, effectHidden, effectLines, hasType, numberIn, ownedItems, plannedTakes, type OwnedItem } from "./inventory"
import { META, fold, type AtelierCatalog } from "./settings"
import { BookStrip, EffectList, ItemIcon, ItemRow, ItemTip, Label, LockMenu, Notice, OutcomeAsk, Segmented, colors, type EffectLine, type OutcomeKey } from "./ui"

const accent = colors.alchimie

/** Les familles que l'on reconnaît dans la colonne de la base ; une autre valeur s'affiche telle quelle. */
const families = [
  { code: "INJ", name: "Potion", mode: "Ingestion", color: "#397f88", icon: "eraser:alchimie/elixirs", words: ["inj", "potion", "ingestion", "elixir"] },
  { code: "BLE", name: "Venin", mode: "Blessure", color: "#b9504e", icon: "eraser:alchimie/venin", words: ["ble", "venin", "blessure", "poison"] },
  { code: "CON", name: "Onguent", mode: "Contact", color: "#b48745", icon: "eraser:alchimie/onguent", words: ["con", "onguent", "contact", "baume"] },
  { code: "INH", name: "Gaz", mode: "Inhalation", color: "#6c5a73", icon: "eraser:alchimie/gaz", words: ["inh", "gaz", "inhalation", "fumee"] },
]

type Family = { label: string; name: string; color: string; icon: string }

function familyOf(value: string): Family | null {
  const text = value.trim()
  if (!text) return null
  const words = fold(text).split(/[^a-z]+/).filter(Boolean)
  const known = families.find((family) => family.words.some((word) => words.includes(word)))
  return known ? { label: `${known.code} · ${known.mode}`, name: known.name, color: known.color, icon: known.icon } : { label: text, name: text, color: accent, icon: "eraser:alchimie/physique" }
}

type Shown = { key: string; name: string; type: string; subtype: string; icon?: string; image?: string; owned: OwnedItem | null }
type Result =
  | { fumble: true; skipped: string[] }
  | { fumble: false; label: string; name: string; family: Family | null; vessel: string; doses: number; fx: EffectLine[]; slotId: string | null; itemId: string; skipped: string[] }

function shownOf(key: string, owned: OwnedItem[], catalog: AtelierCatalog): Shown | null {
  const mine = owned.find((item) => item.key === key)
  if (mine) return { key, name: mine.name, type: mine.item.type, subtype: mine.item.subtype, icon: mine.item.icon, image: mine.item.image, owned: mine }
  const row = catalog[key]
  if (!row) return null
  return { key, name: row[META.name] || key, type: row[META.type] || "", subtype: row[META.subtype] || "", icon: row[META.icon] || "", owned: null }
}

/** Une ligne d'effet et son signe (« + 5 en perception », « − 5 en discrétion »). */
function signed(text: string): EffectLine {
  const match = /^\s*([+\-−])\s*(.*)$/.exec(text)
  if (!match) return { text }
  // Le signe passe devant, en couleur : « +5 en perception » → « + » et « 5 en perception ».
  return { text: match[2], sign: match[1] === "+" ? "+" : "-" }
}

export function AlchimieWindow({ eraser, characterId }: ExtensionDialogProps<{ characterId: string }>) {
  const { data, setData, error, setError, saveBook, toggleEffect } = useAtelier<AlchimieRecipe>(eraser, characterId, "alchimie")
  const [mode, setMode] = useState<"brew" | "note">("brew")
  const [tab, setTab] = useState<"base" | "ing" | "pot">("base")
  const [base, setBase] = useState<string | null>(null)
  const [ings, setIngs] = useState<string[]>([])
  const [pot, setPot] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [query, setQuery] = useState("")
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [notice, setNotice] = useState("")

  if (!data) return <AtelierLoading error={error} />
  const { settings: { alchimie: settings }, catalog } = data
  const owned = ownedItems(data.inventory)
  const brew = mode === "brew"

  const listOf = (types: string[]) => {
    const mine = owned.filter((item) => hasType(item.item, types)).map((item) => shownOf(item.key, owned, catalog)!)
    if (brew) return mine
    const known = new Set(mine.map((item) => item.key))
    return [...mine, ...Object.keys(catalog).filter((key) => !known.has(key) && hasType({ type: catalog[key][META.type] || "" }, types)).map((key) => shownOf(key, owned, catalog)!).sort((a, b) => a.name.localeCompare(b.name, "fr"))]
  }
  const folded = fold(query)
  const lists = { base: listOf(settings.baseTypes), ing: listOf(settings.ingredientTypes), pot: listOf(settings.vesselTypes) }
  const shown = lists[tab].filter((item) => !folded || fold(item.name).includes(folded))

  const quantity = (key: string) => owned.find((item) => item.key === key)?.quantity ?? 0
  const ingLeft = (key: string) => quantity(key) - ings.filter((entry) => entry === key).length
  const familyFor = (key: string | null) => key ? familyOf(catalog[key]?.[settings.familyColumn] ?? "") : null
  const dosesFor = (key: string | null) => key ? Math.max(1, Math.min(99, numberIn(catalog[key]?.[settings.dosesColumn]) || 1)) : 1

  const baseShown = base ? shownOf(base, owned, catalog) : null
  const potShown = pot ? shownOf(pot, owned, catalog) : null
  const family = familyFor(base)
  const doses = dosesFor(pot)
  const hiddenFor = (item: Shown) => effectHidden(eraser, item.owned)

  // Chaque ingrédient compte autant de fois qu'il est posé ; caché : une ligne « Effet inconnu ».
  const fxOf = (keys: string[]): EffectLine[] => [...new Set(keys)].flatMap((key) => {
    const item = shownOf(key, owned, catalog)
    if (!item?.owned) return []
    const lines = effectLines(item.owned.item)
    if (!lines.length) return []
    if (hiddenFor(item)) return [{ text: "", locked: true }]
    const times = keys.filter((entry) => entry === key).length
    return lines.map((line) => { const effect = signed(line); return times > 1 ? { ...effect, text: `${effect.text} (×${times})` } : effect })
  })

  const defaultName = () => {
    if (!base || !ings.length) return ""
    const first = (shownOf(ings[0], owned, catalog)?.name ?? "").toLocaleLowerCase("fr")
    const kind = family?.name || "Préparation"
    return first ? `${kind} ${/^[aeiouyéèêh]/i.test(first) ? "d'" : "de "}${first}` : kind
  }
  const finalName = () => name.trim() || defaultName() || "Préparation sans nom"

  const reset = () => { setBase(null); setIngs([]); setPot(null); setName(""); setResult(null); setTab("base") }
  const switchMode = (next: "brew" | "note") => { setMode(next); setResult(null); if (next === "note") reset() }
  const pick = (key: string) => {
    setResult(null)
    if (tab === "base") { setBase(key); setTab("ing") }
    else if (tab === "ing") setIngs((current) => [...current, key])
    else setPot(key)
  }

  const canBrew = Boolean(base && pot && ings.length && quantity(base) > 0 && quantity(pot) > 0 && ings.every((key) => ingLeft(key) >= 0)) && !busy

  const brewIt = async (outcome: OutcomeKey | null) => {
    setAsking(false)
    if (!outcome || !base || !pot) return
    const counts = new Map<string, number>([[base, 1]])
    counts.set(pot, (counts.get(pot) ?? 0) + 1)
    if (outcome !== "crit") for (const key of ings) counts.set(key, (counts.get(key) ?? 0) + 1)
    const takes = plannedTakes(owned, counts)
    if (!takes) { setError("Il manque un ingrédient : l'inventaire a changé."); return }
    const potionName = finalName()
    const vessel = potShown?.name ?? ""
    setBusy(true)
    setError("")
    try {
      if (outcome === "fumble") {
        const done = await craft(eraser, characterId, "alchimie", data.inventory, takes, null)
        setData({ ...data, inventory: done.inventory, pending: null })
        setResult({ fumble: true, skipped: done.skipped })
      } else {
        // Échec : chaque ingrédient posé a 75 % de chances de ne pas compter.
        const kept = outcome === "fail" ? ings.filter(() => Math.random() >= 0.75) : [...ings]
        const effectSources = kept.flatMap((key) => {
          const item = shownOf(key, owned, catalog)
          return item?.owned ? effectLines(item.owned.item).map((text) => ({ source: item.name, text: text.slice(0, 300) })) : []
        }).slice(0, 30)
        const description = `Préparé avec : ${[baseShown?.name, ...ings.map((key) => shownOf(key, owned, catalog)?.name ?? key)].filter(Boolean).join(", ")}${vessel ? `, dans ${vessel}` : ""}.`
        const done = await craft(eraser, characterId, "alchimie", data.inventory, takes, {
          name: potionName,
          description: description.slice(0, 1200),
          type: settings.resultType || "Consommable",
          subtype: family?.label ?? "",
          effect: "",
          reserve: { count: doses, total: doses, unit: "dose" },
          ...(vessel ? { recycle: [vessel] } : {}),
          ...(effectSources.length ? { effectSources } : {}),
        })
        if (outcome !== "fail" && !data.book.some((recipe) => fold(recipe.name) === fold(potionName))) {
          void saveBook([{ id: newRecipeId(), name: potionName, from: "reussie", fav: false, base: baseShown?.name ?? base, ings: ings.map((key) => shownOf(key, owned, catalog)?.name ?? key), pot: vessel || null }, ...data.book])
        }
        setData((current) => current ? { ...current, inventory: done.inventory, pending: null } : current)
        const createdSlot = done.inventory.containers.flatMap((container) => container.slots).find((slot) => slot.id === done.slotId)
        setResult({ fumble: false, label: { ok: "Préparation réussie", fail: "Échec", crit: "Réussite critique" }[outcome], name: potionName, family, vessel, doses, fx: fxOf(kept), slotId: done.slotId, itemId: createdSlot?.itemId ?? "", skipped: done.skipped })
      }
      setIngs([])
      setName("")
      setTab("ing")
      if (quantity(base) - 1 <= 0) { setBase(null); setTab("base") }
      if (quantity(pot) - 1 <= 0) setPot(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La création n'a pas abouti.")
    } finally {
      setBusy(false)
    }
  }

  const saveNote = () => {
    if (!base) return
    const recipe: AlchimieRecipe = { id: newRecipeId(), name: finalName(), from: "notee", fav: false, base: baseShown?.name ?? base, ings: ings.map((key) => shownOf(key, owned, catalog)?.name ?? key), pot: potShown?.name ?? null }
    void saveBook([recipe, ...data.book])
    setNotice(`« ${recipe.name} » est notée dans le carnet.`)
    setMode("brew")
    reset()
  }

  const loadRecipe = (recipe: AlchimieRecipe) => {
    setMode("brew")
    setResult(null)
    setBase(fold(recipe.base))
    setIngs(recipe.ings.map(fold))
    setPot(recipe.pot ? fold(recipe.pot) : null)
    setName(recipe.name)
    setTab("ing")
  }

  const tip = (item: Shown, children: ReactElement) => {
    if (tab === "base" || lists.base.some((entry) => entry.key === item.key) && !lists.ing.some((entry) => entry.key === item.key)) {
      const own = familyFor(item.key)
      return <ItemTip title={item.name} lines={own ? [own.label] : []}>{children}</ItemTip>
    }
    if (lists.pot.some((entry) => entry.key === item.key) && !lists.ing.some((entry) => entry.key === item.key)) {
      return <ItemTip title={item.name} lines={[`×${dosesFor(item.key)} dose${dosesFor(item.key) > 1 ? "s" : ""}`]}>{children}</ItemTip>
    }
    const hidden = hiddenFor(item)
    return <LockMenu name={item.name} lockable={Boolean(item.owned)} hidden={hidden} onToggle={() => { if (item.owned) toggleEffect(item.owned, hidden) }}>
      <ItemTip title={item.name} effect={item.owned ? effectLines(item.owned.item) : undefined} locked={hidden}>{children}</ItemTip>
    </LockMenu>
  }

  const cell = (kind: "base" | "ing" | "pot", key: string | null, index: number, label: string): ReactNode => {
    const item = key ? shownOf(key, owned, catalog) : null
    if (!key || !item) {
      return <button key={`empty-${kind}`} type="button" onClick={() => setTab(kind)} className={cn("grid w-[74px] justify-items-center gap-1 rounded-lg border border-dashed border-border/80 px-1 pb-1.5 pt-2 text-center", tab === kind && "border-solid")} style={tab === kind ? { borderColor: accent } : undefined}>
        <i className="block size-9.5 rounded-full border border-dashed border-input" />
        <span className="max-w-full truncate text-[11px] leading-tight text-muted-foreground">{label}</span>
      </button>
    }
    const own = kind === "base" ? familyFor(key) : null
    const remove = () => { if (kind === "base") setBase(null); else if (kind === "pot") setPot(null); else setIngs((current) => current.filter((_, at) => at !== index)) }
    const button = <button type="button" onClick={remove} aria-label={`Retirer ${item.name}`} className="grid w-[74px] justify-items-center gap-1 rounded-lg border border-border/80 bg-card px-1 pb-1.5 pt-2 text-center transition hover:-translate-y-px hover:border-destructive/45" style={own ? { borderColor: `color-mix(in srgb, ${own.color} 60%, transparent)`, boxShadow: `inset 0 -3px 0 ${own.color}` } : undefined}>
      <ItemIcon item={item} className="size-9.5" />
      <span className="max-w-full truncate text-[11px] leading-tight">{item.name}</span>
    </button>
    return <span key={`${kind}-${index}`}>{tip(item, button)}</span>
  }

  const missing = (itemName: string) => !owned.some((item) => item.key === fold(itemName))

  return <TooltipProvider delayDuration={250}>
    <div className="relative grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,250px)_minmax(0,1fr)]">
      {data.pending && <PendingBanner eraser={eraser} characterId={characterId} pending={data.pending} onDone={(inventory) => setData({ ...data, pending: null, ...(inventory ? { inventory } : {}) })} />}
      {error && <Notice tone="erreur" onClose={() => setError("")}>{error}</Notice>}
      {notice && <Notice tone="info" onClose={() => setNotice("")}>{notice}</Notice>}

      <div className="grid min-h-[430px] min-w-0 grid-rows-[auto_auto_1fr] overflow-hidden rounded-xl border border-border/70 bg-background/45">
        <div className="px-3 pb-1 pt-2.5"><Segmented label="Items" value={tab} onChange={(value) => { setTab(value); setQuery("") }} options={[["base", "Bases"], ["ing", "Ingrédients"], ["pot", "Récipients"]]} /></div>
        <label className="relative mx-3 mb-1 flex items-center">
          <Search className="pointer-events-none absolute left-1.5 size-3 text-muted-foreground" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher" aria-label="Chercher dans la liste" autoComplete="off" className="h-6 w-full rounded-md border border-transparent bg-muted/60 pl-5 pr-1.5 text-xs focus:border-input focus-visible:outline-none" />
        </label>
        <div className="grid content-start gap-px overflow-y-auto px-1.5 pb-2 pt-0.5" role="tabpanel">
          {shown.map((item) => {
            const own = tab === "base" ? familyFor(item.key) : null
            const count = tab === "ing" ? ingLeft(item.key) : quantity(item.key)
            const pressed = tab === "base" ? base === item.key : tab === "pot" ? pot === item.key : undefined
            return <span key={item.key} className="block">{tip(item, <span className="relative block">
              <ItemRow item={item} accent={own?.color ?? accent} quantity={brew ? count : undefined} pressed={pressed} disabled={brew && tab === "ing" && count <= 0} onClick={() => pick(item.key)} />
              {!brew && own && <span className="pointer-events-none absolute right-2 top-1/2 size-2 -translate-y-1/2 rounded-full" style={{ background: own.color }} />}
            </span>)}</span>
          })}
          {!shown.length && <p className="px-1.5 py-2 text-[13px] text-muted-foreground">{folded ? "Rien trouvé." : brew ? "Rien de ce genre sur toi." : "Rien de ce genre dans l'index."}</p>}
        </div>
      </div>

      <div className="grid min-w-0 grid-rows-[auto_auto_1fr_auto] gap-3 rounded-xl border border-border/70 bg-background/45 px-3.5 py-3">
        {result ? <ResultPane result={result} eraser={eraser} characterId={characterId} onAgain={() => setResult(null)} /> : <>
          <div><Segmented label="Mode" value={mode} onChange={switchMode} options={[["brew", "Préparer"], ["note", "Noter une formule"]]} /></div>
          <div className="flex flex-wrap items-center gap-1.5">
            {cell("base", base, 0, "Base")}
            <span className="w-2.5 text-center text-muted-foreground">+</span>
            {ings.flatMap((key, index) => [cell("ing", key, index, ""), <span key={`plus-${index}`} className="w-2.5 text-center text-muted-foreground">+</span>])}
            {cell("ing", null, ings.length, "Ingrédient")}
            <span className="w-2.5 text-center text-muted-foreground">→</span>
            {cell("pot", pot, 0, "Récipient")}
          </div>
          <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1 self-end border-t border-border/70 pt-3">
            {baseShown ? <>
              <ItemIcon item={{ name: "", type: "", subtype: "", icon: family?.icon ?? "eraser:alchimie/physique" }} className="row-span-2 size-16" />
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} placeholder={defaultName() || "Nom"} aria-label="Nom de la préparation" autoComplete="off" className="w-full border-0 border-b border-dashed border-transparent bg-transparent p-0 font-display text-xl font-semibold placeholder:text-foreground/70 hover:border-input focus:border-input focus:outline-none" />
              <span className="flex flex-wrap items-center gap-1.5">
                {family && <Pill color={family.color}>{family.label}</Pill>}
                {potShown && <Pill color="var(--muted-foreground)">{potShown.name} · ×{doses}</Pill>}
              </span>
              <EffectList lines={fxOf(ings)} accent={accent} />
            </> : <span className="col-span-full text-[13px] text-muted-foreground">Choisis une base.</span>}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {brew
              ? <Button type="button" size="sm" disabled={!canBrew} onClick={() => setAsking(true)}><FlaskConical />Préparer</Button>
              : <Button type="button" size="sm" disabled={!base || !ings.length} onClick={saveNote}><Plus />Noter dans le carnet</Button>}
          </div>
        </>}
      </div>

      <BookStrip<AlchimieRecipe>
        title="Carnet de formules" unit={["formule", "formules"]} accent={accent} book={data.book}
        onChange={(book) => void saveBook(book)} onLoad={loadRecipe} noteLabel="Noter une formule"
        onNote={() => switchMode("note")}
        renderInner={(recipe) => {
          const own = familyFor(fold(recipe.base))
          return <>
            <span className="flex gap-0.5">{[recipe.base, ...recipe.ings, ...(recipe.pot ? [recipe.pot] : [])].map((itemName, index) => {
              const item = shownOf(fold(itemName), owned, catalog)
              return <span key={index} title={itemName} className={missing(itemName) ? "opacity-30" : undefined}><ItemIcon item={item ?? { name: itemName, type: "", subtype: "" }} className="size-6" /></span>
            })}</span>
            <span className="flex flex-wrap gap-1.5">
              {own && <Pill color={own.color}>{own.name}</Pill>}
              <Pill color="var(--muted-foreground)">{recipe.from === "reussie" ? "Réussie" : "Notée"}</Pill>
            </span>
          </>
        }}
      />
      {asking && <OutcomeAsk onPick={brewIt} choices={[["ok", "Réussite", "La formule, comme prévu"], ["fail", "Échec", "Chaque ingrédient a 75 % de chances de ne pas compter"], ["crit", "Réussite critique", "Les ingrédients ne sont pas consommés"], ["fumble", "Échec critique", "Tout est perdu, rien n'est créé"]]} />}
      {busy && <div className="absolute inset-0 z-10 grid place-items-center rounded-[inherit] bg-background/40" aria-busy="true" />}
    </div>
  </TooltipProvider>
}

function Pill({ color, children }: { color: string; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color, background: `color-mix(in srgb, ${color} 9%, transparent)` }}>{children}</span>
}

function ResultPane({ result, eraser, characterId, onAgain }: { result: Result; eraser: ExtensionDialogProps["eraser"]; characterId: string; onAgain: () => void }) {
  const skipped = result.skipped.length ? <Notice tone="info">Pas retiré (l'inventaire avait changé) : {[...new Set(result.skipped)].join(", ")}.</Notice> : null
  if (result.fumble) return <>
    <div><Label className="text-destructive">Échec critique</Label></div>
    <p className="text-[13px] text-muted-foreground">La base, les ingrédients et le récipient sont perdus. Rien n'est créé.</p>
    <div>{skipped}</div>
    <div className="flex justify-end"><Button type="button" variant="outline" size="sm" onClick={onAgain}><Plus />Nouvelle préparation</Button></div>
  </>
  return <>
    <div><Label>{result.label}</Label></div>
    <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1">
      <ItemIcon item={{ name: "", type: "", subtype: "", icon: result.family?.icon ?? "eraser:alchimie/physique" }} className="row-span-2 size-16" />
      <span className="font-display text-xl font-semibold">{result.name} <span className="text-[15px] text-muted-foreground">×{result.doses}</span></span>
      <span className="flex flex-wrap items-center gap-1.5">
        {result.family && <Pill color={result.family.color}>{result.family.label}</Pill>}
        {result.vessel && <Pill color="var(--muted-foreground)">{result.vessel}</Pill>}
      </span>
      <EffectList lines={result.fx} accent={accent} />
    </div>
    <div>{skipped}</div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Destination eraser={eraser} characterId={characterId} slotId={result.slotId} itemId={result.itemId} accent={accent} />
      <Button type="button" variant="outline" size="sm" onClick={onAgain}><Plus />Nouvelle préparation</Button>
    </div>
  </>
}
