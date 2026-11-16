// @vitest-environment jsdom
// The Chrome pieces with a fake «chrome» object: the bridge on Aula Manager, the
// service worker and the panel injected into Guaraní and the CBC.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Envio } from "../src/envio";

const ENVIO: Envio = {
  version: 1, plataforma: "guarani", comision: "70802 · Biología", generado: "2026-11-05T10:00:00-03:00",
  alumnos: [{ dni: "40335123", instancias: { regularidad: { fecha: "12/12/2026", resultado: "Aprobado", condicion: "Regular" } } }],
};

type Oyente = (pedido: any, remitente: any, responder: (r: unknown) => void) => boolean;

function area(datos: Record<string, unknown>) {
  return {
    get: async (clave: string) => (clave in datos ? { [clave]: datos[clave] } : {}),
    set: async (valores: Record<string, unknown>) => Object.assign(datos, valores),
    remove: async (clave: string) => { delete datos[clave]; },
  };
}

function chromeFalso({ aceptado = true } = {}) {
  const memoria: Record<string, unknown> = {};
  const local: Record<string, unknown> = aceptado ? { aviso: 1 } : {};
  const oyentes: Oyente[] = [];
  const alarmas: ((alarma: { name: string }) => void)[] = [];
  const falso = {
    runtime: {
      getManifest: () => ({ version: "0.1.0" }),
      getURL: (ruta: string) => `chrome-extension://id/${ruta}`,
      sendMessage: vi.fn(),
      onMessage: { addListener: (f: Oyente) => oyentes.push(f) },
      onInstalled: { addListener: vi.fn() },
    },
    alarms: { create: vi.fn(), clear: vi.fn(), onAlarm: { addListener: (f: (a: { name: string }) => void) => alarmas.push(f) } },
    tabs: { create: vi.fn() },
    storage: { session: area(memoria), local: area(local) },
  };
  // Fire an alarm as Chrome would.
  const sonar = (nombre: string) => alarmas.forEach((f) => f({ name: nombre }));
  // What the service worker answers, as Chrome would route it.
  const pedir = (pedido: unknown, origen: string) =>
    new Promise((resolver) => oyentes[0](pedido, { origin: origen }, resolver));
  return { falso, memoria, pedir, sonar };
}

beforeEach(() => {
  vi.resetModules();
  document.documentElement.innerHTML = "<head></head><body></body>";
});

