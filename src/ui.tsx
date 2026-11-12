/**
 * Les pièces communes aux fenêtres des ateliers : icône d'item, résultat du test, carnet (recherche,
 * favoris, renommer et supprimer au clic droit), infobulle d'un item, menu de l'œil des effets.
 */
import { useState, type ReactNode } from "react"
import { BookPlus, Eye, EyeOff, Pencil, Search, Star, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { objectIconImage } from "@/lib/object-icons"
import { cn } from "@/lib/utils"

import type { Recipe } from "./book"

export const colors = { craft: "#9a5f3c", cuisine: "#ad6c42", alchimie: "#52665c", ok: "#648f4e" }

/** L'icône d'un item, comme dans l'inventaire (l'image d'Eraser d'après son type, à défaut). */
export function ItemIcon({ item, className }: { item: { name: string; type: string; subtype: string; icon?: string; image?: string } | null; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (!item) return <span className={cn("block size-9 shrink-0", className)} />
  const picture = item.image ? { src: item.image, fallback: "" } : objectIconImage(item.icon, item.name, item.type, item.subtype)
  if (!picture) return <span className={cn("flex size-9 shrink-0 items-center justify-center text-xl", className)}>{item.icon}</span>
  return <img src={failed && picture.fallback ? picture.fallback : picture.src} onError={() => setFailed(true)} alt="" draggable={false} className={cn("size-9 shrink-0 object-contain", className)} />
}

/** Un petit intitulé, comme ceux des panneaux d'Eraser. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground", className)}>{children}</span>
}

/** Deux à quatre choix exclusifs, en onglets serrés. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (value: T) => void; label: string }) {
  return <span role="group" aria-label={label} className="inline-flex h-8 rounded-lg bg-muted p-[3px]">
    {options.map(([key, text]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)} className={cn("rounded-md border border-transparent px-2.5 text-xs font-medium text-foreground/60 transition-colors", value === key && "bg-background text-foreground shadow-sm")}>{text}</button>)}
  </span>
}

/** Le résultat du test : le jet se fait à la table, le joueur dit ce qu'il a obtenu. */
export type OutcomeKey = "ok" | "fail" | "crit" | "fumble"
export function OutcomeAsk({ choices, onPick }: { choices: Array<[OutcomeKey, string, string]>; onPick: (key: OutcomeKey | null) => void }) {
  return <div className="absolute inset-0 z-20 grid place-items-center rounded-[inherit] bg-black/25 animate-in fade-in-0" onClick={(event) => { if (event.target === event.currentTarget) onPick(null) }} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onPick(null) } }}>
    <div role="dialog" aria-label="Résultat du test" className="grid w-[min(330px,calc(100%-32px))] gap-1.5 rounded-xl border bg-card p-3.5 shadow-2xl">
      <Label className="px-0.5 pb-1">Résultat du test</Label>
      {choices.map(([key, title, detail], index) => <button key={key} type="button" autoFocus={index === 0} onClick={() => onPick(key)} className="grid gap-px rounded-md border border-border/80 bg-background px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
        <b className="text-[15px] font-semibold" style={key === "crit" ? { color: colors.ok } : key === "fumble" ? { color: "var(--destructive)" } : undefined}>{title}</b>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </button>)}
      <Button type="button" variant="ghost" size="sm" className="mt-0.5 justify-self-end" onClick={() => onPick(null)}>Annuler</Button>
    </div>
  </div>
}

/** L'infobulle d'un item : son nom, ce qu'il apporte, son effet (ou « Effet caché »). */
export function ItemTip({ children, title, lines, effect, locked }: { children: ReactNode; title: string; lines?: string[]; effect?: string[]; locked?: boolean }) {
  return <Tooltip delayDuration={250}>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side="right" className="grid max-w-[250px] gap-0.5 border bg-card px-3 py-2.5 text-xs text-muted-foreground shadow-lg [&>svg]:hidden">
      <span className="font-display text-[15px] font-semibold text-foreground">{title}</span>
      {lines?.map((line) => <span key={line} className="text-foreground">{line}</span>)}
      {effect && <span className={cn("mt-1 border-t pt-1.5 text-foreground", locked && "italic text-muted-foreground")}>{locked ? "Effet caché" : effect.length ? effect.map((line, index) => <span key={index} className="block">{line}</span>) : "Aucun effet"}</span>}
    </TooltipContent>
  </Tooltip>
}

