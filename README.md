# skills

Skills personales para [Claude Code](https://code.claude.com) (y compatibles con
el estandar [Agent Skills](https://agentskills.io)), empaquetadas como plugins
independientes. Cada plugin agrupa una o varias skills relacionadas para que
instalarlas sea un solo comando (`/plugin install <plugin>@...`); skills que
necesitan estar aisladas entre si (agentes/hooks propios) van en plugins
separados.

Cada plugin vive en `plugins/<nombre>/` con su `.claude-plugin/plugin.json`
(nombre, descripcion, version), su carpeta `skills/` (una subcarpeta por
skill, cada una con `SKILL.md` + `scripts/` + `references/`), y el resto de
componentes reservados (`agents/`, `hooks/`, `commands/`, `monitors/`, `bin/`),
compartidos por todas las skills de ese plugin. Ver [`template/`](./template)
para el punto de partida de una skill nueva.

## Plugins disponibles

### `toolkit` — propias

| Skill | Que hace |
|-------|----------|
| [`how-to-chrome`](./plugins/toolkit/skills/how-to-chrome) | Control Google Chrome from the terminal via CDP (Chrome DevTools Protocol): navigate, capture (incl. full page and responsive), read console/DOM, fill forms, export to PDF, annotate elements to paste into an AI, and group tabs into a dedicated Chrome tab group. No extension, no MCP, no npm dependencies. |
| [`grill-me`](./plugins/toolkit/skills/grill-me) | Interrogar al usuario sin descanso sobre un plan o diseno hasta alcanzar entendimiento compartido, resolviendo rama a rama del arbol de decision con una respuesta recomendada en cada pregunta. |

### `claude-adhd-skills` — portado de [ravila4/claude-adhd-skills](https://github.com/ravila4/claude-adhd-skills) (MIT)

| Skill | Que hace |
|-------|----------|
| [`daily-journal`](./plugins/claude-adhd-skills/skills/daily-journal) | Diario de desarrollo conversacional, consciente de la hora (mañana=planificacion, tarde/noche=reflexion). Escribe markdown estructurado; Obsidian es opcional, solo para verlo con backlinks/grafo. |
| [`obsidian-vault`](./plugins/claude-adhd-skills/skills/obsidian-vault) | Estructura de carpetas, nombrado y convenciones de formato para una carpeta de notas personal (compatible con Obsidian, sin requerirlo). |
| [`nudge`](./plugins/claude-adhd-skills/skills/nudge) | Recordatorios por tiempo ("parame a las 11", "standup en 30m") vía hook + SQLite. No sirve para monitorizar procesos (usa `sleep` para eso). |
| [`test-driven-development`](./plugins/claude-adhd-skills/skills/test-driven-development) | Logic Gate + Iron Rule: triage de que necesita tests, luego TDD estricto para lo que tiene logica. Generica, no especifica de ADHD. |

### `i-have-adhd` — portado de [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) (MIT)

| Skill | Que hace |
|-------|----------|
| [`i-have-adhd`](./plugins/i-have-adhd/skills/i-have-adhd) | Cambia el estilo de salida de Claude para un lector con ADHD: accion primero, pasos numerados, sin relleno ni cierres tipo "avisame si necesitas algo". Se activa con `/i-have-adhd` o de forma permanente vía `touch ~/.claude/.i-have-adhd-always`. |

`claude-adhd-skills` y `i-have-adhd` son independientes entre si (cada uno
instalable solo), pero se complementan si tienes los dos: el tono de
`i-have-adhd` se aplica igual a los recordatorios de `nudge` sin configuracion
extra (gobierna el tono de cualquier respuesta, venga de la skill que venga).
Ver la seccion "Works well with" en el `SKILL.md` de `nudge`, `daily-journal`
e `i-have-adhd` para el detalle.

## Instalar en Claude Code

Registra este repositorio como marketplace de plugins:

```
/plugin marketplace add MiguelAguiarDEV/skills
```

Instala el/los plugin(s) que quieras (cada uno es un comando; no hay
"instalar todo el marketplace de golpe"):

```
/plugin install toolkit@miguelaguiardev-skills
/plugin install claude-adhd-skills@miguelaguiardev-skills
/plugin install i-have-adhd@miguelaguiardev-skills
```

O instalalos desde el menu interactivo `/plugin` → `Browse and install plugins`
(tambien uno a la vez).

Una vez instalado, basta con mencionar la tarea ("abre esta web en Chrome y
haz una captura", "grill me este plan", "que hice hoy?", "parame en 30
minutos") para que Claude cargue la skill correspondiente sola.
`i-have-adhd` es la excepcion: no se auto-invoca, hay que escribir
`/i-have-adhd` (o activar el flag de "siempre", ver su `SKILL.md`).

> **Si ya tenias este marketplace anadido de antes** y `install` no encuentra
> un plugin nuevo: `marketplace add` no refresca el catalogo si ya estaba en
> disco. Corre `/plugin marketplace update MiguelAguiarDEV/skills` primero y
> reintenta el `install`.

## Anadir una skill nueva

Si encaja con el proposito de un plugin existente (p.ej. otra skill de
productividad en `claude-adhd-skills`), anadela ahi:

```bash
mkdir -p plugins/<plugin>/skills/mi-skill
cp template/SKILL.md plugins/<plugin>/skills/mi-skill/SKILL.md
$EDITOR plugins/<plugin>/skills/mi-skill/SKILL.md   # frontmatter (name, description) + instrucciones
```

Anade `scripts/` para herramientas ejecutables y `references/` para
documentacion de detalle (troubleshooting, decisiones de diseno) que no
necesita cargarse siempre. No hace falta tocar `marketplace.json`: las skills
se autodescubren desde la carpeta `skills/` del plugin.

### Si la skill nueva necesita agentes/hooks propios y aislados

Los `agents/`/`hooks/`/etc. de un plugin son compartidos por todas las skills
de ese plugin (es el precio de que instalarlo sea un solo comando). Si una
skill nueva necesita sus propios agentes o hooks sin mezclarse con los del
resto, dale su propio plugin en vez de anadirla a uno existente:

```bash
mkdir -p plugins/mi-plugin/.claude-plugin plugins/mi-plugin/skills/mi-skill
```

y una entrada propia en
[`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) con
`"source": "./plugins/mi-plugin"`. Esa skill se instala aparte, con su propio
`/plugin install mi-plugin@miguelaguiardev-skills`.

### Si la skill viene de otro repo (fork/port)

Anade un `NOTICE.md` en la raiz del plugin con la licencia original y un
resumen de que se cambio en el port (ver
[`plugins/claude-adhd-skills/NOTICE.md`](./plugins/claude-adhd-skills/NOTICE.md)
y
[`plugins/i-have-adhd/NOTICE.md`](./plugins/i-have-adhd/NOTICE.md)
como ejemplo).

## Estructura de un plugin

| Carpeta / archivo | Estado | Para que |
|---|---|---|
| `.claude-plugin/plugin.json` | En uso | Metadatos del plugin: nombre, descripcion, version |
| `skills/` | En uso | Una subcarpeta por skill (`SKILL.md` + `scripts/` + `references/`) |
| `NOTICE.md` | En uso si aplica | Atribucion de licencia cuando la skill viene de otro repo |
| `agents/` | Placeholder | Definiciones de subagentes personalizados, compartidos por todas las skills |
| `hooks/` | Placeholder o en uso | `hooks.json`, manejadores de eventos del ciclo de vida |
| `commands/` | Placeholder | Skills como Markdown plano (estilo legacy; usar `skills/` en su lugar) |
| `monitors/` | Placeholder | `monitors.json`, monitores de fondo (logs, ficheros, estado externo) |
| `bin/` | Placeholder | Ejecutables anadidos al `PATH` de la herramienta Bash |
| `.mcp.json` | No creado aun | Configuracion de servidores MCP |
| `.lsp.json` | No creado aun | Configuracion de servidores LSP |
| `settings.json` | No creado aun | Config por defecto del plugin (`agent`, `subagentStatusLine`) |

`claude-adhd-skills` y `i-have-adhd` ya usan `hooks/hooks.json` de verdad
(inyeccion de fecha/hora + recordatorios el primero, activacion "always-on"
el segundo). `toolkit` los deja como placeholder.

Los tres ultimos son ficheros sueltos (no carpetas) definidos por la
[referencia de plugins](https://code.claude.com/docs/en/plugins-reference);
se documentan aqui como puntos de extension reservados, sin crearlos todavia
para no activar nada por accidente.

## Licencia

[MIT](./LICENSE). Las skills portadas de otros repos mantienen su atribucion
original en el `NOTICE.md` de su plugin.
