// The page that opens on install: what the extension does with grades, and the button to accept it.

import { avisoAceptado, VERSION_DEL_AVISO } from "./aviso";

const aceptar = document.getElementById("aceptar") as HTMLButtonElement;
const estado = document.getElementById("estado")!;

async function mostrar(): Promise<void> {
  const aceptado = await avisoAceptado();
  aceptar.hidden = aceptado;
  estado.textContent = aceptado ? "Listo: ya podés mandar notas desde Aula Manager." : "";
}

aceptar.addEventListener("click", async () => {
  // Only the mark is stored: nothing about the docente or their students.
  await chrome.storage.local.set({ aviso: VERSION_DEL_AVISO });
  await mostrar();
});

mostrar();
