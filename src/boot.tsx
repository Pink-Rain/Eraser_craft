/**
 * Le démarrage de l'extension (API 5) : le coin « Craft » à côté de la bourse de chaque
 * personnage, et la roue de réglages sur sa ligne d'Administration › Extensions. Les fenêtres
 * des ateliers s'ouvrent avec `eraser.ui.dialog`, le cadre de fenêtre d'Eraser.
 */
import type { Eraser } from "@/lib/extension-api"

import { CraftCorner } from "./corner"
import { SettingsGear } from "./settings-gear"

export function activate(eraser: Eraser) {
  eraser.slots.add("inventaire.bourse", CraftCorner)
  eraser.slots.add("administration.extension", SettingsGear)
}
