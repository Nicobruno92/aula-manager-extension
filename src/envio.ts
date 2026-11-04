// What Aula Manager hands to the extension: one commission's grades for one platform.
//
// The page builds it on the server and passes it through the bridge content script
// (puente.ts); nothing here talks to Aula Manager over the network.

export const VERSION_DEL_ENVIO = 1;

// An act row in the platform: Guaraní has a regularity row and a promotion row per
// student on the cursada page, and one row on an exam board.
export type Instancia = "regularidad" | "promocion" | "examen";

// Field name → value as the platform shows it ("Regular", "Aprobado", "7", "12/12/2026").
export type Campos = Record<string, string>;

export interface AlumnoEnviado {
  dni: string;
  instancias: Partial<Record<Instancia, Campos>>;
}

export interface Envio {
  version: number;
  plataforma: string; // "guarani" for now: which adapters may use it
  comision: string; // shown to the docente, so they know whose grades are loaded
  generado: string; // ISO time, from Aula Manager
  alumnos: AlumnoEnviado[];
}

const SOLO_DIGITOS = /^\d{7,11}$/;
const INSTANCIAS: Instancia[] = ["regularidad", "promocion", "examen"];
// Act fields any adapter may fill; anything else in a page's envío is dropped, never stored.
export const CAMPOS_CONOCIDOS = ["fecha", "nota", "resultado", "condicion", "observacion"];

function leerCampos(datos: unknown): Campos {
  const campos: Campos = {};
  for (const nombre of CAMPOS_CONOCIDOS) {
    const valor = (datos as Record<string, unknown>)?.[nombre];
    if (valor === undefined) continue;
    if (typeof valor !== "string") throw new Error("Un valor del envío no es texto");
    campos[nombre] = valor;
  }
  return campos;
}

function leerAlumno(datos: unknown): AlumnoEnviado {
  const alumno = datos as AlumnoEnviado;
  if (typeof alumno?.dni !== "string" || !SOLO_DIGITOS.test(alumno.dni)) throw new Error("Un alumno no tiene un DNI válido");
  const instancias: AlumnoEnviado["instancias"] = {};
  for (const instancia of INSTANCIAS) {
    if (alumno.instancias?.[instancia] !== undefined) instancias[instancia] = leerCampos(alumno.instancias[instancia]);
  }
  return { dni: alumno.dni, instancias };
}

// Data arrives from a web page: its shape is checked, and a new object with only the
// known fields is built, so a name or anything else sent by mistake is never kept.
export function leerEnvio(datos: unknown): Envio {
  const e = datos as Envio;
  if (typeof e !== "object" || e === null) throw new Error("El envío no es un objeto");
  if (e.version !== VERSION_DEL_ENVIO) throw new Error(`Versión de envío desconocida: ${e.version}`);
  if (typeof e.plataforma !== "string" || typeof e.comision !== "string" || typeof e.generado !== "string") {
    throw new Error("Faltan datos del envío");
  }
  if (!Array.isArray(e.alumnos)) throw new Error("El envío no trae alumnos");
  return { version: e.version, plataforma: e.plataforma, comision: e.comision, generado: e.generado, alumnos: e.alumnos.map(leerAlumno) };
}
