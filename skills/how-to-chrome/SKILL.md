---
name: how-to-chrome
description: "Usar Google Chrome desde el terminal via Chrome DevTools Protocol (CDP), sin extension ni dependencias npm. Navegar, capturar (incl. pagina completa y por breakpoint), leer consola/DOM, rellenar formularios y hacer QA; exportar el diseno a PDF (to-pdf.mjs); anotar elementos de la web para pegar a una IA (anota.mjs); y agrupar pestanas en un grupo propio de Chrome (grupo.mjs). Usar siempre que haya que abrir/probar/auditar una web en el navegador, verificar un diseno, depurar con la consola, exportar capturas/PDF, anotar cambios, o gestionar pestanas."
---

# How to Chrome — controlar Chrome desde el terminal (CDP)

Controla **Google Chrome** desde el terminal con el **Chrome DevTools Protocol
(CDP)**. Sin la extension `claude-in-chrome`, sin MCP, sin paquetes npm: Node 21+
trae `WebSocket` y `fetch` nativos, asi que las herramientas son scripts de un
solo archivo en `scripts/`.

## Como funciona (arquitectura)

```
terminal (Node)  ──WebSocket──►  Chrome (--remote-debugging-port=9222)
   send(method, params) ────────►   Page.navigate, Page.captureScreenshot,
   ◄─── result / eventos            Runtime.evaluate, Emulation.setDeviceMetricsOverride,
                                     Extensions.loadUnpacked, Target.*, …
```

1. Chrome se arranca **una vez** con `--remote-debugging-port=9222` (el puerto
   solo se activa al inicio; no se puede "enchufar" a un Chrome ya abierto).
2. `http://127.0.0.1:9222/json` lista pestanas (targets) con su
   `webSocketDebuggerUrl`; `/json/version` da el WS a nivel navegador.
3. El script se conecta por WebSocket y manda comandos CDP; los eventos vuelven
   por el mismo socket.

## Requisitos y dependencias

- **Google Chrome** (v111+; ver notas de version en `references/persistent-setup.md`).
- **Node.js 21+** (`node --version`) — trae `fetch`/`WebSocket` nativos, cero `npm install`.
- Si el agente corre en **WSL2 y Chrome en Windows**: `pwsh.exe` o `powershell.exe`
  accesible desde WSL, y el modo de red `mirrored` de WSL2 (ver
  `references/wsl2-networking.md` — **léelo antes** si esto aplica, es la causa
  más común de que nada de esto conecte).

Ninguna otra dependencia: no hace falta MCP, no hace falta la extension oficial
`claude-in-chrome` (no ejecutar ambas sobre el mismo Chrome a la vez).

## Instalacion

1. Esta carpeta ya es autocontenida — cópiala tal cual a `.claude/skills/how-to-chrome/`
   de tu proyecto, o instálala como plugin (ver README del repo).
2. Arranca Chrome con el puerto de depuracion:

   ```bash
   pwsh -File scripts/launch-chrome.ps1          # perfil dedicado (tus logins)
   pwsh -File scripts/launch-chrome.ps1 -CleanProfile   # perfil aislado (pruebas anonimas)
   ```

   Desde un terminal **WSL**, usa el envoltorio (comprueba ademas que el puerto
   se ve desde Linux, que es donde corren los scripts):

   ```bash
   scripts/launch-chrome.sh          # perfil dedicado
   scripts/launch-chrome.sh --clean  # perfil aislado
   ```
3. Verifica: `curl http://127.0.0.1:9222/json/version`.

> **Por que un perfil dedicado y no el de siempre:** desde Chrome 136 el
> navegador **ignora `--remote-debugging-port` si el perfil es el POR DEFECTO**.
> El lanzador ya usa un perfil dedicado (`CDP-Profile`) — una carpeta nueva y
> separada que **nunca toca, lee ni borra tu perfil real** (cookies, sesiones,
> contrasenas e historial de tu Chrome de siempre quedan intactos). Si quieres
> que Chrome arranque **siempre** con el puerto abierto (sin relanzarlo cada
> sesion), ver la configuracion persistente en `references/persistent-setup.md`
> — incluye la opcion que no toca ni un solo acceso directo tuyo.

## 1) `scripts/cdp.mjs` — control del navegador

```bash
node scripts/cdp.mjs <comando> [args]
```

| Comando | Que hace |
|--------|----------|
| `tabs` | Lista pestanas con su `tabId` y URL (de TODAS las ventanas, sin distinguirlas) |
| `ventanas` | Lista las **ventanas** del navegador, con sus pestanas, tamano, posicion y estado |
| `nav <url> [tabId]` | Navega (crea pestana nueva si no pasas `tabId`) |
| `shot <a.png> [--full] [--w N --h N] [--mobile] [tabId]` | Captura. `--full`=pagina completa; `--w/--h`=viewport; `--mobile`=touch+DPR |
| `responsive <url> <dir>` | Capturas full-page en movil/tablet/laptop/desktop |
| `text` / `html [tabId]` | Texto visible / HTML completo |
| `eval "<js>" [tabId]` | Ejecuta JS y devuelve el resultado (soporta promesas) |
| `click "<sel>"` / `type "<sel>" "<txt>" [tabId]` | Click / rellenar input (dispara input+change) |
| `console [tabId]` | Vuelca consola, logs y excepciones 3s |

`tabId` = el `id` que muestra `tabs`. Sin `tabId`, usa la primera pestana.

**Flujos tipicos:**
- *Dev loop:* `nav localhost:4321` → `shot dev.png --full` → `console` → corregir → repetir.
- *QA responsive:* `responsive http://localhost:4321 qa/home` → revisar overflow, breakpoints, tap targets…
- *QA funcional:* `nav /contacto` → `type "#email" "malo"` → `click "button[type=submit]"` → `shot`.
- *Depurar DOM:* `eval "getComputedStyle(document.querySelector('.hero')).padding"`.

