# Troubleshooting ampliado y lecciones aprendidas

Tabla rapida de sintomas en el `SKILL.md` principal. Aqui va el detalle de
causa raiz y los hallazgos de uso real que no caben en la referencia rapida.

## `Extensions.loadUnpacked` falla con "File path cannot be resolved."

Pasa cuando `grupo.mjs` corre en **WSL** pero Chrome es el binario de
**Windows**: si le das la ruta Linux de `scripts/ext-grupos/`
(`/mnt/c/...` o similar), Chrome no puede resolverla — necesita una ruta
Windows (`C:\...`).

**Fix ya aplicado en el script:** `grupo.mjs` traduce la ruta con `wslpath -w`
antes de pasarsela a `Extensions.loadUnpacked` (funcion `rutaParaChrome()`).
Fuera de WSL, `wslpath` no existe y el script usa la ruta tal cual.

## Contar ventanas/pestanas por el sistema operativo miente

Contar procesos `chrome.exe` con `Get-Process | Where MainWindowTitle` (o
equivalente) da **siempre 1** aunque haya varias ventanas abiertas: todas las
ventanas de un mismo perfil cuelgan del **mismo proceso raiz** (los demas
procesos son renderers de pestana, extension y GPU, sin ventana propia), y
`MainWindowTitle` devuelve una sola por proceso — la que este en primer plano.
Ademas ese titulo *cambia* entre consultas, dando la falsa impresion de que el
usuario navego.

**La fuente fiable es el propio navegador:** agrupar los targets de CDP por el
`windowId` que devuelve `Browser.getWindowForTarget` — es exactamente lo que
hace `cdp.mjs ventanas`. Vale igual para saber si hay pestanas abiertas, que
se esta viendo, o en que monitor esta una ventana: la verdad esta en CDP, no
en la lista de procesos del SO.

## `shot`/`eval`/`text` sin `tabId` van a la primera pestana

Un error facil: navegar con `nav <url>` (sin `tabId`, crea pestana nueva) y
luego capturar con `shot` sin pasar el `tabId` de esa pestana nueva — captura
la **primera** pestana de la lista, no la que acabas de abrir. Pasa siempre el
`tabId` que devuelve `tabs` cuando trabajes con mas de una pestana.

## Capturas full-page con `position: sticky` parecen tener bugs de layout que no existen

Al hacer `shot --full` de una pagina con un nav/header en `position: sticky`,
puede aparecer un "solape" visual en la captura que **parece** un bug de
layout real pero es un **artefacto del stitching** de la captura full-page (el
elemento sticky se repite en la costura entre el viewport capturado y el resto
del scroll). Antes de reportar un bug de overlap visual, vuelve a capturar a
viewport real (sin `--full`) para confirmar si es un problema real o solo un
artefacto de la captura.

## Animaciones "reveal" por scroll no aparecen en capturas full-page

Ademas del `loading="lazy"` ya cubierto por el precargado de `cdp.mjs`,
animaciones basadas en `IntersectionObserver` (patron tipico:
`opacity:0` + clase añadida al entrar en viewport) tampoco se disparan en una
captura full-page si el elemento nunca entra en el viewport real durante el
precargado — salen en blanco aunque funcionen bien con scroll real del
usuario. Si una seccion sale vacia en la captura pero se ve bien en el
navegador, sospecha primero de esto antes de un bug de CSS.

## Versión mínima verificada

Confirmado funcionando con Chrome 136+ (perfil dedicado) y Chrome 150 en
Windows 11 (build 26200+), WSL2 2.6+, con `networkingMode=mirrored`. Versiones
de Chrome anteriores a 111 no tienen el problema de
`--remote-debugging-address` (pero tampoco lo necesitan: exponen el puerto de
forma mas laxa).
