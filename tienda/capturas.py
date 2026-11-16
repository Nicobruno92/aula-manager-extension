"""Chrome Web Store screenshots (1280×800) and small promo tile (440×280).

Pipeline
--------
1. Loads the built extension (``dist/``, run ``npm run armar`` first) into a headless
   Chromium with ``--load-extension``. The service worker, the bridge content script and
   the extension pages (welcome page, popup) are the real ones.
2. Hands a fake envío to the extension through the real bridge: Playwright serves a
   stand-in page at https://aula-manager.com, where ``puente.js`` is injected as on the
   real site, and the page fires «aula-manager:mandar-notas».
3. Opens the sample platform pages of ``pruebas/paginas/`` (invented students) under
   made-up hosts, adds a little styling so they look like the real platforms, and puts
   the panel on them. This is the one faked step: the panel is injected only when the
   docente clicks the toolbar icon (``activeTab``), which cannot be automated. So the
   built ``pagina.js``/``pagina.css`` are added to the page with a stand-in
   ``chrome.runtime.sendMessage`` that answers with the envío read from the real
   service worker's ``chrome.storage.session``.
4. Clicks «Completar esta página» and takes the screenshots.

Usage
-----
    npm run armar
    conda run -n base python tienda/capturas.py

Writes ``tienda/capturas/*.png``. No real student data: every name and DNI comes from
the sample pages or from the envíos below, and all of them are invented.
"""

# =============================================================================
# Imports
# =============================================================================
import base64
import json
import tempfile
from pathlib import Path

from playwright.sync_api import BrowserContext, Page, Worker, sync_playwright

# =============================================================================
# Configuration
# =============================================================================
RAIZ = Path(__file__).resolve().parent.parent
ARMADO = RAIZ / "dist"
PAGINAS = RAIZ / "pruebas" / "paginas"
SALIDA = RAIZ / "tienda" / "capturas"
ICONO = RAIZ / "diseno" / "icono.svg"

TAMANO_CAPTURA = {"width": 1280, "height": 800}
TAMANO_MOSAICO = {"width": 440, "height": 280}
ESPERA_MS = 300  # lets the panel and the popup finish their async reads

AULA_MANAGER = "https://aula-manager.com"
# Made-up hosts for the sample pages (the CBC system is served over plain http).
HOST_CBC = "http://actas-cbc.ejemplo"
HOST_GUARANI = "https://guarani.ejemplo.edu.ar"

GENERADO = "2026-11-16T10:00:00-03:00"
ENVIO_CBC_COMISION = {
    "version": 1, "plataforma": "cbc", "comision": "99901 · Biología", "generado": GENERADO,
    "alumnos": [
        {"dni": "41000000", "instancias": {"regularidad": {"primer_parcial": "8", "segundo_parcial": "7", "condicion": "PROM", "nota": "8"}}},
        {"dni": "41000001", "instancias": {"regularidad": {"primer_parcial": "6", "segundo_parcial": "4", "condicion": "EXA", "nota": "5"}}},
        {"dni": "41000002", "instancias": {"regularidad": {"primer_parcial": "2", "segundo_parcial": "3", "condicion": "INS", "nota": "3"}}},
    ],
}
ENVIO_CBC_LIBRES = {
    "version": 1, "plataforma": "cbc", "comision": "Libres · Biología", "generado": GENERADO,
    "alumnos": [
        {"dni": "41000000", "instancias": {"examen": {"nota": "4"}}},
        {"dni": "41000001", "instancias": {"examen": {"nota": "7"}}},
    ],
}
ENVIO_GUARANI = {
    "version": 1, "plataforma": "guarani", "comision": "70802 · Biología", "generado": GENERADO,
    "alumnos": [
        {"dni": "40335123", "instancias": {"regularidad": {"fecha": "12/12/2026", "resultado": "Aprobado", "condicion": "Promociono"}}},
        {"dni": "41000001", "instancias": {"regularidad": {"fecha": "12/12/2026", "resultado": "Reprobado", "condicion": "Libre"}}},
        {"dni": "41000002", "instancias": {"regularidad": {"fecha": "12/12/2026", "resultado": "Aprobado", "condicion": "Regular"}}},
    ],
}