## 2) `scripts/to-pdf.mjs` — exportar a PDF

Captura la web completa al viewport pedido y la incrusta en un PDF de una
pagina (fiel al pixel; no reflowea como `printToPDF`).

```bash
node scripts/to-pdf.mjs <url> <salida.pdf> --w 1440           # desktop
node scripts/to-pdf.mjs <url> <salida.pdf> --w 390 --mobile   # movil
```

## 3) `scripts/anota.mjs` — anotar elementos para IA

Inyecta un panel en la web (por CDP): seleccionas elementos, escribes un
comentario, y vuelca un `.md` (selector CSS, HTML, estilos y **captura del
elemento**) listo para pegar a cualquier IA. Tambien copia al portapapeles.

```bash
node scripts/anota.mjs [url] --out anotaciones.md
# deja el proceso vivo: cada "Anadir" escribe al .md. Ctrl+C para terminar.
```
En el navegador: **🎯 Seleccionar** → clic en un elemento → **⬆ Padre / ⬇ Hijo**
(o flechas) para navegar la jerarquia en ese punto (util para padres cubiertos
por sus hijos) → comentario → **＋ Anadir**. El recuadro amarillo persiste al scroll.

## 4) `scripts/grupo.mjs` — grupos de pestanas propios

CDP no tiene comando de tab groups, pero **`Extensions.loadUnpacked`** permite
cargar una extension minima **en caliente** (sin relanzar Chrome).
`grupo.mjs` la carga y ejecuta `chrome.tabs.group` en su service worker,
metiendo pestanas en un grupo "Claude" para no mezclarlas con las tuyas.

```bash
node scripts/grupo.mjs abrir <url> [url2 ...]   # abre en el grupo "Claude"
node scripts/grupo.mjs estado                   # lista grupos y pestanas
```
La extension esta en `scripts/ext-grupos/` (solo permisos `tabs` + `tabGroups`).

## Notas tecnicas (leer antes de tocar la captura)

- **Ancho de captura full-page:** usa el **viewport emulado**, NO `cssContentSize.width`.
  Contenido clippeado horizontalmente (un marquee con `overflow-x:clip`) infla
  `cssContentSize` y mete franja vacia a la derecha.
- **Limite de textura (~16384px):** una pagina muy alta a DPR>1 se **repite**
  (Chrome no falla, duplica). Las capturas full-page van a **DPR 1** y, si aun
  superan el limite, se reducen con `clip.scale`.
- **Lazy-load en full-page:** un screenshot no dispara `loading="lazy"` fuera
  del viewport → salen en blanco. Antes de capturar: forzar `eager` + barrido
  de scroll + esperar a que carguen (acotado; **nunca `img.decode()`**, puede colgar).
- **Resaltado que persiste al scroll:** `position:absolute` con coords de pagina
  (`rect + scrollX/scrollY`), no `fixed` con coords de viewport.
- **`elementsFromPoint`** solo ve el viewport: para seleccionar un elemento hay
  que tenerlo en pantalla.
- **Emulacion:** `setDeviceMetricsOverride` funciona; `Page.printToPDF` la
  ignora (usa su propio `paperWidth`), por eso `to-pdf` captura por screenshot
  en vez de `printToPDF`.
- **Nunca preguntar al SO por el estado del navegador; preguntarselo al
  navegador.** Contar ventanas por procesos del sistema es enganoso (ver
  `references/troubleshooting.md`); lo correcto es agrupar los targets CDP por
  `windowId` de `Browser.getWindowForTarget` — es lo que hace `cdp.mjs ventanas`.

Mas gotchas y lecciones aprendidas en uso real: `references/troubleshooting.md`.

## Seguridad

- Con `--remote-debugging-port` activo, cualquier proceso local puede
  controlar ese Chrome. Usalo solo mientras trabajas; al cerrar Chrome el
  puerto desaparece (salvo que hayas aplicado la configuracion persistente).
- Con perfil real, capturas/DOM pueden incluir datos de sesiones logueadas:
  revisa antes de compartir.
- Es control directo por CDP, no la extension oficial `claude-in-chrome` (no
  correr ambas sobre el mismo Chrome).

## Troubleshooting rapido

| Sintoma | Causa / Fix |
|---------|-------------|
| `ECONNREFUSED 127.0.0.1:9222` | Chrome sin el flag → `scripts/launch-chrome.ps1`, o abrirlo por un acceso directo ya configurado |
| Chrome arranca pero 9222 no responde (ni desde Windows) | Perfil POR DEFECTO: Chrome 136+ ignora `--remote-debugging-port` ahi. Usar perfil dedicado — ver `references/persistent-setup.md` |
| `ECONNREFUSED` desde WSL y Chrome SI arrancado | WSL en modo NAT: el loopback no es compartido — ver `references/wsl2-networking.md` |
| `nav` no cambia la pestana que quiero | Sin `tabId` crea una nueva; pasa el `tabId` de `tabs` |
| Puerto en uso (`EADDRINUSE`) | Otro Chrome usa 9222; cierra y relanza, o `-Port` distinto |
| Captura mas ancha de lo esperado | Bug conocido de ancho full-page → ya se fuerza el viewport emulado en `cdp.mjs` |
| Imagenes en blanco en la captura | Lazy-load; `cdp.mjs` ya hace el precargado por scroll |
| `grupo.mjs` no encuentra el service worker | La extension tardo en registrarse; reintenta (el script ya espera) |
| Login/CAPTCHA bloquea | Resuelvelo a mano en la ventana visible y reanuda |

Tabla ampliada, con causas raiz y casos historicos reales: `references/troubleshooting.md`.
