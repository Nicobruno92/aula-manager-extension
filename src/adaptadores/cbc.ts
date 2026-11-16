// «Gestión de Actas CBC» (UBA): the act of a regulares commission and the act of the
// libres exam. Built from the tutorial video only: the HTML of a real act has not been
// seen yet, so every selector here goes by what the screen shows (header texts, the
// system's name, the paginator's «1 – 10 of N») and not by ids or classes.
//
// A CONFIRMAR con la página real (guardada con un acta abierta):
// - qué control tiene cada celda editable (<input>, <select> nativo o mat-select de
//   Angular Material; un mat-select no es un <select> y este adaptador no lo llena);
// - si la tabla es <table> o <mat-table> con role="row"/"cell" (se aceptan las dos);
// - si una celda sin nota trae «A» (ausente) o queda vacía al abrir el acta;
// - las opciones exactas de Condición (en pantalla se leen PROM, EXA, INS, AUS);
// - si Cursada y Condición se calculan solas a partir de los parciales;
// - el texto exacto del paginador (Angular lo trae en inglés: «1 – 10 of 37»).

import type { Instancia } from "../envio";
import { normalizar } from "../completar";
import type { Adaptador, FilaDePagina } from "./adaptador";

type Control = HTMLInputElement | HTMLSelectElement;

// Envío field → column header as the act shows it (compared without accents or case).
const COLUMNAS: Record<string, string> = {
  primer_parcial: "primer parcial",
  segundo_parcial: "segundo parcial",
  condicion: "condicion",
  nota: "nota",
};
const COLUMNA_DNI = "dni";
// The toolbar says «Gestión de Actas CBC» and the login «Sistema de Actas»; either one names the system.
const NOMBRES_DEL_SISTEMA = ["gestion de actas cbc", "sistema de actas"];
const TITULO_DE_LIBRES = "examen libre";
const BOTON_ABRIR_ACTA = "abrir acta";

// Angular Material renders either a native table or <mat-table> with ARIA roles.
const SELECTOR_FILAS = "tr, [role='row']";
const SELECTOR_CELDAS = "th, td, [role='columnheader'], [role='cell'], [role='gridcell']";
const SELECTOR_TABLA = "table, [role='table'], [role='grid'], mat-table";
// Angular Material 15+ and older versions name the paginator's «1 – 10 of 37» label differently.
const SELECTOR_RANGO = ".mat-mdc-paginator-range-label, .mat-paginator-range-label";
const RANGO = /(\d+)\s*[–-]\s*(\d+)\s*(?:of|de)\s*(\d+)/i;

function textoDe(elemento: Element | null | undefined): string {
  return normalizar(elemento?.textContent ?? "");
}

function celdas(fila: Element): Element[] {
  return Array.from(fila.querySelectorAll(SELECTOR_CELDAS)).filter((c) => c.closest(SELECTOR_FILAS) === fila);
}

// The table whose header row names a DNI and a Nota column: the act itself, not the
// list of acts (that one has neither).
function tablaDelActa(documento: Document): { encabezados: string[]; filas: HTMLElement[] } | null {
  for (const encabezado of documento.querySelectorAll<HTMLElement>(SELECTOR_FILAS)) {
    const textos = celdas(encabezado).map(textoDe);
    if (!textos.includes(COLUMNA_DNI) || !textos.includes(COLUMNAS.nota)) continue;
    const tabla = encabezado.closest(SELECTOR_TABLA) ?? encabezado.parentElement!;
    const filas = Array.from(tabla.querySelectorAll<HTMLElement>(SELECTOR_FILAS)).filter((f) => f !== encabezado);
    return { encabezados: textos, filas };
  }
  return null;
}

function esSistemaDeActasCbc(documento: Document): boolean {
  const texto = `${normalizar(documento.title)} ${textoDe(documento.body)}`;
  return NOMBRES_DEL_SISTEMA.some((nombre) => texto.includes(nombre));
}

// The side panel says «Examen LIBRE» on the libres act and «Comisión 70804» on a commission's.
function esActaDeLibres(documento: Document): boolean {
  return textoDe(documento.body).includes(TITULO_DE_LIBRES);
}

function controlEn(celda: Element | undefined): Control | null {
  return celda?.querySelector<Control>("input:not([type='hidden']), select") ?? null;
}

// An act that was never edited shows «Abrir Acta» and no editable cells yet.
function sinAbrir(documento: Document): boolean {
  return Array.from(documento.querySelectorAll("button")).some((b) => textoDe(b) === BOTON_ABRIR_ACTA);
}

// «1 – 10 of 37» → the rows shown and the total, when the paginator hides some.
function rangoDelPaginador(documento: Document): { desde: number; hasta: number; total: number } | null {
  const etiqueta = documento.querySelector(SELECTOR_RANGO) ?? documento.querySelector("mat-paginator");
  const encontrado = RANGO.exec(etiqueta?.textContent ?? "");
  if (!encontrado) return null;
  const [desde, hasta, total] = encontrado.slice(1).map(Number);
  return { desde, hasta, total };
}

export const cbc: Adaptador = {
  id: "cbc",
  nombre: "Actas del CBC",
  plataforma: "cbc",
  botones: { guardar: "Grabar Notas", cerrar: "Cerrar Acta" },
  // A CONFIRMAR: an act just opened shows «A» in every grade and «AUS» in Condición.
  vacios: ["a", "aus"],

  reconoce(documento) {
    return esSistemaDeActasCbc(documento) && tablaDelActa(documento) !== null;
  },

  filas(documento) {
    const tabla = tablaDelActa(documento);
    if (!tabla) return [];
    // One row per student in both acts: the commission's act carries the cursada, the libres act the exam.
    const instancia: Instancia = esActaDeLibres(documento) ? "examen" : "regularidad";
    const columnaDni = tabla.encabezados.indexOf(COLUMNA_DNI);
    const filas: FilaDePagina[] = [];
    for (const fila of tabla.filas) {
      const propias = celdas(fila);
      const documentoDeLaFila = (propias[columnaDni]?.textContent ?? "").replace(/\D/g, "");
      // The «Filtrar por Apellido» and paginator rows have no DNI.
      if (!documentoDeLaFila) continue;
      filas.push({
        documento: documentoDeLaFila,
        instancia,
        elemento: fila,
        campo: (nombre) => {
          const columna = COLUMNAS[nombre];
          return columna ? controlEn(propias[tabla.encabezados.indexOf(columna)]) : null;
        },
      });
    }
    return filas;
  },

  lugarDelPanel(documento) {
    const tabla = tablaDelActa(documento)!;
    const primera = tabla.filas[0] ?? documento.body;
    return (primera.closest(SELECTOR_TABLA) as HTMLElement | null) ?? primera;
  },

  avisos(documento) {
    const avisos: string[] = [];
    if (sinAbrir(documento)) {
      avisos.push("Esta acta todavía no está abierta. Tocá «Abrir Acta» en la plataforma y después volvé a «Completar esta página». La extensión no la abre.");
    }
    const rango = rangoDelPaginador(documento);
    if (rango && (rango.desde > 1 || rango.hasta < rango.total)) {
      avisos.push(`Esta página muestra los alumnos ${rango.desde} a ${rango.hasta} de ${rango.total}: solo se completan esos. Grabá, pasá a la página siguiente y volvé a tocar «Completar esta página», o elegí más filas en «Items per page».`);
    }
    return avisos;
  },
};
