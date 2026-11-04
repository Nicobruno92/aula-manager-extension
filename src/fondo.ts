// Service worker: keeps the last envío from Aula Manager until it is used or expires.
//
// chrome.storage.session lives in memory only: closing the browser erases the
// grades, and they never reach the disk of a shared computer.

import { avisoAceptado } from "./aviso";
import { leerEnvio, type Envio } from "./envio";
import { ORIGENES_DE_AULA_MANAGER } from "./origenes";

const HORAS_QUE_DURA_UN_ENVIO = 2;
const ALARMA_DE_VENCIMIENTO = "vencer-envio";

interface Guardado {
  envio: Envio;
  vence: number;
}

export type Pedido = { tipo: "guardar"; envio: unknown } | { tipo: "leer" } | { tipo: "borrar" };

async function borrar(): Promise<void> {
  await chrome.storage.session.remove("guardado");
  await chrome.alarms.clear(ALARMA_DE_VENCIMIENTO);
}

async function leer(): Promise<Envio | null> {
  const { guardado } = (await chrome.storage.session.get("guardado")) as { guardado?: Guardado };
  if (!guardado) return null;
  // The alarm erases it on time; this covers a browser asleep when it was due.
  if (guardado.vence < Date.now()) {
    await borrar();
    return null;
  }
  return guardado.envio;
}

function vieneDeAulaManager(remitente: chrome.runtime.MessageSender): boolean {
  return remitente.origin !== undefined && ORIGENES_DE_AULA_MANAGER.includes(remitente.origin);
}

async function atender(pedido: Pedido, remitente: chrome.runtime.MessageSender): Promise<unknown> {
  if (pedido.tipo === "guardar") {
    // Only Aula Manager's own pages may hand grades over; any other site gets refused.
    if (!vieneDeAulaManager(remitente)) return { ok: false, error: "origen no permitido" };
    if (!(await avisoAceptado())) {
      return { ok: false, error: "abrí la extensión y aceptá el aviso de privacidad antes de mandar notas" };
    }
    const envio = leerEnvio(pedido.envio);
    const vence = Date.now() + HORAS_QUE_DURA_UN_ENVIO * 3600 * 1000;
    await chrome.storage.session.set({ guardado: { envio, vence } satisfies Guardado });
    await chrome.alarms.create(ALARMA_DE_VENCIMIENTO, { when: vence });
    return { ok: true, alumnos: envio.alumnos.length };
  }
  if (pedido.tipo === "leer") return { ok: true, envio: await leer() };
  await borrar();
  return { ok: true };
}

chrome.runtime.onMessage.addListener((pedido: Pedido, remitente, responder) => {
  atender(pedido, remitente)
    .then(responder)
    .catch((error: Error) => responder({ ok: false, error: error.message }));
  return true; // the answer comes asynchronously
});

chrome.alarms.onAlarm.addListener((alarma) => {
  if (alarma.name === ALARMA_DE_VENCIMIENTO) borrar();
});

chrome.runtime.onInstalled.addListener(async () => {
  if (!(await avisoAceptado())) chrome.tabs.create({ url: chrome.runtime.getURL("bienvenida.html") });
});
