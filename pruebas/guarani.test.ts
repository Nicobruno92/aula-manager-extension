// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { guarani } from "../src/adaptadores/guarani";
import { completar } from "../src/completar";
import { leerEnvio, type Envio } from "../src/envio";

function abrir(nombre: string): Document {
  const html = readFileSync(join(__dirname, "paginas", nombre), "utf-8");
  return new DOMParser().parseFromString(html, "text/html");
}

function valor(documento: Document, nombre: string): string {
  const elemento = documento.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${nombre}"]`)!;
  return elemento instanceof HTMLSelectElement ? elemento.selectedOptions[0].textContent!.trim() : elemento.value;
}

const CURSADA: Envio = {
  version: 1, plataforma: "guarani", comision: "70802 · Biología", generado: "2026-11-05T10:00:00-03:00",
  alumnos: [
    { dni: "40335123", instancias: { regularidad: { fecha: "12/12/2026", resultado: "Aprobado", condicion: "Promociono" } } },
    { dni: "41000001", instancias: { regularidad: { fecha: "12/12/2026", resultado: "Reprobado", condicion: "Libre" } } },
    { dni: "41000002", instancias: { regularidad: { fecha: "12/12/2026", resultado: "Aprobado", condicion: "Regular" } } },
  ],
};

describe("reconocer la página", () => {
  test("reconoce la cursada y la mesa", () => {
    expect(guarani.reconoce(abrir("guarani_cursada.html"))).toBe(true);
    expect(guarani.reconoce(abrir("guarani_mesa.html"))).toBe(true);
  });

  test("no reconoce otra página", () => {
    expect(guarani.reconoce(new DOMParser().parseFromString("<p>Hola</p>", "text/html"))).toBe(false);
  });

  test("cada fila sabe de qué alumno y qué acta es", () => {
    const filas = guarani.filas(abrir("guarani_promocion.html"));
    expect(filas.map((f) => [f.documento, f.instancia])).toEqual([
      ["40335123", "regularidad"], ["40335123", "promocion"], ["41000001", "regularidad"], ["41000001", "promocion"],
    ]);
  });
});

describe("completar la cursada", () => {
  test("elige las opciones por su texto, con o sin tilde", () => {
    const documento = abrir("guarani_cursada.html");
    completar(guarani, documento, CURSADA, false);
    expect(valor(documento, "renglones[1001][cond_regularidad]")).toBe("Promocionó");
    expect(valor(documento, "renglones[1001][resultado_cursada]")).toBe("Aprobado");
    expect(valor(documento, "renglones[1001][fecha_regular]")).toBe("12/12/2026");
  });

  test("funciona con los códigos de opción de otra universidad", () => {
    const documento = abrir("guarani_cursada_otra_universidad.html");
    completar(guarani, documento, CURSADA, false);
    // Here «Promocionó» is option 13, not UNLP's 5.
    expect(documento.querySelector<HTMLSelectElement>('[name="renglones[2001][cond_regularidad]"]')!.value).toBe("13");
  });

  test("reconoce al alumno que tiene el CUIT en lugar del DNI", () => {
    const documento = abrir("guarani_cursada.html");
    completar(guarani, documento, CURSADA, false);
    expect(valor(documento, "renglones[1003][cond_regularidad]")).toBe("Regular");
  });

  test("no pisa lo que ya estaba cargado, salvo que se pida", () => {
    const documento = abrir("guarani_cursada.html");
    const resumen = completar(guarani, documento, CURSADA, false);
    expect(valor(documento, "renglones[1002][cond_regularidad]")).toBe("Regular");
    expect(resumen.cuantos).toEqual({ completado: 2, ya_tenia: 1, con_problemas: 0, no_encontrado: 1, sin_datos: 0 });
    completar(guarani, documento, CURSADA, true);
    expect(valor(documento, "renglones[1002][cond_regularidad]")).toBe("Libre");
  });

  test("avisa cada cambio, para que Guaraní recalcule y habilite Guardar", () => {
    const documento = abrir("guarani_cursada.html");
    const cambios: string[] = [];
    documento.addEventListener("change", (e) => cambios.push((e.target as HTMLElement).getAttribute("name")!));
    completar(guarani, documento, CURSADA, false);
    // The resultado goes after the condition, so the value sent wins over the one Guaraní derives.
    expect(cambios.slice(0, 3)).toEqual([
      "renglones[1001][fecha_regular]", "renglones[1001][cond_regularidad]", "renglones[1001][resultado_cursada]",
    ]);
  });

  test("un valor que no está entre las opciones deja la fila entera sin tocar", () => {
    const documento = abrir("guarani_cursada.html");
    const envio = { ...CURSADA, alumnos: [{ dni: "40335123", instancias: { regularidad: { fecha: "12/12/2026", condicion: "Aprobadísimo" } } }] };
    const resumen = completar(guarani, documento, envio, false);
    expect(resumen.filas[0].estado).toBe("con_problemas");
    expect(resumen.filas[0].problemas).toEqual(["«Aprobadísimo» no es una opción de condicion"]);
    // Not even the valid date went in: an act row is loaded whole or not at all.
    expect(valor(documento, "renglones[1001][fecha_regular]")).toBe("");
  });

  test("la promoción va en su propia fila y un campo bloqueado se saltea con aviso", () => {
    const documento = abrir("guarani_promocion.html");
    const envio: Envio = { ...CURSADA, alumnos: [{ dni: "40335123", instancias: {
      regularidad: { nota: "8", condicion: "Promociono" },
      promocion: { fecha: "12/12/2026", nota: "8", resultado: "Promocionado" },
    } }] };
    const resumen = completar(guarani, documento, envio, false);
    expect(valor(documento, "renglones[3001][nota_promocion]")).toBe("8");
    expect(valor(documento, "renglones[3001][resultado_promocion]")).toBe("Promocionado");
    expect(resumen.filas[0].estado).toBe("completado");
    expect(resumen.filas[0].avisos).toEqual(["nota está bloqueado en la plataforma"]);
    expect(valor(documento, "renglones[3001][cond_regularidad]")).toBe("Promocionó");
  });
});

describe("completar una mesa de examen", () => {
  test("carga nota, fecha y resultado", () => {
    const documento = abrir("guarani_mesa.html");
    const envio: Envio = { ...CURSADA, alumnos: [
      { dni: "40335123", instancias: { examen: { fecha: "12/12/2026", nota: "7", resultado: "Aprobado" } } },
    ] };
    const resumen = completar(guarani, documento, envio, false);
    expect(valor(documento, "renglones[4001][nota]")).toBe("7");
    expect(resumen.cuantos.no_encontrado).toBe(1);
  });
});

describe("leer el envío", () => {
  test("acepta un envío bien formado", () => {
    expect(leerEnvio(JSON.parse(JSON.stringify(CURSADA))).alumnos).toHaveLength(3);
  });

  test("rechaza un DNI que no son dígitos", () => {
    expect(() => leerEnvio({ ...CURSADA, alumnos: [{ dni: "<img>", instancias: {} }] })).toThrow("DNI");
  });

  test("rechaza otra versión", () => {
    expect(() => leerEnvio({ ...CURSADA, version: 2 })).toThrow("Versión");
  });
});
