/**
 * Le coin « Craft », à côté de la bourse : un bouton par atelier. La Cuisine et l'Alchimie
 * s'ouvrent ; les autres ateliers viendront ensuite.
 */
import type { ReactNode } from "react"
import { Anvil, BookOpen, Brush, CookingPot, FlaskConical, Hammer, Scissors, type LucideIcon } from "lucide-react"

import type { ExtensionDialogProps, ExtensionSlotProps } from "@/lib/extension-api"
import { cn } from "@/lib/utils"

import { colors } from "./ui"

type Window = (props: ExtensionDialogProps<{ characterId: string }>) => ReactNode
// Chargées au premier clic : le module de démarrage reste petit.
const loadAlchimie = () => import("./alchimie").then((module) => module.AlchimieWindow as Window)
const loadCuisine = () => import("./cuisine").then((module) => module.CuisineWindow as Window)

const ateliers: Array<{ key: string; label: string; icon: LucideIcon; window?: () => Promise<Window> }> = [
  { key: "maquillage", label: "Maquillage", icon: Brush },
  { key: "couture", label: "Couture", icon: Scissors },
  { key: "artisanat", label: "Artisanat", icon: Hammer },
  { key: "alchimie", label: "Alchimie", icon: FlaskConical, window: loadAlchimie },
  { key: "cuisine", label: "Cuisine", icon: CookingPot, window: loadCuisine },
  { key: "oeuvrerie", label: "Œuvrerie", icon: BookOpen },
]

export function CraftCorner({ eraser, context }: ExtensionSlotProps) {
  const characterId = typeof context.characterId === "string" ? context.characterId : ""
  if (!characterId || context.readOnly === true) return null
  const color = colors.craft
  // Étiré à la hauteur de la bourse, à côté d'elle : les boutons restent centrés dans la place.
  return <div className="flex flex-col rounded-[1.4rem] border p-3" style={{ borderColor: `${color}42`, background: `linear-gradient(145deg, ${color}12, rgba(255,255,255,.015))` }}>
    <div className="mb-3 flex items-center gap-3 px-1">
      <div className="flex size-9 items-center justify-center rounded-xl" style={{ color, backgroundColor: `${color}18` }}><Anvil className="size-4.5" /></div>
      <h3 className="font-display flex-1 text-xl font-semibold" style={{ color }}>Craft</h3>
    </div>
    <div className="flex flex-1 items-center justify-center"><div className="grid grid-cols-3 gap-2">
      {ateliers.map((atelier) => {
        const Icon = atelier.icon
        const load = atelier.window
        return <button
          key={atelier.key}
          type="button"
          disabled={!load}
          onClick={async () => {
            if (!load) return
            try {
              eraser.ui.dialog<{ characterId: string }>(await load(), { title: atelier.label, props: { characterId }, wide: true })
            } catch {
              eraser.ui.toast("L'atelier n'a pas pu s'ouvrir : recharge Eraser.", { tone: "erreur" })
            }
          }}
          aria-label={load ? atelier.label : `${atelier.label} (bientôt)`}
          title={load ? atelier.label : `${atelier.label} : bientôt`}
          className={cn("flex size-11 items-center justify-center rounded-xl border bg-card/70 shadow-sm transition hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40")}
          style={{ color, borderColor: `${color}40` }}
        ><Icon className="size-5" /></button>
      })}
    </div></div>
  </div>
}