# Only for the screenshots: the sample pages carry no styles of their own.
MAQUILLAJE_CBC = """
body { margin: 0; font: 14px Roboto, system-ui, sans-serif; background: #fafafa; color: #212121; }
mat-toolbar { display: flex; gap: 16px; align-items: center; height: 56px; padding: 0 16px; background: #3f51b5; color: #fff; font-size: 18px; }
mat-toolbar .spacer { flex: 1; }
mat-toolbar button { background: none; border: 0; color: #fff; font-size: 18px; }
.contenedor { display: flex; gap: 20px; padding: 16px; }
aside.panel-lateral { flex: 0 0 210px; align-self: start; background: #fff; padding: 12px 16px; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
aside p { margin: 8px 0; font-size: 13px; }
aside button { display: block; width: 100%; margin: 8px 0; padding: 8px; border: 0; border-radius: 4px; background: #3f51b5; color: #fff; }
main { flex: 1; }
/* The libres act has no wrapper: its side panel and table hang straight from <body>. */
body:has(> aside.panel-lateral) { display: grid; grid-template-columns: 242px 1fr; column-gap: 20px; align-content: start; padding-right: 16px; }
body > mat-toolbar { grid-column: 1 / -1; }
body > aside.panel-lateral { grid-column: 1; grid-row: 2 / span 4; align-self: start; margin: 16px 0 0 16px; }
body > :not(mat-toolbar, aside) { grid-column: 2; }
body > .am-panel { margin-top: 16px; }
body > input { justify-self: start; }
table, mat-table { display: table; width: 100%; border-collapse: collapse; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
mat-header-row, mat-row { display: table-row; }
th, td, mat-header-cell, mat-cell { display: table-cell; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; text-align: left; }
th, mat-header-cell { color: #757575; font-size: 12px; font-weight: 500; }
td input, mat-cell input { width: 48px; padding: 4px; }
mat-paginator { display: flex; gap: 12px; justify-content: flex-end; padding: 10px; font-size: 12px; color: #757575; }
.filtro input, body > input { margin: 10px 0; padding: 6px; width: 220px; }
"""
MAQUILLAJE_GUARANI = """
body { margin: 0; font: 13px "Helvetica Neue", Arial, sans-serif; background: #f2f2f2; color: #333; }
#cabecera { background: #1d5b8f; color: #fff; padding: 6px 24px; }
#cabecera h2 { font-size: 20px; font-weight: normal; }
#js-colapsar-detalles-zona { padding: 10px 24px; background: #fff; border-bottom: 1px solid #ddd; font-weight: bold; }
#renglones { margin: 16px 24px; padding: 12px; background: #fff; border: 1px solid #ddd; }
.botonera { text-align: right; margin-bottom: 8px; }
.botonera input { padding: 6px 14px; background: #1d5b8f; color: #fff; border: 0; border-radius: 3px; }
table.table { width: 100%; border-collapse: collapse; }
table.table th, table.table td { padding: 6px 8px; border-top: 1px solid #ddd; text-align: left; vertical-align: middle; }
.datos-alumno span { display: block; }
.identificacion { color: #777; font-size: 12px; }
.foto-alumno { display: none; }
input.fecha { width: 90px; }
"""
MAQUILLAJE_MOSAICO = """
body { margin: 0; width: 440px; height: 280px; display: flex; align-items: center; gap: 22px; padding: 0 30px;
       box-sizing: border-box; background: #1F5D4A; color: #fff; font-family: system-ui, sans-serif; }
img { width: 104px; height: 104px; border-radius: 24px; box-shadow: 0 0 0 3px rgba(255,255,255,.25); }
h1 { margin: 0 0 10px; font-size: 27px; line-height: 1.1; }
p { margin: 0; font-size: 16px; line-height: 1.35; }
span { color: #F2B33D; }
"""
# Where the popup is drawn over the page, as Chrome draws it under the toolbar icon.
POSICION_DEL_POPUP = {"top": 8, "right": 16}


