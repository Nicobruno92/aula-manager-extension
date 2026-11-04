// The contract every platform implements: find the rows on the page and the field
// elements inside them. Filling, matching and marking are shared (completar.ts).

import type { Instancia } from "../envio";

export interface FilaDePagina {
  // Identity as the page shows it: digits only, DNI or CUIT.
  documento: string;
  instancia: Instancia;
  // The row element, to mark it; for multi-row students, the row of this instance.
  elemento: HTMLElement;
  // The element that holds ``campo`` in this row, if the platform has it here.
  campo(nombre: string): HTMLInputElement | HTMLSelectElement | null;
}

export interface Adaptador {
  id: string;
  nombre: string;
  plataforma: string; // matches Envio.plataforma
  // True when the document is a grade-loading page this adapter understands.
  reconoce(documento: Document): boolean;
  filas(documento: Document): FilaDePagina[];
  // Where the panel goes: right before this element.
  lugarDelPanel(documento: Document): HTMLElement;
  // Anything the platform needs once fields changed programmatically.
  despuesDeCompletar?(documento: Document): void;
}
