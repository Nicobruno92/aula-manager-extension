// Build the unpacked extension into dist/ (load it from chrome://extensions → «Cargar descomprimida»).
// DESARROLLO=1 also lets the local Aula Manager (localhost:8000) hand grades over; never publish that build.
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { build } from "esbuild";

const SALIDA = "dist";
const DESARROLLO = process.env.DESARROLLO === "1";
const ORIGEN_DE_DESARROLLO = "http://localhost:8000/*";

rmSync(SALIDA, { recursive: true, force: true });
await build({
  entryPoints: ["src/fondo.ts", "src/puente.ts", "src/pagina.ts", "src/popup.ts", "src/bienvenida.ts"],
  bundle: true,
  // Content and injected scripts are classic scripts: each one wraps its own scope.
  format: "iife",
  target: "chrome120",
  outdir: SALIDA,
  define: { __DESARROLLO__: String(DESARROLLO) },
});
cpSync("estatico", SALIDA, { recursive: true });
if (DESARROLLO) {
  const manifiesto = JSON.parse(readFileSync(`${SALIDA}/manifest.json`, "utf-8"));
  manifiesto.content_scripts[0].matches.push(ORIGEN_DE_DESARROLLO);
  manifiesto.name += " (desarrollo)";
  writeFileSync(`${SALIDA}/manifest.json`, JSON.stringify(manifiesto, null, 2));
}
console.log(`Extensión armada en ${SALIDA}/${DESARROLLO ? ", versión de desarrollo" : ""}`);
