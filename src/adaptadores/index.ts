// Every platform the extension knows. A new one is a file in this folder plus a line here.
import type { Adaptador } from "./adaptador";
import { guarani } from "./guarani";

export const ADAPTADORES: Adaptador[] = [guarani];

export function adaptadorPara(documento: Document): Adaptador | undefined {
  return ADAPTADORES.find((a) => a.reconoce(documento));
}
