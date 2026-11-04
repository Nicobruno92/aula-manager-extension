// SIU-Guaraní 3, autogestión: the cursada page (regularity and promotion rows) and
// the exam-board page.
//
// Derived from guarani-chrome by Facundo Manuel Quiroga (AGPL-3.0,
// https://github.com/facundoq/guarani-chrome): the page structure (.form-renglones,
// .identificacion, one <tr> per act row) comes from there. Unlike it, fields are
// found by Guaraní's own data-tipo attribute and options by their visible text, not
// by one university's option ids, so the same code works at any university.

import type { Instancia } from "../envio";
import type { Adaptador, FilaDePagina } from "./adaptador";

// Guaraní marks each field with data-tipo; the envío names them after what they mean.
const DATA_TIPO: Record<string, string> = {
  fecha: "fecha",
  nota: "nota",
  resultado: "resultado",
  condicion: "cond_regularidad",
  observacion: "observacion",
};

function instanciaDe(fila: HTMLElement, esMesa: boolean): Instancia | null {
  if (esMesa) return "examen";
  if (fila.classList.contains("js-renglon-promocion")) return "promocion";
  if (fila.classList.contains("js-renglon-regular")) return "regularidad";
  return null;
}

// "DNI 40335123" → "40335123"; a CUIT stays whole (completar.ts matches it with the DNI inside).
function documentoDe(fila: HTMLElement): string | null {
  const identificacion = fila.querySelector<HTMLElement>(".identificacion");
  return identificacion ? (identificacion.textContent ?? "").replace(/\D/g, "") : null;
}

function esMesaDeExamen(documento: Document): boolean {
  // The URL says it in every installation; the sample pages and tests have no URL, so the fields say it too.
  return documento.location?.pathname.startsWith("/notas_mesa_examen") ||
    documento.querySelector('.form-renglones select.nota[data-tipo="nota"]') !== null;
}

export const guarani: Adaptador = {
  id: "guarani",
  nombre: "SIU-Guaraní",
  plataforma: "guarani",

  reconoce(documento) {
    // The loading pages hold the grade form inside the «renglones» pagelet.
    return documento.querySelector('#renglones .form-renglones [data-tipo="fecha"]') !== null;
  },

  filas(documento) {
    const esMesa = esMesaDeExamen(documento);
    const filas: FilaDePagina[] = [];
    // The promotion row has no student box: it belongs to the previous row with the same data-renglon.
    let ultimoDocumento: string | null = null;
    for (const fila of documento.querySelectorAll<HTMLTableRowElement>("#renglones tbody tr")) {
      const instancia = instanciaDe(fila, esMesa);
      const documentoDeLaFila: string | null = documentoDe(fila) ?? ultimoDocumento;
      if (instancia === null || !documentoDeLaFila) continue;
      ultimoDocumento = documentoDeLaFila;
      filas.push({
        documento: documentoDeLaFila,
        instancia,
        elemento: fila,
        campo: (nombre) => {
          const tipo = DATA_TIPO[nombre];
          return tipo ? fila.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-tipo="${tipo}"]`) : null;
        },
      });
    }
    return filas;
  },

  lugarDelPanel(documento) {
    return documento.querySelector<HTMLElement>("#renglones .form-renglones")!;
  },

  despuesDeCompletar(documento) {
    // Guaraní enables «Guardar» on keystrokes; values set by script leave it disabled (as guarani-chrome found).
    const guardar = documento.getElementById("js-btn-guardar") as HTMLInputElement | null;
    if (guardar) guardar.disabled = false;
  },
};
