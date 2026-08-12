# skills

Skills personales en formato [Agent Skills](https://agentskills.io), empaquetadas
como plugins de [Claude Code](https://code.claude.com).

El repo esta organizado **como una carpeta de configuracion de agente**
(`skills/`, `hooks/`, `agents/`…). Los plugins son el build: se generan desde
esa raiz. Instalalas **todas de golpe** con el plugin `toolkit`, **una a una**
con su plugin individual, o **copiandolas** en tu `~/.claude`.

## Skills

| Skill | Que hace |
|---|---|
| [`how-to-chrome`](./skills/how-to-chrome) | Maneja tu Chrome real (tu perfil, tus sesiones) desde la terminal via CDP: navegar, capturar (full page y por breakpoint), leer consola/DOM, rellenar formularios, exportar a PDF, anotar elementos y agrupar pestanas. Sin extension, sin MCP, sin npm. |
| [`grill-me`](./skills/grill-me) | Te interroga sobre un plan o diseno hasta que no queden ramas del arbol de decision sin resolver, con una respuesta recomendada en cada pregunta. |
| [`daily-journal`](./skills/daily-journal) † | Diario de desarrollo conversacional, consciente de la hora (mañana = planificacion, tarde/noche = reflexion). Escribe markdown estructurado. |
| [`obsidian-vault`](./skills/obsidian-vault) † | Estructura, nombrado y formato para una carpeta de notas personal. Compatible con Obsidian, sin requerirlo. |
| [`test-driven-development`](./skills/test-driven-development) † | Logic Gate + Iron Rule: triage de que necesita tests, luego TDD estricto para lo que tiene logica. |
| [`i-have-adhd`](./skills/i-have-adhd) ‡ | Estilo de salida para lector con ADHD: accion primero, pasos numerados, sin relleno. **No se auto-invoca**: escribe `/i-have-adhd`. |

† portadas de [ravila4/claude-adhd-skills](https://github.com/ravila4/claude-adhd-skills) ·
‡ portada de [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) · ambas MIT,
atribucion en [`NOTICE.md`](./NOTICE.md)

Una vez instaladas se activan solas al mencionar la tarea ("haz una captura de
esta web", "grill me este plan", "que hice hoy?", "parame en 30 minutos").

## Instalar

[`install.sh`](./install.sh) pregunta **que** instalar y **donde**:

```bash
git clone https://github.com/MiguelAguiarDEV/skills && cd skills
./install.sh
```

Sin clonar nada:

```bash
curl -fsSL https://raw.githubusercontent.com/MiguelAguiarDEV/skills/main/install.sh | sh
```

### Como plugins (por defecto)

```bash
./install.sh --all                        # todas (plugin toolkit)
./install.sh grill-me how-to-chrome       # solo esas
./install.sh --all --scope project        # todas, para el equipo
```

o a mano:

```bash
claude plugin marketplace add MiguelAguiarDEV/skills
claude plugin install toolkit@miguelaguiardev-skills
```

Dentro de Claude Code son los mismos comandos con `/`:
`/plugin marketplace add ...`, `/plugin install ...`, o el menu `/plugin`.

| Scope | Fichero | Quien lo ve |
|---|---|---|
| `user` (por defecto) | `~/.claude/settings.json` | Tu, en todos tus proyectos |
| `project` | `.claude/settings.json` | Todo el que clone el proyecto |
| `local` | `.claude/settings.local.json` | Solo tu, solo en ese proyecto |

> **No instales `toolkit` y un plugin individual a la vez.** Son la misma skill
> por dos caminos: se carga dos veces y, si tiene hook (`daily-journal`,
> `i-have-adhd`), el hook corre dos veces por prompt.
> `install.sh` te avisa; a mano no.

### Copiando en tu carpeta de configuracion

Para usarlas fuera de Claude Code, o sin pasar por el marketplace:

```bash
./install.sh --copy --all             # vuelca skills/ y hooks/ en ~/.claude
./install.sh --copy grill-me how-to-chrome   # solo esas
./install.sh --copy --uninstall       # deshacerlo
```

Copia `skills/`, `agents/`, `commands/` y `output-styles/` a
`${CLAUDE_CONFIG_DIR:-~/.claude}` y **fusiona** los hooks en tu `settings.json`,
guardando antes un `.bak` y anotando lo que inserta para poder quitarlo despues
sin tocar tus propios hooks. Necesita `python3` para esa fusion.

Como las skills son Agent Skills estandar, la carpeta `skills/` tambien vale
para Codex, Cursor, Gemini CLI, opencode y demas: copiala donde ese harness
espere sus skills.

Alternativa que no toca tu `settings.json`:

```bash
./install.sh --copy --as-plugin grill-me   # -> ~/.claude/skills/grill-me
```

Copia el plugin ya construido, que Claude Code carga como `grill-me@skills-dir`
con sus hooks dentro, sin marketplace y sin paso de instalacion. Se desactiva
con `claude plugin disable grill-me@skills-dir`.

### Flags

| Flag | Para que |
|---|---|
| `-a, --all` | Todas las skills (plugin `toolkit` en modo marketplace) |
| `-c, --copy` | Copia en `~/.claude` en vez de instalar plugins |
| `--as-plugin` | Con `--copy`: copia el plugin (`<x>@skills-dir`) |
| `-u, --uninstall` | Con `--copy`: deshace la copia |
| `-l, --list` | Lista las skills y sale |
| `-s, --scope SCOPE` | `user` (por defecto), `project` o `local` |
| `-n, --dry-run` | Enseña los comandos sin ejecutarlos |
| `-f, --force` | Salta el aviso de skill duplicada |
| `--local [DIR]` | Usa un checkout local como marketplace (para desarrollar) |

## Gestionar lo instalado

```bash
claude plugin list                                  # que tienes instalado
claude plugin details toolkit                       # skills, hooks y coste en tokens
claude plugin update toolkit@miguelaguiardev-skills # actualizar
claude plugin disable grill-me                      # desactivar sin desinstalar
claude plugin uninstall grill-me@miguelaguiardev-skills
claude plugin marketplace update miguelaguiardev-skills   # refrescar el catalogo
```

Tras instalar o actualizar, reinicia la sesion para que carguen los hooks.

> Si `install` no encuentra un plugin nuevo, corre primero
> `marketplace update`: `marketplace add` no refresca un catalogo ya en disco.

## Como esta organizado el repo

```
skills/<name>/SKILL.md      fuente. Agent Skills puro, portable
hooks/<name>.json           fuente. El hook de esa skill
hooks/<name>/               fuente. Scripts que solo usa ese hook
notices/<upstream>.md       fuente. Atribucion de lo portado
build/plugins.json          fuente. El catalogo
---------------------------------------------------------------
plugins/**                  GENERADO   ) node build/build.mjs
.claude-plugin/marketplace.json  GENERADO
NOTICE.md                   GENERADO
```

El contenido de cada skill existe **una sola vez**. Los plugins son manifiestos
y symlinks: al instalar, un symlink que apunta a otro punto del mismo
marketplace se dereferencia y Claude Code copia los ficheros reales a su cache
([docs](https://code.claude.com/docs/en/plugins-reference#share-files-within-a-marketplace-with-symlinks)).

Detalles en [`docs/architecture.md`](./docs/architecture.md), los hooks en
[`docs/hooks.md`](./docs/hooks.md), y como añadir una skill en
[`AGENTS.md`](./AGENTS.md).

## Licencia

[MIT](./LICENSE). Las skills portadas mantienen su atribucion original en
[`NOTICE.md`](./NOTICE.md).
