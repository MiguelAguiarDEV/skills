# Configuracion persistente: Chrome siempre con el puerto CDP

Para no relanzar Chrome en cada sesion, se puede dejar Chrome configurado para
arrancar **siempre** con el puerto de debug, se abra como se abra (icono de
escritorio, barra de tareas, Quick Launch).

## El obstaculo: mitigacion de Chrome 136+

Desde Chrome 136 el navegador **ignora `--remote-debugging-port` si el perfil
es el POR DEFECTO** (`…\User Data`). Es una mitigacion de seguridad, no
evitable por flags — pasar `--user-data-dir` apuntando al default tampoco
vale. La unica salida es un **perfil dedicado** (un `--user-data-dir` distinto
del default).

Confirmado empiricamente con test A/B: mismo Chrome, mismos flags, unica
diferencia el `user-data-dir` → con el perfil por defecto el puerto no se
expone; con un perfil dedicado si.

## Solucion aplicada

- **Perfil dedicado:** `%LOCALAPPDATA%\Google\Chrome\CDP-Profile`
  (`C:\Users\<usuario>\AppData\Local\Google\Chrome\CDP-Profile`). Persiste
  logins, extensiones y marcadores; con **Chrome Sync** se recuperan al
  iniciar sesion la primera vez. Pasa a ser el navegador de trabajo.
- Los **accesos directos** de Chrome (Escritorio publico, barra de tareas,
  Quick Launch) llevan en su Target:
  `--remote-debugging-port=9222 --user-data-dir="…\CDP-Profile"`
- `scripts/launch-chrome.ps1` (modo por defecto, sin `-CleanProfile`) usa ese
  mismo perfil dedicado.

### Reconfigurar los accesos directos

Repetible — util si una actualizacion de Chrome los regenera y pierden las
flags:

```powershell
$udd   = "$env:LOCALAPPDATA\Google\Chrome\CDP-Profile"
$flags = "--remote-debugging-port=9222 --user-data-dir=`"$udd`""
$ws = New-Object -ComObject WScript.Shell
foreach($d in @("$env:USERPROFILE\Desktop","$env:PUBLIC\Desktop",
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
  "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar",
  "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch")){
  if(Test-Path $d){ Get-ChildItem $d -Filter *.lnk -Recurse -EA SilentlyContinue | %{
    $l=$ws.CreateShortcut($_.FullName); if($l.TargetPath -like "*chrome.exe"){ $l.Arguments=$flags; $l.Save() } } }
}
```

**Verificar** (Chrome abierto por cualquier acceso directo):
`curl http://127.0.0.1:9222/json/version` → debe devolver el `Browser`.

## Limitaciones

- Cubre abrir Chrome por **acceso directo**. Enlaces abiertos desde OTRAS apps
  (correo, etc.) usan el handler del registro y **no** llevan el flag;
  cubrirlos exigiria tocar `HKCU\…\ChromeHTML\shell\open\command` (mas
  intrusivo, no cubierto aqui).
- El **menu inicio de sistema** (`C:\ProgramData\…\Start Menu`) requiere admin;
  puede no modificarse.
- Si Chrome ya esta abierto, un nuevo lanzamiento NO reaplica flags: cerrar del
  todo (`taskkill /IM chrome.exe /F`) y reabrir. `scripts/launch-chrome.ps1` ya
  hace esto por ti.

## Seguridad

⚠️ Con el puerto de debug **siempre** abierto, cualquier proceso local puede
controlar Chrome (cookies, sesiones, teclear). Es un trade-off consciente por
comodidad, no lo actives en una maquina compartida o expuesta. Revertir:
quitar `--remote-debugging-port=9222 --user-data-dir=…` de los accesos
directos.
