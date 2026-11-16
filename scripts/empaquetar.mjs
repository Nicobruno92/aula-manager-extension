// Build the publishable extension and zip it for the Chrome Web Store:
// paquetes/aula-manager-extension-<version>.zip (paquetes/ is ignored by git).
//
// Always the production build: DESARROLLO is removed from the environment, and the
// zip is refused if the manifest or the code still accept the local Aula Manager,
// or if anything other than the extension's own files slipped into dist/.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";

const ARMADO = "dist";
const SALIDA = "paquetes";
const PREFIJO = "aula-manager-extension";
// Anything matching these would be a source map, a test or a development leftover.
const PROHIBIDOS = [/\.map$/, /\.test\./, /^pruebas\//, /\.ts$/, /\.DS_Store$/];
const SENALES_DE_DESARROLLO = ["localhost", "127.0.0.1", "(desarrollo)"];

function archivos(carpeta) {
  return readdirSync(carpeta, { recursive: true, withFileTypes: true })
    .filter((entrada) => entrada.isFile())
    .map((entrada) => relative(carpeta, join(entrada.parentPath, entrada.name)))
    .sort();
}

function revisar(lista) {
  const prohibidos = lista.filter((ruta) => PROHIBIDOS.some((patron) => patron.test(ruta)));
  if (prohibidos.length) throw new Error(`No van en el paquete: ${prohibidos.join(", ")}`);
  const manifiesto = readFileSync(join(ARMADO, "manifest.json"), "utf-8");
  const codigo = lista.filter((ruta) => ruta.endsWith(".js")).map((ruta) => readFileSync(join(ARMADO, ruta), "utf-8"));
  for (const senal of SENALES_DE_DESARROLLO) {
    if (manifiesto.includes(senal)) throw new Error(`El manifiesto todavía menciona «${senal}»: es la versión de desarrollo`);
    if (codigo.some((texto) => texto.includes(senal))) throw new Error(`El código armado todavía menciona «${senal}»`);
  }
  return JSON.parse(manifiesto).version;
}

const entorno = { ...process.env };
delete entorno.DESARROLLO;
execFileSync(process.execPath, ["scripts/armar.mjs"], { env: entorno, stdio: "inherit" });

const lista = archivos(ARMADO);
const version = revisar(lista);
mkdirSync(SALIDA, { recursive: true });
const zip = join(SALIDA, `${PREFIJO}-${version}.zip`);
rmSync(zip, { force: true });
// -X leaves out macOS extra attributes; the manifest must sit at the root of the zip.
execFileSync("zip", ["-X", "-q", join("..", zip), ...lista], { cwd: ARMADO, stdio: "inherit" });
console.log(`Paquete listo: ${zip} (${lista.length} archivos)`);