# =============================================================================
# Helper functions
# =============================================================================
def servir(contexto: BrowserContext, patron: str, html: str) -> None:
    """Serve ``html`` for the URLs matching ``patron`` (no request leaves the machine)."""
    contexto.route(patron, lambda ruta: ruta.fulfill(status=200, content_type="text/html; charset=utf-8", body=html))


def mandar_envio(contexto: BrowserContext, trabajador: Worker, envio: dict) -> dict:
    """Hand ``envio`` to the extension through the real bridge on aula-manager.com.

    Returns what the service worker stored, read back from ``chrome.storage.session``.
    """
    pagina = contexto.new_page()
    pagina.goto(f"{AULA_MANAGER}/calificaciones/")
    respuesta = pagina.evaluate(
        """(texto) => new Promise((resolver) => {
            document.addEventListener("aula-manager:notas-recibidas", (e) => resolver(JSON.parse(e.detail)), { once: true });
            document.dispatchEvent(new CustomEvent("aula-manager:mandar-notas", { detail: texto }));
        })""",
        json.dumps(envio),
    )
    pagina.close()
    assert respuesta.get("ok"), f"La extensión rechazó el envío: {respuesta}"
    guardado = trabajador.evaluate("chrome.storage.session.get('guardado')")
    return guardado["guardado"]["envio"]


def poner_panel(pagina: Page, envio: dict) -> None:
    """Inject the built panel into ``pagina`` with a stand-in for the extension's messaging."""
    pagina.evaluate(
        "(envio) => { window.chrome = window.chrome || {}; window.chrome.runtime = { sendMessage: async () => ({ ok: true, envio }) }; }",
        envio,
    )
    pagina.add_style_tag(path=str(ARMADO / "pagina.css"))
    pagina.add_script_tag(path=str(ARMADO / "pagina.js"))
    pagina.wait_for_selector("#aula-manager-panel")


def abrir_plataforma(contexto: BrowserContext, host: str, archivo: str, maquillaje: str) -> Page:
    """Open a sample page from ``pruebas/paginas/`` under ``host`` with the screenshot styling."""
    html = (PAGINAS / archivo).read_text(encoding="utf-8")
    servir(contexto, f"{host}/{archivo}", html.replace("</head>", f"<style>{maquillaje}</style></head>", 1))
    pagina = contexto.new_page()
    pagina.goto(f"{host}/{archivo}")
    return pagina


def capturar_completada(contexto: BrowserContext, trabajador: Worker, host: str, archivo: str, maquillaje: str, envio: dict, destino: str) -> None:
    """Screenshot of a platform page after «Completar esta página»."""
    guardado = mandar_envio(contexto, trabajador, envio)
    pagina = abrir_plataforma(contexto, host, archivo, maquillaje)
    poner_panel(pagina, guardado)
    pagina.click("#aula-manager-panel .am-boton")
    pagina.wait_for_timeout(ESPERA_MS)
    pagina.screenshot(path=str(SALIDA / destino))
    pagina.close()


def imagen_del_popup(contexto: BrowserContext, id_extension: str) -> str:
    """The real popup, rendered as a page of the extension, as a PNG data URL."""
    pagina = contexto.new_page()
    pagina.goto(f"chrome-extension://{id_extension}/popup.html")
    pagina.wait_for_timeout(ESPERA_MS)
    png = pagina.locator("body").screenshot()
    pagina.close()
    return "data:image/png;base64," + base64.b64encode(png).decode()


