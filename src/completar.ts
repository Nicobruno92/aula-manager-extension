// Fill a platform's grade form from an envío, through any adapter.
//
// Nothing is saved here: the docente reviews the marked rows and presses the
// platform's own save button.

import type { Adaptador, FilaDePagina } from "./adaptadores/adaptador";
import type { AlumnoEnviado, Campos, Envio } from "./envio";

// Fields that make the platform recalculate others go first; «resultado» last, so
// the value sent wins over the one Guaraní derives from the grade or condition. The
// CBC act may derive Cursada and Condición from the parciales: those go before both.
const ORDEN_DE_CAMPOS = ["fecha", "primer_parcial", "segundo_parcial", "nota", "condicion", "resultado", "observacion"];

export type Estado = "completado" | "ya_tenia" | "con_problemas" | "no_encontrado" | "sin_datos";

export interface ResultadoDeFila {
  fila: FilaDePagina;
  estado: Estado;
  problemas: string[]; // why the row was left untouched
  avisos: string[]; // fields skipped while the rest was written
}

export interface Resumen {
  filas: ResultadoDeFila[];
  cuantos: Record<Estado, number>;
}

export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function sinCeros(digitos: string): string {
  return digitos.replace(/^0+/, "");
}

// Some students have their CUIT where the DNI goes: 27-41000002-3 holds DNI 41000002.
function mismaPersona(documento: string, dni: string): boolean {
  if (sinCeros(documento) === sinCeros(dni)) return true;
  return documento.length === 11 && sinCeros(documento.slice(2, 10)) === sinCeros(dni);
}

function buscarAlumno(envio: Envio, documento: string): AlumnoEnviado | undefined {
  return envio.alumnos.find((a) => mismaPersona(documento, a.dni));
}

function valorActual(elemento: HTMLInputElement | HTMLSelectElement): string {
  if (elemento instanceof HTMLSelectElement) {
    // Guaraní's empty option is "-" with an empty value.
    return elemento.value === "" ? "" : normalizar(elemento.selectedOptions[0]?.textContent ?? "");
  }
  return elemento.value.trim();
}

function opcionPara(select: HTMLSelectElement, valor: string): HTMLOptionElement | undefined {
  const buscado = normalizar(valor);
  return Array.from(select.options).find((o) => o.value !== "" && normalizar(o.textContent ?? "") === buscado);
}

function escribir(elemento: HTMLInputElement | HTMLSelectElement, valor: string): void {
  elemento.value = valor;
  // Angular forms (CBC) read inputs on «input»; Guaraní's delegated jQuery handlers
  // and Angular's native selects listen to «change». Both have to bubble.
  elemento.dispatchEvent(new Event("input", { bubbles: true }));
  elemento.dispatchEvent(new Event("change", { bubbles: true }));
}

// All or nothing: a row is written only when every field it gets can take its value,
// so an official act never ends up half loaded.
// ``vacios`` are the normalized texts that count as «nothing loaded yet» on this platform.
function completarFila(fila: FilaDePagina, campos: Campos, sobrescribir: boolean, vacios: string[]): ResultadoDeFila {
  const problemas: string[] = [];
  const avisos: string[] = [];
  const escrituras: [HTMLInputElement | HTMLSelectElement, string][] = [];
  let yaTenian = 0;
  for (const nombre of Object.keys(campos).sort((a, b) => indice(a) - indice(b))) {
    const elemento = fila.campo(nombre);
    if (!elemento) {
      problemas.push(`esta página no tiene ${nombre}`);
    } else if (elemento.disabled) {
      // The platform locks a field that does not apply to this row (the cursada grade of a promotion act).
      avisos.push(`${nombre} está bloqueado en la plataforma`);
    } else if (!vacios.includes(normalizar(valorActual(elemento))) && !sobrescribir) {
      yaTenian += 1;
    } else if (elemento instanceof HTMLSelectElement) {
      const opcion = opcionPara(elemento, campos[nombre]);
      if (opcion) escrituras.push([elemento, opcion.value]);
      else problemas.push(`«${campos[nombre]}» no es una opción de ${nombre}`);
    } else {
      escrituras.push([elemento, campos[nombre]]);
    }
  }
  if (problemas.length) return { fila, estado: "con_problemas", problemas, avisos };
  for (const [elemento, valor] of escrituras) escribir(elemento, valor);
  const estado: Estado = escrituras.length === 0 && yaTenian > 0 ? "ya_tenia" : "completado";
  return { fila, estado, problemas, avisos };
}

function indice(nombre: string): number {
  const i = ORDEN_DE_CAMPOS.indexOf(nombre);
  return i === -1 ? ORDEN_DE_CAMPOS.length : i;
}

export function completar(adaptador: Adaptador, documento: Document, envio: Envio, sobrescribir: boolean): Resumen {
  const vacios = ["", ...(adaptador.vacios ?? []).map(normalizar)];
  const filas = adaptador.filas(documento).map((fila): ResultadoDeFila => {
    const alumno = buscarAlumno(envio, fila.documento);
    if (!alumno) return { fila, estado: "no_encontrado", problemas: [], avisos: [] };
    const campos = alumno.instancias[fila.instancia];
    if (!campos || Object.keys(campos).length === 0) return { fila, estado: "sin_datos", problemas: [], avisos: [] };
    return completarFila(fila, campos, sobrescribir, vacios);
  });
  const cuantos = { completado: 0, ya_tenia: 0, con_problemas: 0, no_encontrado: 0, sin_datos: 0 };
  for (const r of filas) cuantos[r.estado] += 1;
  if (cuantos.completado + cuantos.con_problemas > 0) adaptador.despuesDeCompletar?.(documento);
  return { filas, cuantos };
}
