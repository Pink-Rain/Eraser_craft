/** La roue crantée de l'extension, sur sa ligne d'Administration › Extensions : administrateurs seulement. */
import { Settings } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ExtensionSlotProps } from "@/lib/extension-api"

export function SettingsGear({ eraser, context }: ExtensionSlotProps) {
  if (context.id !== eraser.extension.id || eraser.account.role !== "admin") return null
  return <Button type="button" variant="ghost" size="icon" aria-label="Réglages des ateliers" title="Réglages des ateliers" onClick={async () => {
    try {
      const { SettingsWindow } = await import("./settings-dialog")
      eraser.ui.dialog(SettingsWindow, { title: "Réglages des ateliers", description: "Où chaque atelier lit ses items, et lesquels il reconnaît.", wide: true })
    } catch {
      eraser.ui.toast("Les réglages n'ont pas pu s'ouvrir : recharge Eraser.", { tone: "erreur" })
    }
  }}>
    <Settings />
  </Button>
}

