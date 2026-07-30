# skills

Skills personales para [Claude Code](https://code.claude.com) (y compatibles con
el estandar [Agent Skills](https://agentskills.io)). Se pueden instalar de dos
formas: el plugin `toolkit` las trae **todas** de golpe, o cada skill tiene su
**propio plugin** para instalarla suelta.

El contenido real de cada skill vive una sola vez, en
[`plugins/toolkit/skills/`](./plugins/toolkit/skills) (una subcarpeta por
skill, con `SKILL.md` + `scripts/` + `references/`). Los plugins individuales
no duplican nada: su `skills/<nombre>` es un symlink al de `toolkit`. Ver
[Como estan montados los plugins individuales](#como-estan-montados-los-plugins-individuales)
y [`template/`](./template) para el punto de partida de una skill nueva.

## Skills disponibles

### Propias

| Skill | Que hace |
|-------|----------|
| [`how-to-chrome`](./plugins/toolkit/skills/how-to-chrome) | Control Google Chrome from the terminal via CDP (Chrome DevTools Protocol): navigate, capture (incl. full page and responsive), read console/DOM, fill forms, export to PDF, annotate elements to paste into an AI, and group tabs into a dedicated Chrome tab group. No extension, no MCP, no npm dependencies. |
| [`grill-me`](./plugins/toolkit/skills/grill-me) | Interrogar al usuario sin descanso sobre un plan o diseno hasta alcanzar entendimiento compartido, resolviendo rama a rama del arbol de decision con una respuesta recomendada en cada pregunta. |

### Portadas de [ravila4/claude-adhd-skills](https://github.com/ravila4/claude-adhd-skills) (MIT)

| Skill | Que hace |
|-------|----------|
| [`daily-journal`](./plugins/toolkit/skills/daily-journal) | Diario de desarrollo conversacional, consciente de la hora (mañana=planificacion, tarde/noche=reflexion). Escribe markdown estructurado; Obsidian es opcional, solo para verlo con backlinks/grafo. |
| [`obsidian-vault`](./plugins/toolkit/skills/obsidian-vault) | Estructura de carpetas, nombrado y convenciones de formato para una carpeta de notas personal (compatible con Obsidian, sin requerirlo). |
| [`nudge`](./plugins/toolkit/skills/nudge) | Recordatorios por tiempo ("parame a las 11", "standup en 30m") vía hook + SQLite. No sirve para monitorizar procesos (usa `sleep` para eso). |
| [`test-driven-development`](./plugins/toolkit/skills/test-driven-development) | Logic Gate + Iron Rule: triage de que necesita tests, luego TDD estricto para lo que tiene logica. Generica, no especifica de ADHD. |

### Portada de [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) (MIT)

| Skill | Que hace |
|-------|----------|
| [`i-have-adhd`](./plugins/toolkit/skills/i-have-adhd) | Cambia el estilo de salida de Claude para un lector con ADHD: accion primero, pasos numerados, sin relleno ni cierres tipo "avisame si necesitas algo". Se activa con `/i-have-adhd` o de forma permanente vía `touch ~/.claude/.i-have-adhd-always`. |

Las skills se complementan entre si: el tono de `i-have-adhd` se aplica igual
a los recordatorios de `nudge` y a las preguntas de `daily-journal` sin
configuracion extra (gobierna el tono de cualquier respuesta, venga de la
skill que venga). Ver la seccion "Works well with" en el `SKILL.md` de
`nudge`, `daily-journal` e `i-have-adhd` para el detalle.

## Instalar en Claude Code

### Con el instalador

[`install.sh`](./install.sh) envuelve la CLI `claude plugin`: registra el
marketplace, instala lo que le digas y avisa si vas a acabar con la misma
skill cargada dos veces.

```bash
# desde un clon del repo
./install.sh                      # selector interactivo
./install.sh --all                # todas, via el plugin toolkit
./install.sh nudge how-to-chrome  # solo esas, como plugins individuales
./install.sh --list               # que hay disponible
```

Sin clonar nada:

```bash
curl -fsSL https://raw.githubusercontent.com/MiguelAguiarDEV/skills/main/install.sh | sh -s -- --all
```

Es `sh` POSIX y no necesita `jq` ni `python`. Otras opciones utiles:
`--dry-run` (enseña los comandos sin ejecutarlos), `--scope project` (instala
para todo el que clone el proyecto en vez de solo para ti) y `--local` (usa un
checkout local como marketplace, para desarrollar).

### A mano

Registra este repositorio como marketplace de plugins:

```
/plugin marketplace add MiguelAguiarDEV/skills
```

**Todas las skills de golpe:**

```
/plugin install toolkit@miguelaguiardev-skills
```

**O solo las que quieras**, cada una con su propio plugin:

```
/plugin install how-to-chrome@miguelaguiardev-skills
/plugin install grill-me@miguelaguiardev-skills
/plugin install daily-journal@miguelaguiardev-skills
/plugin install obsidian-vault@miguelaguiardev-skills
/plugin install nudge@miguelaguiardev-skills
/plugin install test-driven-development@miguelaguiardev-skills
/plugin install i-have-adhd@miguelaguiardev-skills
```

Tambien desde el menu interactivo `/plugin` → `Browse and install plugins`.

> **No instales `toolkit` y un plugin individual a la vez.** Son la misma
> skill por dos caminos: se cargaria duplicada y, si tiene hook (`nudge`,
> `daily-journal`, `i-have-adhd`), el hook correria dos veces por prompt.
> Elige una via: `toolkit` si las quieres casi todas, plugins sueltos si
> quieres pocas.

Una vez instalado, basta con mencionar la tarea ("abre esta web en Chrome y
haz una captura", "grill me este plan", "que hice hoy?", "parame en 30
minutos") para que Claude cargue la skill correspondiente sola.
`i-have-adhd` es la excepcion: no se auto-invoca, hay que escribir
`/i-have-adhd` (o activar el flag de "siempre", ver su `SKILL.md`).

> **Si tenias instalado el plugin `claude-adhd-skills`** (version anterior de
> este marketplace): ya no existe. Sus cuatro skills viven ahora en `toolkit`,
> o como plugin propio cada una. Desinstalalo (`/plugin uninstall
> claude-adhd-skills@miguelaguiardev-skills`), corre
> `/plugin marketplace update MiguelAguiarDEV/skills` e instala lo que
> prefieras. `i-have-adhd` sigue existiendo como plugin con el mismo nombre,
> asi que ese se actualiza solo.

> **Si ya tenias este marketplace anadido de antes** y `install` no encuentra
> un plugin nuevo: `marketplace add` no refresca el catalogo si ya estaba en
> disco. Corre `/plugin marketplace update MiguelAguiarDEV/skills` primero y
> reintenta el `install`.

## Hooks activos

Los hooks son del plugin, no de una skill: corren en cualquier sesion con el
plugin instalado, este activa o no la skill a la que sirven. Tres skills
traen hook:

| Evento | Que corre | Para que skill |
|---|---|---|
| `UserPromptSubmit` | inyeccion de fecha/hora actual | `daily-journal` |
| `UserPromptSubmit` | `skills/nudge/scripts/check_alerts.py` | `nudge` |
| `SessionStart` | `hooks/always-on.sh` | `i-have-adhd` |

Instalando `toolkit` los tienes los tres a la vez
([`plugins/toolkit/hooks/hooks.json`](./plugins/toolkit/hooks/hooks.json));
instalando un plugin individual, solo el suyo (cada uno lleva su propio
`hooks/hooks.json` con la parte que le toca).

Los tres son inocuos cuando no se usan: la fecha son unos bytes de contexto,
`check_alerts.py` no imprime nada si no hay recordatorio pendiente, y
`always-on.sh` sale de inmediato salvo que exista el flag
`~/.claude/.i-have-adhd-always`. Ninguno bloquea la sesion (timeout de 5s).

## Como estan montados los plugins individuales

Cada `plugins/<skill>/` es un plugin de verdad (con su
`.claude-plugin/plugin.json` y su entrada en `marketplace.json`), pero **no
contiene una copia de la skill**: su `skills/<skill>` es un symlink a
`plugins/toolkit/skills/<skill>`.

```
plugins/nudge/skills/nudge -> ../../toolkit/skills/nudge
```

Funciona porque al instalar, un symlink que apunta a otro sitio **dentro del
mismo marketplace** se dereferencia: Claude Code copia el contenido real a su
cache en lugar del enlace (ver
[Share files within a marketplace with symlinks](https://code.claude.com/docs/en/plugins-reference#share-files-within-a-marketplace-with-symlinks)).
Lo que no funciona es apuntar fuera del plugin desde `plugin.json` (un
`"skills": ["../toolkit/..."]` se rompe tras instalar, porque esos ficheros
no se copian): por eso symlinks y no rutas en el manifiesto.

Consecuencias practicas:

- La skill se edita **en un solo sitio**, `plugins/toolkit/skills/<skill>/`.
  No hay que sincronizar copias ni existe riesgo de que diverjan.
- `hooks/hooks.json` y `NOTICE.md` si estan duplicados en cada plugin
  individual (contenido distinto en cada uno: solo su hook, solo su
  atribucion). Si cambias un hook, tocalo en los dos sitios.
- En Windows hace falta Developer Mode o `git config core.symlinks true` para
  que el clon del repo conserve los symlinks. Instalando desde el marketplace
  da igual; solo afecta a quien clone el repo para desarrollar.
- Anadir el repo como marketplace por ruta local
  (`claude plugin marketplace add /ruta/al/repo`) **si** funciona: los
  symlinks se dereferencian igual que desde git. Probado instalando `nudge`
  asi y comprobando que en la cache aparecen los ficheros reales, scripts
  incluidos.
- Lo que **no** funciona es `--plugin-dir`: en ese modo solo se conservan los
  symlinks internos al propio plugin. Para ese caso usa `plugins/toolkit`,
  que tiene los ficheros de verdad.

## Anadir una skill nueva

La skill nueva va siempre en `toolkit`, que es donde vive el contenido:

```bash
mkdir -p plugins/toolkit/skills/mi-skill
cp template/SKILL.md plugins/toolkit/skills/mi-skill/SKILL.md
$EDITOR plugins/toolkit/skills/mi-skill/SKILL.md   # frontmatter (name, description) + instrucciones
```

Anade `scripts/` para herramientas ejecutables y `references/` para
documentacion de detalle (troubleshooting, decisiones de diseno) que no
necesita cargarse siempre. Con esto ya entra en `toolkit`: las skills se
autodescubren desde la carpeta `skills/` del plugin.

Para que ademas se pueda instalar suelta, dale su plugin individual:

```bash
mkdir -p plugins/mi-skill/.claude-plugin plugins/mi-skill/skills
ln -s ../../toolkit/skills/mi-skill plugins/mi-skill/skills/mi-skill
$EDITOR plugins/mi-skill/.claude-plugin/plugin.json   # name, description, version, author
```

y anade su entrada en
[`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) con
`"source": "./plugins/mi-skill"`. Si la skill trae hook, replica en
`plugins/mi-skill/hooks/hooks.json` solo la parte suya del hooks.json de
`toolkit`.

Ojo con los hooks y agentes: dentro de `toolkit` son del plugin, no de la
skill, asi que los comparten todas (es el precio de que instalar todo sea un
solo comando). El plugin individual es justamente la valvula de escape para
quien no los quiera.

### Si la skill viene de otro repo (fork/port)

Anade una seccion en
[`plugins/toolkit/NOTICE.md`](./plugins/toolkit/NOTICE.md) con la licencia
original y un resumen de que se cambio en el port (ver las secciones ya
existentes como ejemplo), y un `NOTICE.md` corto en su plugin individual
apuntando a ese (ver [`plugins/nudge/NOTICE.md`](./plugins/nudge/NOTICE.md)).

## Estructura de `toolkit`

Los plugins individuales solo tienen `.claude-plugin/plugin.json`, el symlink
en `skills/`, y `hooks/` + `NOTICE.md` si les aplica. Esta tabla es la de
`toolkit`, que es el plugin completo:

| Carpeta / archivo | Estado | Para que |
|---|---|---|
| `.claude-plugin/plugin.json` | En uso | Metadatos del plugin: nombre, descripcion, version |
| `skills/` | En uso | Una subcarpeta por skill (`SKILL.md` + `scripts/` + `references/`) |
| `hooks/` | En uso | `hooks.json` + manejadores de eventos del ciclo de vida (ver arriba) |
| `NOTICE.md` | En uso | Atribucion de licencia de las skills portadas de otros repos |
| `agents/` | No creada | Definiciones de subagentes personalizados, compartidos por todas las skills |
| `commands/` | No creada | Skills como Markdown plano (estilo legacy; usar `skills/` en su lugar) |
| `monitors/` | No creada | `monitors.json`, monitores de fondo (logs, ficheros, estado externo) |
| `bin/` | No creada | Ejecutables anadidos al `PATH` de la herramienta Bash |
| `.mcp.json` | No creado | Configuracion de servidores MCP |
| `.lsp.json` | No creado | Configuracion de servidores LSP |
| `settings.json` | No creado | Config por defecto del plugin (`agent`, `subagentStatusLine`) |

Todo lo marcado "No creada/No creado" son puntos de extension definidos por la
[referencia de plugins](https://code.claude.com/docs/en/plugins-reference), que
se documentan aqui pero **no** existen en el repo a proposito.

> Estas carpetas estuvieron un tiempo creadas con un `README.md` dentro a modo
> de recordatorio, y fue un error: Claude Code escanea `commands/` y `agents/`
> y cargaba esos `README.md` como una skill y un agente fantasma llamados
> "README", visibles en `claude plugin details` y sumando tokens always-on a
> cada sesion. Si vuelves a crear una de estas carpetas, que sea con contenido
> real, no con documentacion suelta.

## Licencia

[MIT](./LICENSE). Las skills portadas de otros repos mantienen su atribucion
original en [`plugins/toolkit/NOTICE.md`](./plugins/toolkit/NOTICE.md).
