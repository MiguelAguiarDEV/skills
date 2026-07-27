# WSL2 ↔ Windows: por qué hace falta el modo espejo

Aplica solo si el agente corre en **WSL2** y Chrome corre en **Windows** (el
caso mas comun al usar Claude Code desde WSL apuntando al Chrome nativo del
host). Si Chrome y el agente corren en el mismo SO, nada de esto aplica.

## El problema

Chrome abre el puerto CDP **solo en el `127.0.0.1` de Windows**:

1. Desde Chrome 111, el flag `--remote-debugging-address` se **ignora**.
   Aunque le pases `0.0.0.0`, `Get-NetTCPConnection` sigue mostrando
   `LocalAddress 127.0.0.1`. No hay forma de exponerlo a otra interfaz por flags.
2. En el modo de red **por defecto de WSL2 (NAT)**, el `127.0.0.1` de Linux es
   un namespace de red distinto del de Windows. Las herramientas de `scripts/`
   corren en Linux y hablan de `127.0.0.1:9222`, que en NAT **no** es el mismo
   host que el Chrome de Windows.

El firewall de Windows normalmente **no** es el problema (se puede comprobar
con un listener TCP suelto en otro puerto: el trafico entrante desde la vNIC
de WSL llega bien).

## La solucion: modo espejo

Pon WSL2 y Windows en la **misma red** con el modo espejo, en
`C:\Users\<usuario>\.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
dnsTunneling=true
autoProxy=true

[experimental]
hostAddressLoopback=true
```

**Gotcha:** `hostAddressLoopback` va en `[experimental]`. Si lo pones en
`[wsl2]`, WSL avisa `Unknown key 'wsl2.hostAddressLoopback'` — es solo un
aviso, ignora esa linea y aplica el resto (no impide el modo espejo).

Se aplica solo tras `wsl --shutdown` (apaga WSL entero y mata la sesion del
agente). Requiere **Windows 11 22H2** o superior.

### Verificar en que modo estas

```bash
ip route | grep default
```
- Gateway `172.x.x.1` (o similar, red privada de WSL) → sigues en **NAT**, el
  shutdown no se aplico o no soporta modo espejo.
- Gateway = la del router real (p.ej. `192.168.1.1`) → **modo espejo activo**.
  A partir de aqui `127.0.0.1:9222` desde Linux llega al Chrome de Windows sin
  tocar nada del proyecto.

Con modo espejo activo, `curl http://127.0.0.1:9222/json/version` desde WSL
debe devolver el JSON del navegador.

## `CDP_HOST`

Los scripts soportan `CDP_HOST=host:puerto` para apuntar a otro destino, pero
**no basta por si solo** en NAT: los endpoints `/json` devuelven
`webSocketDebuggerUrl` con `127.0.0.1` **embebido dentro del JSON**, y ese host
se usa tal cual al abrir el WebSocket — reescribir solo el host de la
peticion HTTP inicial no arregla el WebSocket. Por eso la via correcta es el
modo espejo, no una variable de entorno.

## Alternativa considerada y descartada

Se evaluo un puente TCP en Windows (relay de la vNIC de WSL hacia
`127.0.0.1:9222`) para evitar el `wsl --shutdown`. Se descarto porque habria
exigido parchear los `webSocketDebuggerUrl` que devuelven los scripts (el
mismo problema de host embebido de arriba), y el modo espejo resuelve esto sin
tocar ningun script.

## Caveat conocido

El modo espejo **puede llevarse mal con VPN corporativas** (algunas
reconfiguran el enrutamiento de forma que rompe el espejo). Si tu maquina usa
VPN de empresa, comprueba `ip route` tras conectarte a la VPN.