def capturar_popup(contexto: BrowserContext, trabajador: Worker, id_extension: str, destino: str) -> None:
    """The CBC act before completing it, with the popup open over it as Chrome shows it."""
    mandar_envio(contexto, trabajador, ENVIO_CBC_COMISION)
    popup = imagen_del_popup(contexto, id_extension)
    pagina = abrir_plataforma(contexto, HOST_CBC, "cbc_regulares.html", MAQUILLAJE_CBC)
    pagina.evaluate(
        """([src, lugar]) => {
            const img = document.createElement("img");
            img.src = src;
            Object.assign(img.style, { position: "fixed", top: lugar.top + "px", right: lugar.right + "px",
                borderRadius: "8px", boxShadow: "0 6px 24px rgba(0,0,0,.35)", background: "#fff" });
            document.body.append(img);
            return img.decode();
        }""",
        [popup, POSICION_DEL_POPUP],
    )
    pagina.screenshot(path=str(SALIDA / destino))
    pagina.close()


def capturar_aviso(contexto: BrowserContext, id_extension: str, destino: str) -> None:
    """The welcome page with the privacy notice, then accept it so grades can be handed over."""
    pagina = contexto.new_page()
    pagina.goto(f"chrome-extension://{id_extension}/bienvenida.html")
    pagina.wait_for_timeout(ESPERA_MS)
    pagina.screenshot(path=str(SALIDA / destino))
    pagina.click("#aceptar")
    pagina.wait_for_selector("#aceptar", state="hidden")
    pagina.close()


def capturar_mosaico(contexto: BrowserContext, destino: str) -> None:
    """Small promo tile: the icon, the name and what it does."""
    icono = "data:image/svg+xml;base64," + base64.b64encode(ICONO.read_bytes()).decode()
    pagina = contexto.new_page()
    pagina.set_viewport_size(TAMANO_MOSAICO)
    pagina.set_content(
        f"<html lang='es'><head><meta charset='utf-8'><style>{MAQUILLAJE_MOSAICO}</style></head><body>"
        f"<img src='{icono}'><div><h1>Aula Manager<br><span>pasar notas</span></h1>"
        "<p>Las notas de tu comisión en SIU‑Guaraní y en las actas del CBC, en un clic. Vos revisás y guardás.</p></div></body></html>"
    )
    pagina.screenshot(path=str(SALIDA / destino))
    pagina.close()


# =============================================================================
# Main
# =============================================================================
def main() -> None:
    """Load the built extension and write every Store image to ``tienda/capturas/``."""
    assert (ARMADO / "manifest.json").exists(), "Falta dist/: corré «npm run armar» antes"
    SALIDA.mkdir(parents=True, exist_ok=True)
    pagina_de_aula_manager = "<!doctype html><html lang='es'><head><meta charset='utf-8'><title>Aula Manager</title></head><body></body></html>"
    with sync_playwright() as playwright:
        contexto = playwright.chromium.launch_persistent_context(
            tempfile.mkdtemp(),
            headless=False,
            viewport=TAMANO_CAPTURA,
            device_scale_factor=1,
            # The new headless mode is the one that loads extensions.
            args=["--headless=new", f"--disable-extensions-except={ARMADO}", f"--load-extension={ARMADO}"],
        )
        servir(contexto, f"{AULA_MANAGER}/**", pagina_de_aula_manager)
        trabajador = contexto.service_workers[0] if contexto.service_workers else contexto.wait_for_event("serviceworker")
        id_extension = trabajador.url.split("/")[2]

        capturar_aviso(contexto, id_extension, "4-aviso-de-privacidad.png")
        capturar_completada(contexto, trabajador, HOST_CBC, "cbc_regulares.html", MAQUILLAJE_CBC, ENVIO_CBC_COMISION, "1-cbc-acta-de-comision.png")
        capturar_completada(contexto, trabajador, HOST_GUARANI, "guarani_cursada.html", MAQUILLAJE_GUARANI, ENVIO_GUARANI, "2-guarani-cursada.png")
        capturar_popup(contexto, trabajador, id_extension, "3-popup.png")
        capturar_completada(contexto, trabajador, HOST_CBC, "cbc_libres.html", MAQUILLAJE_CBC, ENVIO_CBC_LIBRES, "5-cbc-acta-de-libres.png")
        capturar_mosaico(contexto, "mosaico-440x280.png")
        contexto.close()
    for imagen in sorted(SALIDA.glob("*.png")):
        print(imagen.relative_to(RAIZ))


if __name__ == "__main__":
    main()
