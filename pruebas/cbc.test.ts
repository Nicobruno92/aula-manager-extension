// @vitest-environment jsdom
// The CBC act («Gestión de Actas CBC») with fake pages built from the tutorial video:
// the controls inside the cells are a guess until a real act is saved.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { adaptadorPara } from "../src/adaptadores";
import { cbc } from "../src/adaptadores/cbc";
import { guarani } from "../src/adaptadores/guarani";
import { completar } from "../src/completar";
import type { Envio } from "../src/envio";

const PAGINAS_CBC = ["cbc_regulares.html", "cbc_libres.html", "cbc_sin_abrir.html"];
const PAGINAS_GUARANI = ["guarani_cursada.html", "guarani_cursada_otra_universidad.html", "guarani_mesa.html", "guarani_promocion.html"];
// Fake DNIs for the paginated act, generated so no literal document number is added here.
const PRIMER_DNI_PAGINADO = 42000000;

function abrir(nombre: string): Document {
  const html = readFileSync(join(__dirname, "paginas", nombre), "utf-8");
  return new DOMParser().parseFromString(html, "text/html");
}

function valor(documento: Document, nombre: string): string {
  const elemento = documento.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${nombre}"]`)!;
  return elemento instanceof HTMLSelectElement ? elemento.selectedOptions[0].textContent!.trim() : elemento.value;
}

const REGULARES: Envio = {
  version: 1, plataforma: "cbc", comision: "99901 · Biología", generado: "2026-11-16T10:00:00-03:00",
  alumnos: [
    { dni: "41000000", instancias: { regularidad: { primer_parcial: "8", segundo_parcial: "7", condicion: "PROM", nota: "8" } } },
    { dni: "41000001", instancias: { regularidad: { primer_parcial: "6", segundo_parcial: "4", condicion: "EXA", nota: "5" } } },
    { dni: "41000002", instancias: { regularidad: { primer_parcial: "2", segundo_parcial: "3", condicion: "INS", nota: "3" } } },
  ],
};

// The commission's act with ``visibles`` rows on screen and the paginator saying
// «desde – hasta of total», as Angular Material shows 10 rows per page by default.
function actaPaginada(visibles: number, rango: string): Document {
  const documento = abrir("cbc_regulares.html");
  const cuerpo = documento.querySelector("tbody")!;
  const modelo = cuerpo.querySelectorAll("tr")[1]; // the row with everything empty
  cuerpo.replaceChildren();
  for (let i = 0; i < visibles; i++) {
    const fila = modelo.cloneNode(true) as HTMLElement;
    fila.querySelectorAll("td")[1].textContent = String(PRIMER_DNI_PAGINADO + i);
    fila.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[name]").forEach((c) => {
      c.name = c.name.replace(/_\d+$/, `_${i}`);
    });
    cuerpo.append(fila);
  }
  documento.querySelector(".mat-mdc-paginator-range-label")!.textContent = rango;
  return documento;
}

function envioDe(cuantos: number): Envio {
  return {
    ...REGULARES,
    alumnos: Array.from({ length: cuantos }, (_, i) => ({
      dni: String(PRIMER_DNI_PAGINADO + i),
      instancias: { regularidad: { condicion: "EXA", nota: "5" } },
    })),
  };
}

