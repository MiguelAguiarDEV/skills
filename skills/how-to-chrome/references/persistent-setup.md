# Configuracion persistente: Chrome siempre con el puerto CDP

> **Garantia de partida:** todo lo de este documento vive en una carpeta de
> perfil **nueva y separada** (`CDP-Profile`). En ningun momento se lee,
> modifica ni borra `%LOCALAPPDATA%\Google\Chrome\User Data` (tu perfil de
> Chrome real). Tus cookies, contrasenas guardadas, historial, extensiones y
> sesion iniciada **no se tocan**. Lo unico que puede cambiar es **que abre el
> icono de Chrome** si eliges la opcion "siempre" de mas abajo — lee el aviso
> antes de aplicarla.

Para no relanzar Chrome en cada sesion, se puede dejar Chrome configurado para
arrancar con el puerto de debug sin tener que lanzarlo a mano cada vez.

## El obstaculo: mitigacion de Chrome 136+

Desde Chrome 136 el navegador **ignora `--remote-debugging-port` si el perfil
es el POR DEFECTO** (`…\User Data`, el de tu cuenta real). Es una mitigacion
de seguridad, no evitable por flags — pasar `--user-data-dir` apuntando al
default tampoco vale. La unica salida es un **perfil dedicado**: una carpeta
de perfil distinta, vacia al principio, que Chrome trata como una cuenta de
navegador separada.

Confirmado empiricamente con test A/B: mismo Chrome, mismos flags, unica
diferencia el `user-data-dir` → con el perfil por defecto el puerto no se
expone; con un perfil dedicado si.

Justo por ser una carpeta separada, crear y usar este perfil dedicado **no
requiere tocar tu perfil real para nada**: no se lee, no se copia, no se
borra. El perfil dedicado empieza vacio (sin tus cookies ni logins) y solo
recupera lo que **Chrome Sync** sincronice si inicias sesion en el — es un
perfil nuevo, no una copia del tuyo.

## Opcion recomendada: acceso directo NUEVO y dedicado (cero impacto en tu Chrome de siempre)

La forma de tener el puerto CDP disponible sin tocar en absoluto tu manera de
navegar cada dia: crear **un unico acceso directo nuevo** ("Chrome (CDP)")
que abre el perfil dedicado, dejando **todos tus accesos directos actuales
intactos** — el icono de Chrome de siempre sigue abriendo tu perfil real,
con tus cookies, sesiones y contrasenas exactamente igual que hoy. Usas el
acceso nuevo solo cuando quieras que un agente controle Chrome.

```powershell
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$udd  = "$env:LOCALAPPDATA\Google\Chrome\CDP-Profile"
$dest = "$env:USERPROFILE\Desktop\Chrome (CDP).lnk"

$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($dest)
$lnk.TargetPath   = $chrome
$lnk.Arguments    = "--remote-debugging-port=9222 --user-data-dir=`"$udd`""
$lnk.IconLocation = "$chrome,0"
$lnk.Save()
```

Esto **no modifica ningun acceso directo existente** ni ningun archivo de tu
perfil real — solo crea un `.lnk` nuevo en el escritorio. Verificar (abriendo
Chrome desde ese nuevo icono): `curl http://127.0.0.1:9222/json/version` debe
devolver el `Browser`.

`scripts/launch-chrome.ps1` hace lo mismo por linea de comandos (lanza el
perfil dedicado sin crear accesos directos), asi que en la practica muchas
veces ni este paso hace falta.

## Alternativa (mas agresiva): que Chrome abra SIEMPRE con CDP, se abra como se abra

Existe una opcion mas comoda pero mas invasiva: reescribir **todos** tus
accesos directos de Chrome (escritorio, barra de tareas, Quick Launch) para
que lleven las flags del puerto y el perfil dedicado, de forma que no haga
falta acordarse de usar un icono especial.

> ⚠️ **Que cambia de verdad:** a partir de aplicar esto, hacer doble clic en
> tu icono de Chrome de toda la vida abre el **perfil dedicado** (inicialmente
> vacio), no tu perfil real. Tu perfil real (`User Data`) sigue intacto en
> disco — nada se borra — pero **dejas de verlo** a traves de esos accesos
> directos hasta que lo abras explicitamente (ver "Volver a tu perfil real"
> abajo) o repongas sesiones vía Chrome Sync. Ten en cuenta que Sync **no
> sincroniza todo**: cookies de sitios donde no marcaste "recordar sesion",
> datos locales de algunas extensiones, o contrasenas si excluiste ese tipo de
> dato del sync, no vuelven solos. Usa esta opcion solo si quieres que el
> perfil dedicado sea tu navegador de trabajo a partir de ahora; si solo
> quieres CDP disponible sin renunciar a nada de tu dia a dia, usa la opcion
> recomendada de arriba.

Si aun asi la quieres:

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

Repetible — util si una actualizacion de Chrome regenera los accesos y
pierden las flags. **Verificar** (Chrome abierto por cualquier acceso
directo): `curl http://127.0.0.1:9222/json/version` → debe devolver el
`Browser`.

### Volver a tu perfil real sin deshacer nada

Tu perfil real nunca se movio ni se borro; sigue en
`%LOCALAPPDATA%\Google\Chrome\User Data`. Para abrirlo explicitamente aunque
los accesos directos ya apunten al perfil dedicado:

```powershell
& "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" `
  --user-data-dir="$env:LOCALAPPDATA\Google\Chrome\User Data" --profile-directory=Default
```

(sin `--remote-debugging-port`: es tu Chrome normal, sin CDP). Para revertir
del todo los accesos directos, vuelve a correr el script de reescritura de
arriba pero con `$flags = ""` (deja `$l.Arguments` vacio) en vez de las flags
de CDP.

### Reconfigurar los accesos directos

Repite el mismo bloque de la alternativa agresiva de arriba cuantas veces
haga falta — es idempotente.

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
  hace esto por ti. `taskkill` cierra pestanas sin guardar cambios en curso
  (formularios a medio rellenar, etc.), pero no borra cookies, historial ni
  sesiones guardadas — eso vive en disco, no en el proceso.

## Seguridad

⚠️ Con el puerto de debug **siempre** abierto, cualquier proceso local puede
controlar ese Chrome. Es un trade-off consciente por comodidad, no lo actives
en una maquina compartida o expuesta. Revertir: quitar
`--remote-debugging-port=9222 --user-data-dir=…` de los accesos directos (o
borrar solo el acceso directo nuevo si usaste la opcion recomendada).