describe("fondo", () => {
  test("guarda lo que manda Aula Manager y lo devuelve", async () => {
    const { falso, pedir } = chromeFalso();
    vi.stubGlobal("chrome", falso);
    await import("../src/fondo");
    expect(await pedir({ tipo: "guardar", envio: ENVIO }, "https://aula-manager.com")).toEqual({ ok: true, alumnos: 1 });
    expect(await pedir({ tipo: "leer" }, "https://autogestion.guarani.uba.ar")).toEqual({ ok: true, envio: ENVIO });
  });

  test("no acepta notas de otro sitio", async () => {
    const { falso, memoria, pedir } = chromeFalso();
    vi.stubGlobal("chrome", falso);
    await import("../src/fondo");
    expect(await pedir({ tipo: "guardar", envio: ENVIO }, "https://otro-sitio.com")).toEqual({ ok: false, error: "origen no permitido" });
    expect(memoria).toEqual({});
  });

  test("lo vencido ya no se devuelve", async () => {
    const { falso, memoria, pedir } = chromeFalso();
    vi.stubGlobal("chrome", falso);
    await import("../src/fondo");
    memoria.guardado = { envio: ENVIO, vence: Date.now() - 1 };
    expect(await pedir({ tipo: "leer" }, "https://aula-manager.com")).toEqual({ ok: true, envio: null });
    expect(memoria).toEqual({});
  });

  test("sin el aviso aceptado no guarda nada", async () => {
    const { falso, memoria, pedir } = chromeFalso({ aceptado: false });
    vi.stubGlobal("chrome", falso);
    await import("../src/fondo");
    const respuesta = (await pedir({ tipo: "guardar", envio: ENVIO }, "https://aula-manager.com")) as { ok: boolean; error: string };
    expect(respuesta.ok).toBe(false);
    expect(respuesta.error).toContain("aviso");
    expect(memoria).toEqual({});
  });

  test("guarda solo los campos conocidos", async () => {
    const { falso, pedir } = chromeFalso();
    vi.stubGlobal("chrome", falso);
    await import("../src/fondo");
    const conDeMas = { ...ENVIO, extra: "x", alumnos: [{ dni: "40335123", nombre: "Ana Pérez", instancias: { regularidad: { condicion: "Regular", mail: "ana@x" }, otra: { a: "b" } } }] };
    await pedir({ tipo: "guardar", envio: conDeMas }, "https://aula-manager.com");
    const { envio } = (await pedir({ tipo: "leer" }, "https://aula-manager.com")) as { envio: Envio };
    expect(envio).toEqual({ ...ENVIO, alumnos: [{ dni: "40335123", instancias: { regularidad: { condicion: "Regular" } } }] });
  });

  test("a las dos horas la alarma lo borra", async () => {
    const { falso, memoria, pedir, sonar } = chromeFalso();
    vi.stubGlobal("chrome", falso);
    await import("../src/fondo");
    await pedir({ tipo: "guardar", envio: ENVIO }, "https://aula-manager.com");
    const [, { when }] = falso.alarms.create.mock.calls[0];
    expect(when - Date.now()).toBeGreaterThan(1.9 * 3600 * 1000);
    sonar("vencer-envio");
    await vi.waitFor(() => expect(memoria).toEqual({}));
  });

  test("un envío mal formado se rechaza", async () => {
    const { falso, pedir } = chromeFalso();
    vi.stubGlobal("chrome", falso);
    await import("../src/fondo");
    const respuesta = (await pedir({ tipo: "guardar", envio: { ...ENVIO, version: 9 } }, "https://aula-manager.com")) as { ok: boolean };
    expect(respuesta.ok).toBe(false);
  });
});

describe("puente", () => {
  test("marca la página y pasa el envío del evento a la extensión", async () => {
    const { falso } = chromeFalso();
    falso.runtime.sendMessage.mockImplementation((_pedido: unknown, responder: (r: unknown) => void) => responder({ ok: true, alumnos: 1 }));
    vi.stubGlobal("chrome", falso);
    await import("../src/puente");
    expect(document.documentElement.dataset.extensionAulaManager).toBe("0.1.0");
    const respuestas: string[] = [];
    document.addEventListener("aula-manager:notas-recibidas", (e) => respuestas.push((e as CustomEvent<string>).detail));
    document.dispatchEvent(new CustomEvent("aula-manager:mandar-notas", { detail: JSON.stringify(ENVIO) }));
    expect(falso.runtime.sendMessage).toHaveBeenCalledWith({ tipo: "guardar", envio: ENVIO }, expect.any(Function));
    expect(respuestas).toEqual(['{"ok":true,"alumnos":1}']);
  });
});

