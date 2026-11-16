// What the Chrome Web Store checks before anyone tries the extension: the manifest,
// the icons and the privacy policy links.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..");
const POLITICA_DE_PRIVACIDAD = "https://aula-manager.com/privacidad/#extension";
const LARGO_MAXIMO_DE_LA_DESCRIPCION = 132;

const manifiesto = JSON.parse(readFileSync(join(RAIZ, "estatico", "manifest.json"), "utf-8"));
const paquete = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf-8"));

// A PNG stores its width and height as big-endian integers at bytes 16 and 20.
function tamanoDelPng(ruta: string): [number, number] {
  const datos = readFileSync(join(RAIZ, "estatico", ruta));
  return [datos.readUInt32BE(16), datos.readUInt32BE(20)];
}

test("la versión es la misma para npm y para Chrome", () => {
  expect(manifiesto.version).toBe(paquete.version);
});

test("la descripción entra en lo que permite el Store", () => {
  expect(manifiesto.description.length).toBeLessThanOrEqual(LARGO_MAXIMO_DE_LA_DESCRIPCION);
});

test("cada ícono existe y tiene el tamaño que dice el manifiesto", () => {
  const iconos = { ...manifiesto.icons, ...manifiesto.action.default_icon };
  expect(Object.keys(manifiesto.icons)).toEqual(["16", "32", "48", "128"]);
  for (const [tamano, ruta] of Object.entries(iconos) as [string, string][]) {
    expect(existsSync(join(RAIZ, "estatico", ruta)), ruta).toBe(true);
    expect(tamanoDelPng(ruta), ruta).toEqual([Number(tamano), Number(tamano)]);
  }
});

test("solo acepta notas de aula-manager.com", () => {
  expect(manifiesto.content_scripts.flatMap((c: { matches: string[] }) => c.matches)).toEqual(["https://aula-manager.com/*"]);
  expect(manifiesto.host_permissions).toBeUndefined();
});

test("el popup y la bienvenida llevan a la política de privacidad", () => {
  for (const pagina of ["popup.html", "bienvenida.html"]) {
    expect(readFileSync(join(RAIZ, "estatico", pagina), "utf-8"), pagina).toContain(POLITICA_DE_PRIVACIDAD);
  }
});
