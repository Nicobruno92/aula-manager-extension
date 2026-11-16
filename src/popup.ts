// The window behind the toolbar icon: what grades are loaded, and the buttons to use or erase them.

import { avisoAceptado } from "./aviso";
import type { Envio } from "./envio";

const estado = document.getElementById("estado")!;
const completar = document.getElementById("completar") as HTMLButtonElement;
const borrar = document.getElementById("borrar") as HTMLButtonElement;

async function mostrar(): Promise<void> {
  if (!(await avisoAceptado())) {
    estado.textContent = "Antes de usarla, leé qué hace la extensión con las notas y aceptalo.";
    completar.textContent = "Leer el aviso";
    completar.onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("bienvenida.html") });
    borrar.hidden = true;
    return;
  }
  const { envio } = (await chrome.runtime.sendMessage({ tipo: "leer" })) as { envio: Envio | null };
  borrar.disabled = envio === null;
  estado.textContent = envio
    ? `Tenés las notas de ${envio.comision} (${envio.alumnos.length} alumnos). Abrí la carga de notas y tocá «Usar en esta página».`
    : "Todavía no hay notas. En Aula Manager abrí el libro de notas, «Pasar a:» la plataforma de tu acta, y tocá «Mandar a la extensión».";
}

completar.onclick = async () => {
  const [pestana] = await chrome.tabs.query({ active: true, currentWindow: true });
  // activeTab: clicking the icon lets the extension into this tab only, now; it holds no permanent access to any site.
  await chrome.scripting.insertCSS({ target: { tabId: pestana.id! }, files: ["pagina.css"] });
  await chrome.scripting.executeScript({ target: { tabId: pestana.id! }, files: ["pagina.js"] });
  window.close();
};

borrar.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ tipo: "borrar" });
  await mostrar();
});

mostrar();