describe("reconocer la página", () => {
  test("detecta solo el CBC en sus actas, y no lo confunde con Guaraní", () => {
    for (const pagina of PAGINAS_CBC) {
      expect(adaptadorPara(abrir(pagina))?.id, pagina).toBe("cbc");
      expect(guarani.reconoce(abrir(pagina)), pagina).toBe(false);
    }
  });

  test("en Guaraní elige Guaraní y el CBC no la reconoce", () => {
    for (const pagina of PAGINAS_GUARANI) {
      expect(adaptadorPara(abrir(pagina))?.id, pagina).toBe("guarani");
      expect(cbc.reconoce(abrir(pagina)), pagina).toBe(false);
    }
  });

  test("no reconoce la lista de actas", () => {
    // Columns as the list shows them in the video; no DNI and no Nota.
    const lista = new DOMParser().parseFromString(
      `<title>Gestión de Actas CBC</title><span>Actas de Segundo Cuatrimestre y Anuales de 2025</span>
       <table><tr><th>comision</th><th>sede</th><th>materia</th><th>horario</th><th>aula</th><th>catedra</th>
       <th>estado</th><th>Código Acta</th><th>Anual?</th></tr>
       <tr><td>99901</td><td>9-SEDE DE PRUEBA</td><td>8-BIOLOGIA</td><td>900</td><td>100</td><td>99</td>
       <td>Abierta</td><td>1</td><td>No</td></tr></table>`, "text/html");
    expect(cbc.reconoce(lista)).toBe(false);
    expect(adaptadorPara(lista)).toBeUndefined();
  });

  test("una tabla con DNI y Nota fuera del sistema de actas no es el CBC", () => {
    const otra = new DOMParser().parseFromString("<table><tr><th>DNI</th><th>Nota</th></tr><tr><td>1</td><td><input></td></tr></table>", "text/html");
    expect(cbc.reconoce(otra)).toBe(false);
  });

  test("cada fila sabe de qué alumno es, por el DNI de su columna", () => {
    expect(cbc.filas(abrir("cbc_regulares.html")).map((f) => [f.documento, f.instancia])).toEqual([
      ["41000000", "regularidad"], ["41000001", "regularidad"], ["41000002", "regularidad"], ["41000003", "regularidad"],
    ]);
    expect(cbc.filas(abrir("cbc_libres.html")).map((f) => [f.documento, f.instancia])).toEqual([
      ["41000000", "examen"], ["41000001", "examen"],
    ]);
  });
});

describe("completar el acta de una comisión", () => {
  test("empareja por DNI, no por el orden de las filas", () => {
    const documento = abrir("cbc_regulares.html");
    const alReves: Envio = { ...REGULARES, alumnos: [...REGULARES.alumnos].reverse() };
    const resumen = completar(cbc, documento, alReves, false);
    expect([valor(documento, "p1_0"), valor(documento, "p2_0"), valor(documento, "cond_0"), valor(documento, "nota_0")])
      .toEqual(["8", "7", "PROM", "8"]);
    expect([valor(documento, "cond_1"), valor(documento, "nota_1")]).toEqual(["EXA", "5"]);
    // The fourth student was not sent: red, untouched.
    expect(resumen.filas.map((r) => [r.fila.documento, r.estado])).toEqual([
      ["41000000", "completado"], ["41000001", "completado"], ["41000002", "ya_tenia"], ["41000003", "no_encontrado"],
    ]);
    expect(valor(documento, "nota_3")).toBe("A");
  });

  test("la «A» y el «AUS» de un acta recién abierta cuentan como vacíos", () => {
    const documento = abrir("cbc_regulares.html");
    // Row 0 shows «A» in every grade and «AUS» in Condición; row 1 is truly empty.
    const resumen = completar(cbc, documento, REGULARES, false);
    expect(resumen.filas[0].estado).toBe("completado");
    expect(valor(documento, "cond_0")).toBe("PROM");
    expect(resumen.cuantos).toEqual({ completado: 2, ya_tenia: 1, con_problemas: 0, no_encontrado: 1, sin_datos: 0 });
  });

  test("no pisa lo que ya estaba cargado, salvo que se pida", () => {
    const documento = abrir("cbc_regulares.html");
    completar(cbc, documento, REGULARES, false);
    expect(valor(documento, "cond_2")).toBe("EXA");
    completar(cbc, documento, REGULARES, true);
    expect(valor(documento, "cond_2")).toBe("INS");
  });

  test("cada campo recibe input y después change; los parciales van antes que condición y nota", () => {
    const documento = abrir("cbc_regulares.html");
    const eventos: string[] = [];
    for (const tipo of ["input", "change"]) {
      documento.addEventListener(tipo, (e) => eventos.push(`${tipo}:${(e.target as HTMLElement).getAttribute("name")}`));
    }
    completar(cbc, documento, REGULARES, false);
    // If the act derives Condición from the parciales, the condición sent is written after and wins.
    expect(eventos.slice(0, 8)).toEqual([
      "input:p1_0", "change:p1_0", "input:p2_0", "change:p2_0",
      "input:nota_0", "change:nota_0", "input:cond_0", "change:cond_0",
    ]);
  });

  test("una condición que no está entre las opciones deja la fila sin tocar", () => {
    const documento = abrir("cbc_regulares.html");
    const envio: Envio = { ...REGULARES, alumnos: [{ dni: "41000000", instancias: { regularidad: { condicion: "Promoción", nota: "8" } } }] };
    const resumen = completar(cbc, documento, envio, false);
    expect(resumen.filas[0].problemas).toEqual(["«Promoción» no es una opción de condicion"]);
    expect(valor(documento, "nota_0")).toBe("A");
  });
});

