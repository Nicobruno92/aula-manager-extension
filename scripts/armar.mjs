// Build the unpacked extension into dist/ (load it from chrome://extensions → «Cargar descomprimida»).
// DESARROLLO=1 also lets the local Aula Manager (localhost:8000) hand grades over; never publish that build.
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { build } from "esbuild";

const SALIDA = "dist";
const DESARROLLO = process.env.DESARROLLO === "1";
const ORIGEN_DE_DESARROLLO = "http://localhost:8000/*";

const paquete = JSON.parse(readFileSync("package.json", "utf-8"));
const manifiestoFuente = JSON.parse(readFileSync("estatico/manifest.json", "utf-8"));
// The version lives in two files (npm and Chrome); a mismatch would publish the wrong one.
if (paquete.version !== manifiestoFuente.version) {
  throw new Error(`package.json dice ${paquete.version} y estatico/manifest.json dice ${manifiestoFuente.version}`);
}

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
// AGPL-3.0: the license travels with every copy (guarani-chrome is credited on the welcome page).
cpSync("LICENSE", `${SALIDA}/LICENSE`);
if (DESARROLLO) {
  const manifiesto = JSON.parse(readFileSync(`${SALIDA}/manifest.json`, "utf-8"));
  manifiesto.content_scripts[0].matches.push(ORIGEN_DE_DESARROLLO);
  manifiesto.name += " (desarrollo)";
  writeFileSync(`${SALIDA}/manifest.json`, JSON.stringify(manifiesto, null, 2));
}
console.log(`Extensión armada en ${SALIDA}/${DESARROLLO ? ", versión de desarrollo" : ""}`);