/** Le clic droit d'un ingrédient : voir ou cacher son effet (l'œil de l'inventaire, le même réglage). */
export function LockMenu({ children, name, lockable, hidden, onToggle }: { children: ReactNode; name: string; lockable: boolean; hidden: boolean; onToggle: () => void }) {
  if (!lockable) return <>{children}</>
  return <ContextMenu>
    {/* Un vrai élément sous le clic droit : l'infobulle, elle, n'en rend pas. */}
    <ContextMenuTrigger asChild><span className="block">{children}</span></ContextMenuTrigger>
    <ContextMenuContent className="min-w-48">
      <ContextMenuLabel className="max-w-60 truncate text-xs text-muted-foreground">{name}</ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onToggle}>{hidden ? <><Eye />Voir l'effet</> : <><EyeOff />Cacher l'effet</>}</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
}

/** Une ligne d'effet du résultat ; « Effet inconnu » quand elle est cachée. */
export type EffectLine = { text: string; locked?: boolean; sign?: "+" | "-" }

export function EffectList({ lines, accent }: { lines: EffectLine[]; accent: string }) {
  if (!lines.length) return null
  return <ul className="col-span-full m-0 grid list-none gap-0.5 p-0 text-[13px]">
    {lines.map((line, index) => <li key={index} className="flex items-baseline gap-2">
      {line.sign ? <b className="w-2.5 font-bold" style={{ color: line.sign === "+" ? colors.ok : "var(--destructive)" }}>{line.sign === "+" ? "+" : "−"}</b> : <span className="text-[10px]" style={{ color: accent }}>✦</span>}
      <span className={cn(line.locked && "italic text-muted-foreground")}>{line.locked ? "Effet inconnu" : line.text}</span>
    </li>)}
  </ul>
}

