// Content script on Aula Manager's pages: carries the envío from the page to the extension.
//
// The page dispatches «aula-manager:mandar-notas» with the envío as a JSON string (an
// object would not cross from the page's world into this one) and gets back
// «aula-manager:notas-recibidas». No extension id or network call is involved.

document.documentElement.dataset.extensionAulaManager = chrome.runtime.getManifest().version;

document.addEventListener("aula-manager:mandar-notas", (evento) => {
  const detalle = (evento as CustomEvent<string>).detail;
  let envio: unknown;
  try {
    envio = JSON.parse(detalle);
  } catch {
    responder({ ok: false, error: "El envío no es JSON" });
    return;
  }
  chrome.runtime.sendMessage({ tipo: "guardar", envio }, responder);
});

function responder(respuesta: unknown): void {
  document.dispatchEvent(new CustomEvent("aula-manager:notas-recibidas", { detail: JSON.stringify(respuesta) }));
}

// A module, so the tests can import it; esbuild still bundles it as a classic script.
export {};
