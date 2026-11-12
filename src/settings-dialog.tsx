/**
 * Les réglages des ateliers, derrière la roue crantée de l'extension (Administration ›
 * Extensions) : l'index de chaque atelier, les colonnes qu'il lit, les types d'items qu'il
 * reconnaît. Les colonnes se créent dans Google Sheets, sous le nom qu'on veut, puis se choisissent ici.
 */
import { useEffect, useState, type ReactNode } from "react"
import { CookingPot, FlaskConical, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { ExtensionDialogProps } from "@/lib/extension-api"

import { serverJson } from "./inventory"
import { normalizeSettings, type CraftSettings } from "./settings"
import { Label, Notice, colors } from "./ui"

type IndexSummary = { key: string; title: string; tabs: Array<{ name: string; columns: string[] }> }

export function SettingsWindow({ eraser, close }: ExtensionDialogProps) {
  const [settings, setSettings] = useState<CraftSettings | null>(null)
  const [indexes, setIndexes] = useState<IndexSummary[] | null>(null)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let alive = true
    serverJson<{ settings: CraftSettings }>(eraser, "reglages").then((data) => { if (alive) setSettings(data.settings) }).catch((reason: unknown) => { if (alive) setError(reason instanceof Error ? reason.message : "Les réglages n'ont pas pu être lus.") })
    serverJson<{ indexes: IndexSummary[] }>(eraser, "index").then((data) => { if (alive) setIndexes(data.indexes) }).catch((reason: unknown) => { if (alive) { setIndexes([]); setError(reason instanceof Error ? reason.message : "Les index n'ont pas pu être lus.") } })
    return () => { alive = false }
  }, [eraser])

  if (!settings) return error ? <Notice tone="erreur">{error}</Notice> : <div className="flex min-h-40 items-center justify-center" aria-busy="true"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>

  const columnsOf = (key: string) => {
    const index = indexes?.find((entry) => entry.key === key)
    return index ? [...new Set(index.tabs.flatMap((tab) => tab.columns))].sort((a, b) => a.localeCompare(b, "fr")) : []
  }
  const indexSelect = (value: string, onChange: (value: string) => void) => <NativeSelect value={value} onChange={(event) => onChange(event.target.value)} disabled={!indexes} className="w-full">
    {!indexes?.some((entry) => entry.key === value) && <NativeSelectOption value={value}>{indexes ? value : "Chargement…"}</NativeSelectOption>}
    {indexes?.map((entry) => <NativeSelectOption key={entry.key} value={entry.key}>{entry.title}</NativeSelectOption>)}
  </NativeSelect>
  const columnSelect = (index: string, value: string, onChange: (value: string) => void, optional = true) => {
    const columns = columnsOf(index)
    const absent = value && !columns.includes(value)
    return <NativeSelect value={value} onChange={(event) => onChange(event.target.value)} disabled={!indexes} className="w-full">
      {optional && <NativeSelectOption value="">Aucune</NativeSelectOption>}
      {absent && <NativeSelectOption value={value}>{value}{indexes ? " (absente de l'index)" : ""}</NativeSelectOption>}
      {columns.map((column) => <NativeSelectOption key={column} value={column}>{column}</NativeSelectOption>)}
    </NativeSelect>
  }
  const typesInput = (value: string[], onChange: (value: string[]) => void, placeholder: string) => <TypesInput value={value} onChange={onChange} placeholder={placeholder} />

  const cuisine = settings.cuisine
  const alchimie = settings.alchimie
  const setCuisine = (change: Partial<CraftSettings["cuisine"]>) => setSettings({ ...settings, cuisine: { ...cuisine, ...change } })
  const setAlchimie = (change: Partial<CraftSettings["alchimie"]>) => setSettings({ ...settings, alchimie: { ...alchimie, ...change } })

  const save = async () => {
    setSaving(true)
    setError("")
    try {
      await serverJson(eraser, "reglages", { method: "PUT", body: normalizeSettings(settings) })
      eraser.ui.toast("Réglages des ateliers enregistrés.")
      close()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Les réglages n'ont pas pu être enregistrés.")
      setSaving(false)
    }
  }

  return <div className="grid gap-4">
    {error && <Notice tone="erreur" onClose={() => setError("")}>{error}</Notice>}
    <Section icon={<CookingPot className="size-4" />} color={colors.cuisine} title="Cuisine">
      <Field label="Index des ingrédients">{indexSelect(cuisine.index, (index) => setCuisine({ index }))}</Field>
      <Field label="Colonne du nom">{columnSelect(cuisine.index, cuisine.nameColumn, (nameColumn) => setCuisine({ nameColumn }), false)}</Field>
      <Field label="Nutrition crue">{columnSelect(cuisine.index, cuisine.rawColumn, (rawColumn) => setCuisine({ rawColumn }))}</Field>
      <Field label="Nutrition cuite">{columnSelect(cuisine.index, cuisine.cookedColumn, (cookedColumn) => setCuisine({ cookedColumn }))}</Field>
      <Field label="Portions">{columnSelect(cuisine.index, cuisine.portionsColumn, (portionsColumn) => setCuisine({ portionsColumn }))}</Field>
      <Field label="Types des ingrédients">{typesInput(cuisine.ingredientTypes, (ingredientTypes) => setCuisine({ ingredientTypes }), "Ingrédient, Nourriture")}</Field>
      <Field label="Types des contenants">{typesInput(cuisine.containerTypes, (containerTypes) => setCuisine({ containerTypes }), "Contenant")}</Field>
      <Field label="Type du plat"><div className="grid grid-cols-2 gap-2"><Input value={cuisine.resultType} onChange={(event) => setCuisine({ resultType: event.target.value })} placeholder="Type" aria-label="Type du plat" /><Input value={cuisine.resultSubtype} onChange={(event) => setCuisine({ resultSubtype: event.target.value })} placeholder="Sous-type" aria-label="Sous-type du plat" /></div></Field>
    </Section>
    <Section icon={<FlaskConical className="size-4" />} color={colors.alchimie} title="Alchimie">
      <Field label="Index des items">{indexSelect(alchimie.index, (index) => setAlchimie({ index }))}</Field>
      <Field label="Colonne du nom">{columnSelect(alchimie.index, alchimie.nameColumn, (nameColumn) => setAlchimie({ nameColumn }), false)}</Field>
      <Field label="Famille d'une base">{columnSelect(alchimie.index, alchimie.familyColumn, (familyColumn) => setAlchimie({ familyColumn }))}</Field>
      <Field label="Doses d'un récipient">{columnSelect(alchimie.index, alchimie.dosesColumn, (dosesColumn) => setAlchimie({ dosesColumn }))}</Field>
      <Field label="Types des bases">{typesInput(alchimie.baseTypes, (baseTypes) => setAlchimie({ baseTypes }), "Base")}</Field>
      <Field label="Types des ingrédients">{typesInput(alchimie.ingredientTypes, (ingredientTypes) => setAlchimie({ ingredientTypes }), "Alchimie")}</Field>
      <Field label="Types des récipients">{typesInput(alchimie.vesselTypes, (vesselTypes) => setAlchimie({ vesselTypes }), "Récipient")}</Field>
      <Field label="Type du consommable"><Input value={alchimie.resultType} onChange={(event) => setAlchimie({ resultType: event.target.value })} placeholder="Consommable" aria-label="Type du consommable" /></Field>
    </Section>
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={close}>Annuler</Button>
      <Button type="button" disabled={saving} onClick={save}>{saving && <LoaderCircle className="animate-spin" />}Enregistrer</Button>
    </div>
  </div>
}

/** Des types séparés par des virgules. */
function TypesInput({ value, onChange, placeholder }: { value: string[]; onChange: (value: string[]) => void; placeholder: string }) {
  const [text, setText] = useState(value.join(", "))
  return <Input value={text} onChange={(event) => { setText(event.target.value); onChange(event.target.value.split(/[,;]/).map((entry) => entry.trim()).filter(Boolean)) }} placeholder={placeholder} />
}

function Section({ icon, color, title, children }: { icon: ReactNode; color: string; title: string; children: ReactNode }) {
  return <section className="grid gap-3 rounded-xl border border-border/70 bg-background/45 p-3.5">
    <h3 className="flex items-center gap-2 font-display text-lg font-semibold" style={{ color }}><span className="grid size-7 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>{icon}</span>{title}</h3>
    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">{children}</div>
  </section>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid min-w-0 gap-1.5"><Label>{label}</Label><div className="min-w-0 [&>[class*=group\/native-select]]:w-full">{children}</div></div>
}
