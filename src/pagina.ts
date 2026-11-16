// Injected into the open tab when the docente presses «Completar esta página» in the
// popup (activeTab): finds the platform, shows the panel and fills the form on demand.
//
// The panel is built with DOM calls and textContent only: names and values come from
// web pages, and none of them may become markup.

import { adaptadorPara } from "./adaptadores";
import type { Adaptador } from "./adaptadores/adaptador";
import { completar, type Estado, type Resumen } from "./completar";
import type { Envio } from "./envio";

const ID_DEL_PANEL = "aula-manager-panel";
const CLASES: Record<Estado, string> = {
  completado: "am-completado",
  ya_tenia: "am-ya-tenia",
  con_problemas: "am-con-problemas",
  no_encontrado: "am-no-encontrado",
  sin_datos: "am-sin-datos",
};
const LEYENDAS: Record<Estado, string> = {
  completado: "completados",
  ya_tenia: "ya tenían nota (no se tocaron)",
  con_problemas: "con problemas (no se tocaron)",
  no_encontrado: "no están en lo que mandó Aula Manager",
  sin_datos: "sin datos para esta acta",
};

function elemento<K extends keyof HTMLElementTagNameMap>(etiqueta: K, texto = "", clase = ""): HTMLElementTagNameMap[K] {
  const nuevo = document.createElement(etiqueta);
  if (texto) nuevo.textContent = texto;
  if (clase) nuevo.className = clase;
  return nuevo;
}

function marcar(resumen: Resumen): void {
  for (const { fila, estado, problemas, avisos } of resumen.filas) {
    // Only our own classes change: Guaraní's classes drive its scripts.
    fila.elemento.classList.remove(...Object.values(CLASES));
    fila.elemento.classList.add(CLASES[estado]);
    fila.elemento.title = `Aula Manager: ${[LEYENDAS[estado], ...problemas, ...avisos].join("; ")}`;
  }
}

function mostrarResumen(lista: HTMLUListElement, resumen: Resumen): void {
  lista.replaceChildren();
  for (const estado of Object.keys(LEYENDAS) as Estado[]) {
    if (resumen.cuantos[estado]) lista.append(elemento("li", `${resumen.cuantos[estado]} ${LEYENDAS[estado]}`, CLASES[estado]));
  }
  for (const { fila, problemas, avisos } of resumen.filas) {
    if (problemas.length) lista.append(elemento("li", `DNI ${fila.documento}: ${problemas.join("; ")}`, "am-detalle"));
    if (avisos.length) lista.append(elemento("li", `DNI ${fila.documento}: ${avisos.join("; ")}`, "am-aviso"));
  }
}

// What the platform's page itself needs the docente to know (more pages, act not open).
// Read again on every click: the docente may have moved to another page of the act.
function mostrarAvisos(caja: HTMLElement, adaptador: Adaptador): void {
  caja.replaceChildren(...(adaptador.avisos?.(document) ?? []).map((texto) => elemento("p", texto, "am-alerta")));
}

function panel(adaptador: Adaptador, envio: Envio | null): HTMLElement {
  const raiz = elemento("div", "", "am-panel");
  raiz.id = ID_DEL_PANEL;
  raiz.append(elemento("strong", `Aula Manager · ${adaptador.nombre}`));
  if (!envio || envio.plataforma !== adaptador.plataforma) {
    raiz.append(elemento("p", `No hay notas para ${adaptador.nombre}. En Aula Manager abrí el libro de notas, «Pasar a: ${adaptador.nombre}», y tocá «Mandar a la extensión».`));
    return raiz;
  }
  const generado = new Date(envio.generado).toLocaleString("es-AR");
  raiz.append(elemento("p", `Notas de ${envio.comision}: ${envio.alumnos.length} alumnos, generadas el ${generado}.`));
  const sobrescribir = elemento("input");
  sobrescribir.type = "checkbox";
  const etiqueta = elemento("label", " Reemplazar lo que ya está cargado");
  etiqueta.prepend(sobrescribir);
  const boton = elemento("button", "Completar esta página", "am-boton");
  boton.type = "button"; // inside Guaraní's form, a plain button would submit it
  const lista = elemento("ul");
  const avisosDeLaPagina = elemento("div");
  mostrarAvisos(avisosDeLaPagina, adaptador);
  const aviso = elemento("p", "Revisá las filas marcadas y apretá «Guardar» en la plataforma. Cerrar y firmar el acta lo hacés vos.", "am-aviso");
  boton.addEventListener("click", () => {
    const resumen = completar(adaptador, document, envio, sobrescribir.checked);
    marcar(resumen);
    mostrarResumen(lista, resumen);
    mostrarAvisos(avisosDeLaPagina, adaptador);
  });
  raiz.append(avisosDeLaPagina, etiqueta, boton, lista, aviso);
  return raiz;
}

async function iniciar(): Promise<void> {
  document.getElementById(ID_DEL_PANEL)?.remove();
  const adaptador = adaptadorPara(document);
  if (!adaptador) {
    window.alert("Aula Manager: esta página no es una carga de notas que la extensión conozca.");
    return;
  }
  const respuesta = (await chrome.runtime.sendMessage({ tipo: "leer" })) as { envio: Envio | null };
  const lugar = adaptador.lugarDelPanel(document);
  lugar.parentElement!.insertBefore(panel(adaptador, respuesta.envio), lugar);
}

iniciar();