describe("nunca guarda, cierra ni abre el acta", () => {
  // Every way a script could press a platform button or send the form.
  function vigilar(documento: Document) {
    const clics: string[] = [];
    const envios: string[] = [];
    documento.addEventListener("click", (e) => clics.push((e.target as HTMLElement).textContent!.trim()), true);
    documento.addEventListener("submit", () => envios.push("submit"), true);
    const espias = [
      vi.spyOn(HTMLElement.prototype, "click"),
      vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {}),
      vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => {}),
    ];
    return { clics, envios, espias };
  }

  afterEach(() => vi.restoreAllMocks());

  test.each([
    ["cbc_regulares.html", REGULARES],
    ["cbc_libres.html", { ...REGULARES, alumnos: [{ dni: "41000001", instancias: { examen: { nota: "7" } } }] }],
    ["cbc_sin_abrir.html", REGULARES],
  ] as [string, Envio][])("%s: ni clic ni submit en «Grabar Notas», «Cerrar Acta» ni «Abrir Acta»", (pagina, envio) => {
    const documento = abrir(pagina);
    const { clics, envios, espias } = vigilar(documento);
    completar(cbc, documento, envio, false);
    completar(cbc, documento, envio, true);
    expect(clics).toEqual([]);
    expect(envios).toEqual([]);
    for (const espia of espias) expect(espia).not.toHaveBeenCalled();
  });

  test("un acta sin abrir no se completa y avisa que hay que tocar «Abrir Acta»", () => {
    const documento = abrir("cbc_sin_abrir.html");
    const resumen = completar(cbc, documento, REGULARES, false);
    expect(resumen.cuantos.completado).toBe(0);
    expect(resumen.filas.every((r) => r.estado === "con_problemas" || r.estado === "no_encontrado")).toBe(true);
    expect(cbc.avisos!(documento).join(" ")).toContain("Abrir Acta");
  });
});

describe("acta con varias páginas", () => {
  test("con 10 filas por página completa las visibles y avisa que hay más", () => {
    const documento = actaPaginada(10, "1 – 10 of 37");
    const resumen = completar(cbc, documento, envioDe(37), false);
    expect(resumen.filas).toHaveLength(10);
    expect(resumen.cuantos.completado).toBe(10);
    expect(valor(documento, "nota_9")).toBe("5");
    const avisos = cbc.avisos!(documento);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("1 a 10 de 37");
  });

  test("en la última página también avisa, y sin paginar no", () => {
    expect(cbc.avisos!(actaPaginada(7, "31 – 37 of 37"))[0]).toContain("31 a 37 de 37");
    expect(cbc.avisos!(actaPaginada(4, "1 – 4 of 4"))).toEqual([]);
    expect(cbc.avisos!(abrir("cbc_regulares.html"))).toEqual([]);
  });
});

describe("completar el acta de libres", () => {
  test("carga solo la nota", () => {
    const documento = abrir("cbc_libres.html");
    const envio: Envio = { ...REGULARES, alumnos: [{ dni: "41000001", instancias: { examen: { nota: "7" } } }] };
    const resumen = completar(cbc, documento, envio, false);
    expect(valor(documento, "nota_1")).toBe("7");
    expect(valor(documento, "nota_0")).toBe("A");
    expect(resumen.cuantos).toEqual({ completado: 1, ya_tenia: 0, con_problemas: 0, no_encontrado: 1, sin_datos: 0 });
  });

  test("una condición mandada al acta de libres es un problema, no se ignora", () => {
    const documento = abrir("cbc_libres.html");
    const envio: Envio = { ...REGULARES, alumnos: [{ dni: "41000001", instancias: { examen: { condicion: "EXA", nota: "7" } } }] };
    const resumen = completar(cbc, documento, envio, false);
    expect(resumen.filas[1].problemas).toEqual(["esta página no tiene condicion"]);
    expect(valor(documento, "nota_1")).toBe("A");
  });
});
