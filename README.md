# skills

Skills personales para [Claude Code](https://code.claude.com) (y compatibles con
el estandar [Agent Skills](https://agentskills.io)), empaquetadas en un unico
plugin `toolkit` para que instalarlas todas sea un solo comando
(`/plugin install toolkit@miguelaguiardev-skills`).

El plugin vive en [`plugins/toolkit/`](./plugins/toolkit) con su
`.claude-plugin/plugin.json` (nombre, descripcion, version), su carpeta
`skills/` (una subcarpeta por skill, cada una con `SKILL.md` + `scripts/` +
`references/`), sus `hooks/`, y el resto de componentes reservados (`agents/`,
`commands/`, `monitors/`, `bin/`), compartidos por todas las skills. Ver
[`template/`](./template) para el punto de partida de una skill nueva.

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

Registra este repositorio como marketplace de plugins e instala el plugin:

```
/plugin marketplace add MiguelAguiarDEV/skills
/plugin install toolkit@miguelaguiardev-skills
```

O instalalo desde el menu interactivo `/plugin` → `Browse and install plugins`.

Una vez instalado, basta con mencionar la tarea ("abre esta web en Chrome y
haz una captura", "grill me este plan", "que hice hoy?", "parame en 30
minutos") para que Claude cargue la skill correspondiente sola.
`i-have-adhd` es la excepcion: no se auto-invoca, hay que escribir
`/i-have-adhd` (o activar el flag de "siempre", ver su `SKILL.md`).

> **Si tenias instalados los plugins `claude-adhd-skills` o `i-have-adhd`**
> (versiones anteriores de este marketplace): ya no existen, sus skills viven
> ahora dentro de `toolkit`. Desinstalalos (`/plugin uninstall
> claude-adhd-skills@miguelaguiardev-skills`, idem `i-have-adhd`), corre
> `/plugin marketplace update MiguelAguiarDEV/skills` e instala `toolkit`.
> Instalar los tres a la vez duplicaria las mismas skills.

> **Si ya tenias este marketplace anadido de antes** y `install` no encuentra
> un plugin nuevo: `marketplace add` no refresca el catalogo si ya estaba en
> disco. Corre `/plugin marketplace update MiguelAguiarDEV/skills` primero y
> reintenta el `install`.

## Hooks activos

Los hooks son del plugin, no de una skill: se ejecutan en cualquier sesion
con `toolkit` instalado, este activa o no la skill a la que sirven. Estan
declarados en
[`plugins/toolkit/hooks/hooks.json`](./plugins/toolkit/hooks/hooks.json):

| Evento | Que corre | Para que skill |
|---|---|---|
| `UserPromptSubmit` | inyeccion de fecha/hora actual | `daily-journal` |
| `UserPromptSubmit` | `skills/nudge/scripts/check_alerts.py` | `nudge` |
| `SessionStart` | `hooks/always-on.sh` | `i-have-adhd` |

Los tres son inocuos cuando no se usan: la fecha son unos bytes de contexto,
`check_alerts.py` no imprime nada si no hay recordatorio pendiente, y
`always-on.sh` sale de inmediato salvo que exista el flag
`~/.claude/.i-have-adhd-always`. Ninguno bloquea la sesion (timeout de 5s).

## Anadir una skill nueva

```bash
mkdir -p plugins/toolkit/skills/mi-skill
cp template/SKILL.md plugins/toolkit/skills/mi-skill/SKILL.md
$EDITOR plugins/toolkit/skills/mi-skill/SKILL.md   # frontmatter (name, description) + instrucciones
```

Anade `scripts/` para herramientas ejecutables y `references/` para
documentacion de detalle (troubleshooting, decisiones de diseno) que no
necesita cargarse siempre. No hace falta tocar `marketplace.json`: las skills
se autodescubren desde la carpeta `skills/` del plugin.

Si la skill necesita hooks o agentes propios, van en los `hooks/`/`agents/`
del plugin y quedan compartidos con el resto de skills (es el precio de que
instalar todo sea un solo comando). Si algun dia una skill necesita quedar
aislada de verdad, dale su propio plugin (`plugins/mi-plugin/` con su
`.claude-plugin/plugin.json`) y una entrada propia en
[`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) con
`"source": "./plugins/mi-plugin"`; se instalaria aparte.

### Si la skill viene de otro repo (fork/port)

Anade una seccion en
[`plugins/toolkit/NOTICE.md`](./plugins/toolkit/NOTICE.md) con la licencia
original y un resumen de que se cambio en el port (ver las secciones ya
existentes como ejemplo).

## Estructura del plugin

| Carpeta / archivo | Estado | Para que |
|---|---|---|
| `.claude-plugin/plugin.json` | En uso | Metadatos del plugin: nombre, descripcion, version |
| `skills/` | En uso | Una subcarpeta por skill (`SKILL.md` + `scripts/` + `references/`) |
| `hooks/` | En uso | `hooks.json` + manejadores de eventos del ciclo de vida (ver arriba) |
| `NOTICE.md` | En uso | Atribucion de licencia de las skills portadas de otros repos |
| `agents/` | Placeholder | Definiciones de subagentes personalizados, compartidos por todas las skills |
| `commands/` | Placeholder | Skills como Markdown plano (estilo legacy; usar `skills/` en su lugar) |
| `monitors/` | Placeholder | `monitors.json`, monitores de fondo (logs, ficheros, estado externo) |
| `bin/` | Placeholder | Ejecutables anadidos al `PATH` de la herramienta Bash |
| `.mcp.json` | No creado aun | Configuracion de servidores MCP |
| `.lsp.json` | No creado aun | Configuracion de servidores LSP |
| `settings.json` | No creado aun | Config por defecto del plugin (`agent`, `subagentStatusLine`) |

Los tres ultimos son ficheros sueltos (no carpetas) definidos por la
[referencia de plugins](https://code.claude.com/docs/en/plugins-reference);
se documentan aqui como puntos de extension reservados, sin crearlos todavia
para no activar nada por accidente.

## Licencia

[MIT](./LICENSE). Las skills portadas de otros repos mantienen su atribucion
original en [`plugins/toolkit/NOTICE.md`](./plugins/toolkit/NOTICE.md).
