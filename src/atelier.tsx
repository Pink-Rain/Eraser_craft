/**
 * Ce que chaque atelier charge en s'ouvrant (inventaire, réglages, catalogue de son index, effets
 * montrés, carnet, création pas terminée), et la fin d'une création : ranger ailleurs, terminer
 * une création interrompue.
 */
import { useEffect, useState } from "react"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Eraser } from "@/lib/extension-api"
import type { CharacterInventoryRecord, InventoryTransferTarget } from "@/lib/inventory-schema"

import type { PendingCreation, Recipe } from "./book"
import { forgetPending, showEffect, type OwnedItem, loadCatalog, loadInventory, loadPending, loadSettings, removeTakes, serverJson, transfer, transferTargets } from "./inventory"
import type { Atelier, AtelierCatalog, CraftSettings } from "./settings"
import { Notice, colors } from "./ui"
import { cn } from "@/lib/utils"

export type AtelierData<R extends Recipe> = {
  inventory: CharacterInventoryRecord
  settings: CraftSettings
  catalog: AtelierCatalog
  book: R[]
  pending: PendingCreation | null
}

export function useAtelier<R extends Recipe>(eraser: Eraser, characterId: string, atelier: Atelier) {
  const [data, setData] = useState<AtelierData<R> | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    let alive = true
    Promise.all([
      loadInventory(eraser, characterId),
      loadSettings(eraser),
      loadCatalog(eraser, atelier),
      serverJson<{ book: R[] }>(eraser, `carnet/${atelier}/${encodeURIComponent(characterId)}`).then((result) => result.book),
      loadPending(eraser, characterId).catch(() => null),
    ]).then(([inventory, settings, catalog, book, pending]) => {
      if (alive) setData({ inventory, settings, catalog, book, pending })
    }).catch((reason: unknown) => {
      if (alive) setError(reason instanceof Error ? reason.message : "L'atelier n'a pas pu s'ouvrir.")
    })
    return () => { alive = false }
  }, [eraser, characterId, atelier])

  const saveBook = async (book: R[]) => {
    setData((current) => current ? { ...current, book } : current)
    try {
      await serverJson(eraser, `carnet/${atelier}/${encodeURIComponent(characterId)}`, { method: "PUT", body: book })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Le carnet n'a pas pu être enregistré.")
    }
  }

  // L'œil des effets : le même état que l'inventaire ; `shownVersion` redessine l'atelier.
  const [shownVersion, setShownVersion] = useState(0)
  const toggleEffect = (owned: OwnedItem, shown: boolean) => {
    showEffect(eraser, owned, shown)
    setShownVersion((current) => current + 1)
  }

  return { data, setData, error, setError, saveBook, toggleEffect, shownVersion }
}

/** Pendant le chargement, ou s'il a échoué. */
export function AtelierLoading({ error }: { error: string }) {
  if (error) return <Notice tone="erreur">{error}</Notice>
  return <div className="flex min-h-60 items-center justify-center" aria-busy="true"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>
}

/** Une création interrompue (Eraser fermé au milieu) : retirer ce qui a servi, ou oublier. */
export function PendingBanner({ eraser, characterId, pending, onDone }: { eraser: Eraser; characterId: string; pending: PendingCreation; onDone: (inventory: CharacterInventoryRecord | null) => void }) {
  const [busy, setBusy] = useState(false)
  const finish = async () => {
    setBusy(true)
    await removeTakes(eraser, characterId, pending.take)
    await forgetPending(eraser, characterId).catch(() => undefined)
    eraser.inventory?.changed(characterId)
    onDone(await loadInventory(eraser, characterId).catch(() => null))
  }
  const forget = async () => {
    setBusy(true)
    await forgetPending(eraser, characterId).catch(() => undefined)
    onDone(null)
  }
  const names = [...new Set(pending.take.map((take) => take.name))].join(", ")
  return <div className="col-span-full flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">
    <span className="min-w-0 flex-1">
      {pending.created ? <>« {pending.name} » a été créé, mais ce qui a servi n'a pas été retiré{names ? ` (${names})` : ""}.</> : <>Une création n'a pas été terminée{pending.name ? ` (« ${pending.name} »)` : ""}. Vérifie l'inventaire avant de retirer quoi que ce soit.</>}
    </span>
    {pending.created && <Button type="button" size="sm" disabled={busy} onClick={finish}>Retirer</Button>}
    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={forget}>Oublier</Button>
  </div>
}

/** Où ranger ce qui vient d'être créé : il est déjà dans l'inventaire du personnage. */
export function Destination({ eraser, characterId, slotId, itemId, accent }: { eraser: Eraser; characterId: string; slotId: string | null; itemId: string; accent: string }) {
  const [targets, setTargets] = useState<InventoryTransferTarget[] | null>(null)
  const [choice, setChoice] = useState<"moi" | "campagne" | "joueur">("moi")
  const [sentTo, setSentTo] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let alive = true
    transferTargets(eraser, characterId).then((list) => { if (alive) setTargets(list) }).catch(() => { if (alive) setTargets([]) })
    return () => { alive = false }
  }, [eraser, characterId])
  if (!slotId) return null
  const campaigns = targets?.filter((target) => target.kind === "campaign") ?? []
  const players = targets?.filter((target) => target.kind === "character") ?? []
  const send = async (targetId: string, label: string) => {
    setBusy(true)
    setError("")
    try {
      await transfer(eraser, characterId, slotId, itemId, targetId)
      setSentTo(label)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "L'item n'a pas pu être donné.")
    } finally {
      setBusy(false)
    }
  }
  if (sentTo) return <span className="text-sm text-muted-foreground">Rangé dans {sentTo}.</span>
  const toggle = (key: typeof choice, label: string, disabled: boolean) => <button type="button" disabled={disabled || busy} aria-pressed={choice === key} onClick={() => {
    setChoice(key)
    if (key === "campagne" && campaigns.length === 1) void send(campaigns[0].id, "l'inventaire de campagne")
  }} className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40", choice === key && "font-semibold")} style={choice === key ? { color: accent, borderColor: `color-mix(in srgb, ${accent} 53%, transparent)`, background: `color-mix(in srgb, ${accent} 8%, transparent)` } : undefined}>{label}</button>
  return <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Ranger dans">
    {toggle("moi", "Mon inventaire", false)}
    {toggle("campagne", "Inventaire de campagne", !campaigns.length)}
    {toggle("joueur", "Un autre joueur", !players.length)}
    {choice === "campagne" && campaigns.length > 1 && campaigns.map((target) => <Button key={target.id} type="button" size="sm" variant="outline" disabled={busy} onClick={() => send(target.id, `l'inventaire de ${target.campaignName || target.name}`)}>{target.campaignName || target.name}</Button>)}
    {choice === "joueur" && players.map((target) => <Button key={target.id} type="button" size="sm" variant="outline" disabled={busy} onClick={() => send(target.id, `l'inventaire de ${target.name}`)}>{target.name}</Button>)}
    {error && <span className="text-xs text-destructive">{error}</span>}
  </div>
}

export { colors }
