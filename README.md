# Aula Manager: pasar notas

Extensión de Chrome que completa la carga de notas de **SIU-Guaraní** con las notas de [Aula Manager](https://aula-manager.com). Funciona en el Guaraní de cualquier universidad, y está armada para sumar otras plataformas de carga.

Aula Manager nunca entra a Guaraní ni ve tu contraseña. La extensión llena el formulario en tu navegador, dentro de tu sesión; vos revisás y apretás «Guardar». Cerrar y firmar el acta lo seguís haciendo vos.

## Cómo se usa

Al instalarla se abre una página que explica qué hace con los datos; hasta que la aceptás, no recibe notas.

1. En Aula Manager, en el libro de notas, entrá a **Pasar a: SIU-Guaraní**. Elegí acta de cursada o mesa de examen, generá las notas y tocá **Mandar a la extensión**.
2. Abrí en Guaraní la pantalla de carga de notas.
3. Tocá el ícono de Aula Manager en la barra de Chrome y después **Usar en esta página**.
4. En el recuadro de Aula Manager, tocá **Completar esta página**. Las filas quedan en verde (se cargó), amarillo (ya tenía nota, no se tocó) o rojo (hay un problema, o el DNI no está en lo que mandaste).
5. Revisá y guardá. Repetí en cada página del acta.

## Qué datos maneja

- Desde Aula Manager llegan solo el DNI de cada alumno y los campos del acta (fecha, nota, resultado, condición). Ningún nombre.
- Las notas quedan en la memoria del navegador (`chrome.storage.session`): se borran a las dos horas, al cerrar Chrome o con «Borrar las notas guardadas». Nunca se escriben en el disco.
- La extensión no tiene acceso permanente a ningún sitio. Entra a la pestaña de Guaraní solo cuando tocás «Usar en esta página» (permiso `activeTab`), y solo acepta notas que vengan de aula-manager.com.
- No manda nada a ningún servidor.

## Plataformas

| Plataforma | Estado |
| --- | --- |
| SIU-Guaraní 3, acta de cursada (regularidad y promoción) | Lista |
| SIU-Guaraní 3, mesa de examen | Lista |
| Otras (Boletín Digital de PBA, AprendeBA, sistemas propios de facultades) | Por sumar: hace falta ver cómo es su pantalla de carga |

Las opciones de cada desplegable se eligen por el texto que se ve («Regular», «Aprobado», «7») y no por los códigos internos de cada universidad, que cambian de una a otra. Un alumno que en Guaraní tiene el CUIT en lugar del DNI también se reconoce.

### Sumar una plataforma

Cada plataforma es un archivo en `src/adaptadores/` que implementa `Adaptador` (`src/adaptadores/adaptador.ts`): reconocer la página, encontrar las filas y los campos de cada fila. Completar, marcar y avisar es común a todas (`src/completar.ts`). Se registra en `src/adaptadores/index.ts` y se prueba con una página de ejemplo, con alumnos inventados, en `pruebas/paginas/`.

## Desarrollo

```bash
npm install
npm test          # pruebas con páginas de ejemplo
npm run revisar   # tipos
npm run armar     # arma la extensión en dist/
```

Para probarla: en `chrome://extensions`, activá el modo de desarrollador, «Cargar descomprimida» y elegí la carpeta `dist/`.

`DESARROLLO=1 npm run armar` arma una versión que también acepta notas del Aula Manager local (`http://localhost:8000`). No la publiques: la versión publicada solo acepta aula-manager.com.

## Origen y licencia

Esta extensión nace de [guarani-chrome](https://github.com/facundoq/guarani-chrome), de Facundo Manuel Quiroga, que fue la primera en completar la carga de Guaraní desde un CSV. De ahí viene la estructura de las páginas de Guaraní que se usa en `src/adaptadores/guarani.ts`. Se reescribió para que funcione en cualquier universidad, reciba las notas desde Aula Manager y admita otras plataformas.

Como guarani-chrome, se distribuye bajo la licencia **GNU Affero General Public License v3.0** (ver `LICENSE`).