describe("panel en Guaraní", () => {
  async function abrirPanel(envio: Envio | null) {
    const html = readFileSync(join(__dirname, "paginas", "guarani_cursada.html"), "utf-8");
    document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML;
    const { falso } = chromeFalso();
    falso.runtime.sendMessage.mockResolvedValue({ ok: true, envio });
    vi.stubGlobal("chrome", falso);
    await import("../src/pagina");
    await vi.waitFor(() => expect(document.getElementById("aula-manager-panel")).not.toBeNull());
    return document.getElementById("aula-manager-panel")!;
  }

  test("completa, marca las filas y habilita Guardar", async () => {
    const panel = await abrirPanel(ENVIO);
    expect(panel.textContent).toContain("Notas de 70802 · Biología: 1 alumnos");
    panel.querySelector<HTMLButtonElement>(".am-boton")!.click();
    const condicion = document.querySelector<HTMLSelectElement>('[name="renglones[1001][cond_regularidad]"]')!;
    expect(condicion.selectedOptions[0].textContent!.trim()).toBe("Regular");
    expect(document.getElementById("renglon_1001")!.classList.contains("am-completado")).toBe(true);
    // Guaraní's own classes stay: its scripts rely on them.
    expect(document.getElementById("renglon_1001")!.classList.contains("js-renglon-regular")).toBe(true);
    expect(document.getElementById("renglon_1004")!.classList.contains("am-no-encontrado")).toBe(true);
    expect(document.querySelector<HTMLInputElement>("#js-btn-guardar")!.disabled).toBe(false);
    expect(panel.textContent).toContain("1 completados");
    expect(panel.textContent).toContain("apretá «Guardar» en la plataforma. «Cerrar y firmar el acta» lo hacés vos.");
  });

  test("sin notas cargadas explica cómo mandarlas", async () => {
    const panel = await abrirPanel(null);
    expect(panel.textContent).toContain("Mandar a la extensión");
    expect(panel.querySelector(".am-boton")).toBeNull();
  });

  test("un nombre de comisión con HTML se muestra como texto", async () => {
    const panel = await abrirPanel({ ...ENVIO, comision: '<img src=x onerror="alert(1)">' });
    expect(panel.querySelector("img")).toBeNull();
    expect(panel.textContent).toContain("<img");
  });
});

describe("panel en el CBC", () => {
  const CBC: Envio = {
    version: 1, plataforma: "cbc", comision: "99901 · Biología", generado: "2026-11-16T10:00:00-03:00",
    alumnos: [{ dni: "41000000", instancias: { regularidad: { condicion: "PROM", nota: "8" } } }],
  };

  async function abrirPanel(pagina: string, envio: Envio | null) {
    const html = readFileSync(join(__dirname, "paginas", pagina), "utf-8");
    document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML;
    const { falso } = chromeFalso();
    falso.runtime.sendMessage.mockResolvedValue({ ok: true, envio });
    vi.stubGlobal("chrome", falso);
    await import("../src/pagina");
    await vi.waitFor(() => expect(document.getElementById("aula-manager-panel")).not.toBeNull());
    return document.getElementById("aula-manager-panel")!;
  }

  test("se elige solo, completa y marca sin tocar los botones del acta", async () => {
    const panel = await abrirPanel("cbc_regulares.html", CBC);
    expect(panel.textContent).toContain("Actas del CBC");
    const clics: string[] = [];
    document.querySelectorAll("#grabar, #cerrar, #listar").forEach((b) => b.addEventListener("click", () => clics.push(b.id)));
    panel.querySelector<HTMLButtonElement>(".am-boton")!.click();
    const filas = document.querySelectorAll("tbody tr");
    expect(filas[0].classList.contains("am-completado")).toBe(true);
    expect(filas[3].classList.contains("am-no-encontrado")).toBe(true);
    expect(document.querySelector<HTMLInputElement>('[name="nota_0"]')!.value).toBe("8");
    expect(clics).toEqual([]);
    // The closing notice names the CBC's own buttons, not Guaraní's.
    expect(panel.textContent).toContain("apretá «Grabar Notas» en la plataforma. «Cerrar Acta» lo hacés vos.");
  });

  test("en un acta sin abrir avisa antes de completar", async () => {
    const panel = await abrirPanel("cbc_sin_abrir.html", CBC);
    expect(panel.querySelector(".am-alerta")!.textContent).toContain("Abrir Acta");
  });

  test("con notas de Guaraní no completa el acta del CBC", async () => {
    const panel = await abrirPanel("cbc_regulares.html", ENVIO);
    expect(panel.querySelector(".am-boton")).toBeNull();
    expect(panel.textContent).toContain("No hay notas para Actas del CBC");
  });
});
