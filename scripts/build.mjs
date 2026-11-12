// Construit l'extension dans dist/ :
//   boot.js      le module de démarrage (`activate(eraser)`), petit ; les fenêtres des ateliers
//                sont dans parts/, chargées au premier clic (import relatif à boot.js)
//   craft.css    ses classes Tailwind, posées sur toutes les pages (`globalStyles`)
//   server.mjs   sa partie serveur (réglages, catalogue, carnets), pour Node
//
// - Tout import « @/… », React et le routeur de Next sont empruntés à Eraser au moment de
//   l'exécution (`window.EraserExtensions.require`, components/eraser/extension-modules.ts).
// - Le React Compiler passe sur src/, comme sur le code d'Eraser.
// - Les classes Tailwind de src/ sont compilées avec le thème d'Eraser (lu dans son
//   app/globals.css), sans ses styles de base, et sans les classes qu'Eraser produit lui-même
//   (rejouées après sa feuille, elles passeraient devant ses variantes).
//
// Le code d'Eraser (pour son thème, et ses types : scripts/check-types.mjs) est cherché dans
// $ERASER_DIR, sinon ./eraser (une copie du dépôt Pink-Rain/Eraser).
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { transformAsync } from "@babel/core"
import { build } from "esbuild"

const root = resolve(import.meta.dirname, "..")
const eraser = resolve(process.env.ERASER_DIR || join(root, "eraser"))
if (!existsSync(join(eraser, "app", "globals.css"))) throw new Error(`Copie d'Eraser introuvable : ${eraser} (ERASER_DIR)`)
const dist = join(root, "dist")
const work = join(root, "build")
await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
await mkdir(work, { recursive: true })

/** Ce qu'Eraser prête : un module CommonJS qui rend celui d'Eraser (imports nommés compris). */
const lentPackages = new Set(["react", "react/jsx-runtime", "react/compiler-runtime", "react-dom", "react-dom/client", "next/link", "next/navigation"])
// La liste de ce qu'Eraser prête vraiment (components/eraser/extension-modules.ts) : un import
// qu'il ne prête pas ferait tomber l'extension à l'ouverture (« Eraser ne prête pas… »).
const lending = await readFile(join(eraser, "components", "eraser", "extension-modules.ts"), "utf8")
const lentIds = new Set([...lending.matchAll(/^\s*"([^"]+)": lent\(/gm)].map((match) => match[1]))
const borrowed = new Set()
const eraserModules = {
  name: "eraser-modules",
  setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      if (!args.path.startsWith("@/") && !lentPackages.has(args.path)) return undefined
      borrowed.add(args.path)
      return { path: args.path, namespace: "eraser" }
    })
    builder.onLoad({ filter: /.*/, namespace: "eraser" }, (args) => ({
      contents: `module.exports = window.EraserExtensions.require(${JSON.stringify(args.path)})`,
      loader: "js",
    }))
  },
}

/** Le React Compiler sur chaque fichier de src/. */
const reactCompiler = {
  name: "react-compiler",
  setup(builder) {
    builder.onLoad({ filter: /[\\/]src[\\/].*\.tsx?$/ }, async (args) => {
      const source = await readFile(args.path, "utf8")
      const result = await transformAsync(source, {
        filename: args.path,
        babelrc: false,
        configFile: false,
        parserOpts: { plugins: ["jsx", "typescript"] },
        plugins: [["babel-plugin-react-compiler", {}]],
      })
      return { contents: result?.code ?? source, loader: args.path.endsWith(".tsx") ? "tsx" : "ts" }
    })
  },
}

await build({
  entryPoints: { boot: join(root, "src", "boot.tsx") },
  outdir: dist,
  chunkNames: "parts/[name]-[hash]",
  splitting: true,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  plugins: [eraserModules, reactCompiler],
  logLevel: "warning",
})
// La partie serveur : un seul module pour Node, sans rien d'Eraser (il lui prête `eraser` à l'appel).
await build({
  entryPoints: [join(root, "src", "server.ts")],
  outfile: join(dist, "server.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  minify: true,
  legalComments: "none",
  logLevel: "warning",
  plugins: [{ name: "server-alone", setup(builder) { builder.onResolve({ filter: /^@\// }, (args) => ({ errors: [{ text: `La partie serveur n'importe rien d'Eraser : ${args.path}` }] })) } }],
})
const missing = [...borrowed].filter((id) => !lentIds.has(id)).sort()
if (missing.length) throw new Error(`Eraser (${eraser}) ne prête pas : ${missing.join(", ")}. Les ajouter à components/eraser/extension-modules.ts d'Eraser (publié d'abord), ou les garder dans src/.`)

/** Les règles de thème d'Eraser (`@theme`, `@utility`, `@custom-variant`), sans le reste de sa feuille. */
function themeRules(css) {
  const rules = []
  let index = 0
  while (index < css.length) {
    const match = /^@(theme|utility|custom-variant)\b/m.exec(css.slice(index))
    if (!match) break
    const start = index + match.index
    const semicolon = css.indexOf(";", start)
    const brace = css.indexOf("{", start)
    if (brace < 0 || (semicolon >= 0 && semicolon < brace)) { rules.push(css.slice(start, semicolon + 1)); index = semicolon + 1; continue }
    let depth = 0
    let end = brace
    for (; end < css.length; end += 1) {
      if (css[end] === "{") depth += 1
      else if (css[end] === "}") { depth -= 1; if (depth === 0) break }
    }
    rules.push(css.slice(start, end + 1))
    index = end + 1
  }
  return rules.join("\n\n")
}

const globals = await readFile(join(eraser, "app", "globals.css"), "utf8")
// Les classes que contient le code d'Eraser : sa feuille les a déjà.
const { Scanner } = createRequire(import.meta.url)("@tailwindcss/oxide")
const eraserClasses = new Scanner({ sources: ["app", "components", "lib", "hooks"].map((folder) => ({ base: join(eraser, folder), pattern: "**/*", negated: false })) })
  .scan()
  .filter((candidate) => !/["\\{}\s]/.test(candidate))
const input = join(work, "style.css")
await writeFile(input, [
  "@layer theme, base, components, utilities;",
  '@import "tailwindcss/theme.css" layer(theme);',
  '@import "tailwindcss/utilities.css" layer(utilities) source(none);',
  '@import "tw-animate-css";',
  `@import ${JSON.stringify(join(eraser, "vendor", "shadcn-tailwind-4.13.0.css"))};`,
  `@source ${JSON.stringify(join(root, "src"))};`,
  `@source not inline(${JSON.stringify(eraserClasses.join(" "))});`,
  themeRules(globals),
  "",
].join("\n"))
execFileSync(process.execPath, [join(root, "node_modules", "@tailwindcss", "cli", "dist", "index.mjs"), "-i", input, "-o", join(dist, "craft.css"), "--minify"], { cwd: root, stdio: "inherit" })
console.log("dist/boot.js (et dist/parts/), dist/craft.css et dist/server.mjs construits.")