/** Le carnet, en bandeau sous l'atelier : recherche, favoris d'abord, renommer et supprimer au clic droit. */
export function BookStrip<R extends Recipe>({ title, unit, accent, book, renderInner, onLoad, onChange, onNote, noteLabel }: {
  title: string
  unit: [string, string]
  accent: string
  book: R[]
  renderInner: (recipe: R) => ReactNode
  onLoad: (recipe: R) => void
  onChange: (book: R[]) => void
  onNote: () => void
  noteLabel: string
}) {
  const [query, setQuery] = useState("")
  const [renaming, setRenaming] = useState<string | null>(null)
  const folded = query.trim().toLocaleLowerCase("fr")
  const shown = book.filter((recipe) => !folded || recipe.name.toLocaleLowerCase("fr").includes(folded)).sort((a, b) => Number(b.fav) - Number(a.fav))
  const update = (id: string, change: Partial<R> | null) => onChange(change === null ? book.filter((recipe) => recipe.id !== id) : book.map((recipe) => recipe.id === id ? { ...recipe, ...change } : recipe))
  const commitRename = (id: string, value: string) => { setRenaming(null); if (value.trim()) update(id, { name: value.trim().slice(0, 160) } as Partial<R>) }
  return <div className="col-span-full grid min-w-0 gap-2 rounded-xl border border-border/70 bg-card/70 px-3 py-2.5">
    <div className="flex flex-wrap items-center gap-2.5">
      <Label>{title}</Label>
      <label className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2 size-3 text-muted-foreground" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher" aria-label={`Rechercher dans le ${title.toLocaleLowerCase("fr")}`} autoComplete="off" className="h-7 w-40 rounded-md border border-input bg-transparent pl-6 pr-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
      </label>
      <span className="ml-auto text-xs text-muted-foreground tabular-nums">{book.length} {book.length > 1 ? unit[1] : unit[0]}</span>
    </div>
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
      {shown.map((recipe) => <div key={recipe.id} className="relative flex flex-none">
        {renaming === recipe.id
          ? <div className="grid w-[190px] gap-1.5 rounded-lg border bg-card py-2 pl-2.5 pr-7.5" style={{ borderColor: accent }}>
              <input autoFocus defaultValue={recipe.name} aria-label="Nouveau nom" onFocus={(event) => event.currentTarget.select()} onBlur={(event) => commitRename(recipe.id, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") commitRename(recipe.id, event.currentTarget.value); if (event.key === "Escape") { event.stopPropagation(); setRenaming(null) } }} className="w-full border-0 border-b border-input bg-transparent p-0 font-display text-[15px] font-semibold focus:outline-none" />
              {renderInner(recipe)}
            </div>
          : <ContextMenu>
              <ContextMenuTrigger asChild>
                <button type="button" onClick={() => onLoad(recipe)} className="grid w-[190px] gap-1.5 rounded-lg border border-border/70 bg-background/55 py-2 pl-2.5 pr-7.5 text-left transition hover:-translate-y-px" style={{ ["--hover" as string]: accent }}>
                  <b className="font-display text-[15px] font-semibold leading-tight">{recipe.name}</b>
                  {renderInner(recipe)}
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className="min-w-40">
                <ContextMenuLabel className="max-w-56 truncate text-xs text-muted-foreground">{recipe.name}</ContextMenuLabel>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => setRenaming(recipe.id)}><Pencil />Renommer</ContextMenuItem>
                <ContextMenuItem variant="destructive" onSelect={() => update(recipe.id, null)}><Trash2 />Supprimer</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>}
        <button type="button" onClick={() => update(recipe.id, { fav: !recipe.fav } as Partial<R>)} aria-pressed={recipe.fav} aria-label={recipe.fav ? "Retirer des favoris" : "Mettre en favori"} className="absolute right-1.5 top-1.5 grid size-5.5 place-items-center rounded-sm text-muted-foreground/70 hover:bg-muted hover:text-foreground" style={recipe.fav ? { color: "#b48745" } : undefined}>
          <Star className={cn("size-3.5", recipe.fav && "fill-current")} />
        </button>
      </div>)}
      {!shown.length && folded && <p className="px-1 py-2 text-[13px] text-muted-foreground">Rien trouvé.</p>}
      <button type="button" onClick={onNote} className="grid w-[190px] flex-none place-content-center justify-items-center gap-1 rounded-lg border border-dashed border-border/70 px-2.5 py-2 text-[13px] text-muted-foreground transition hover:-translate-y-px hover:text-foreground"><BookPlus className="size-4.5" />{noteLabel}</button>
    </div>
  </div>
}

/** Une ligne cliquable de la colonne des items. */
export function ItemRow({ item, quantity, pressed, disabled, accent, onClick, children }: { item: { name: string; type: string; subtype: string; icon?: string; image?: string } | null; quantity?: number; pressed?: boolean; disabled?: boolean; accent: string; onClick: () => void; children?: ReactNode }) {
  return <button type="button" disabled={disabled} aria-pressed={pressed} onClick={onClick} className={cn("grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/75 disabled:pointer-events-none disabled:opacity-35")} style={pressed ? { background: `color-mix(in srgb, ${accent} 12%, transparent)`, boxShadow: `inset 2px 0 0 ${accent}` } : undefined}>
    <ItemIcon item={item} />
    <span className="truncate text-sm leading-tight">{item?.name ?? children}</span>
    {quantity !== undefined && <span className="text-[13px] tabular-nums text-muted-foreground">{quantity}</span>}
  </button>
}

/** Un message discret dans l'atelier (erreur ou information). */
export function Notice({ tone, children, onClose }: { tone: "info" | "erreur"; children: ReactNode; onClose?: () => void }) {
  return <p className={cn("col-span-full flex items-center gap-2 rounded-xl border px-3 py-2 text-sm", tone === "erreur" ? "border-destructive/25 bg-destructive/5 text-destructive" : "border-border bg-muted/40")}>
    <span className="flex-1">{children}</span>
    {onClose && <button type="button" onClick={onClose} className="rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted" aria-label="Fermer">✕</button>}
  </p>
}
