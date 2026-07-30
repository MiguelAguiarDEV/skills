# skills

Skills personales para [Claude Code](https://code.claude.com), compatibles con
el estandar [Agent Skills](https://agentskills.io). Instalalas **todas de
golpe** con el plugin `toolkit`, o **una a una** con su plugin individual.

## Skills

| Skill | Que hace |
|---|---|
| [`how-to-chrome`](./plugins/toolkit/skills/how-to-chrome) | Maneja tu Chrome real (tu perfil, tus sesiones) desde la terminal via CDP: navegar, capturar (full page y por breakpoint), leer consola/DOM, rellenar formularios, exportar a PDF, anotar elementos y agrupar pestanas. Sin extension, sin MCP, sin npm. |
| [`grill-me`](./plugins/toolkit/skills/grill-me) | Te interroga sobre un plan o diseno hasta que no queden ramas del arbol de decision sin resolver, con una respuesta recomendada en cada pregunta. |
| [`daily-journal`](./plugins/toolkit/skills/daily-journal) † | Diario de desarrollo conversacional, consciente de la hora (mañana = planificacion, tarde/noche = reflexion). Escribe markdown estructurado. |
| [`obsidian-vault`](./plugins/toolkit/skills/obsidian-vault) † | Estructura, nombrado y formato para una carpeta de notas personal. Compatible con Obsidian, sin requerirlo. |
| [`nudge`](./plugins/toolkit/skills/nudge) † | Recordatorios por tiempo ("parame a las 11", "standup en 30m") via hook + SQLite. No sirve para monitorizar procesos. |
| [`test-driven-development`](./plugins/toolkit/skills/test-driven-development) † | Logic Gate + Iron Rule: triage de que necesita tests, luego TDD estricto para lo que tiene logica. |
| [`i-have-adhd`](./plugins/toolkit/skills/i-have-adhd) ‡ | Estilo de salida para lector con ADHD: accion primero, pasos numerados, sin relleno. **No se auto-invoca**: escribe `/i-have-adhd`. |

† portadas de [ravila4/claude-adhd-skills](https://github.com/ravila4/claude-adhd-skills) ·
‡ portada de [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) · ambas MIT,
atribucion en [`plugins/toolkit/NOTICE.md`](./plugins/toolkit/NOTICE.md)

Una vez instaladas se activan solas al mencionar la tarea ("haz una captura de
esta web", "grill me este plan", "que hice hoy?", "parame en 30 minutos").

## Instalar

### Con el instalador (interactivo)

[`install.sh`](./install.sh) pregunta **que** instalar y **donde**, registra el
marketplace y avisa si vas a acabar con la misma skill cargada dos veces.

```bash
git clone https://github.com/MiguelAguiarDEV/skills && cd skills
./install.sh
```

Sin clonar nada:

```bash
curl -fsSL https://raw.githubusercontent.com/MiguelAguiarDEV/skills/main/install.sh | sh
```

Si prefieres no contestar preguntas, pasale las respuestas como flags:

```bash
./install.sh --all                        # todas (plugin toolkit)
./install.sh nudge how-to-chrome          # solo esas
./install.sh --all --scope project        # todas, para el equipo
./install.sh --list                       # que hay disponible
./install.sh --dry-run --all              # enseña los comandos sin ejecutarlos
```

| Flag | Para que |
|---|---|
| `-a, --all` | El plugin `toolkit`: las siete skills a la vez |
| `-l, --list` | Lista las skills y sale |
| `-s, --scope SCOPE` | `user` (por defecto), `project` o `local` |
| `-n, --dry-run` | Enseña los comandos sin ejecutarlos |
| `-f, --force` | Salta el aviso de skill duplicada |
| `--local [DIR]` | Usa un checkout local como marketplace (para desarrollar) |

Es `sh` POSIX: no necesita `jq` ni `python`.

### A mano

```bash
# 1. registrar el marketplace
claude plugin marketplace add MiguelAguiarDEV/skills

# 2a. todas de golpe
claude plugin install toolkit@miguelaguiardev-skills

# 2b. o solo las que quieras
claude plugin install nudge@miguelaguiardev-skills
claude plugin install how-to-chrome@miguelaguiardev-skills
```

Dentro de Claude Code son los mismos comandos con `/`:
`/plugin marketplace add ...`, `/plugin install ...`, o el menu `/plugin`.

### Donde se instala (scopes)

| Scope | Fichero | Quien lo ve |
|---|---|---|
| `user` (por defecto) | `~/.claude/settings.json` | Tu, en todos tus proyectos. Es el "global" |
| `project` | `.claude/settings.json` | Todo el que clone el proyecto (se commitea) |
| `local` | `.claude/settings.local.json` | Solo tu, solo en ese proyecto (gitignored) |

```bash
claude plugin install toolkit@miguelaguiardev-skills --scope project
```

> **No instales `toolkit` y un plugin individual a la vez.** Son la misma skill
> por dos caminos: se carga dos veces y, si tiene hook (`nudge`,
> `daily-journal`, `i-have-adhd`), el hook corre dos veces por prompt.
> `install.sh` te avisa; a mano no.

## Gestionar lo instalado

```bash
claude plugin list                                  # que tienes instalado
claude plugin details toolkit                       # skills, hooks y coste en tokens
claude plugin update toolkit@miguelaguiardev-skills # actualizar
claude plugin disable nudge                         # desactivar sin desinstalar
claude plugin enable nudge
claude plugin uninstall nudge@miguelaguiardev-skills
claude plugin marketplace update miguelaguiardev-skills   # refrescar el catalogo
```

Tras instalar o actualizar, reinicia la sesion para que carguen los hooks.

> Si `install` no encuentra un plugin nuevo, corre primero
> `marketplace update`: `marketplace add` no refresca un catalogo ya en disco.

## Hooks

Los hooks son del plugin, no de la skill: corren en toda sesion con el plugin
instalado, uses o no la skill.

| Evento | Que corre | De que skill |
|---|---|---|
| `UserPromptSubmit` | inyeccion de fecha/hora | `daily-journal` |
| `UserPromptSubmit` | `check_alerts.py` | `nudge` |
| `SessionStart` | `always-on.sh` | `i-have-adhd` |

`toolkit` trae los tres; cada plugin individual solo el suyo. Son inertes sin
usarse: la fecha son unos bytes, `check_alerts.py` no imprime nada sin
recordatorios y `always-on.sh` sale al instante salvo que exista
`~/.claude/.i-have-adhd-always`. Timeout de 5s, ninguno bloquea la sesion.

## Como funciona el repo

El contenido de cada skill vive **una sola vez**, en
`plugins/toolkit/skills/<skill>/`. Los plugins individuales no duplican nada:
su `skills/<skill>` es un symlink.

```
plugins/nudge/skills/nudge -> ../../toolkit/skills/nudge
```

Al instalar, un symlink que apunta a otro punto del mismo marketplace se
**dereferencia**: Claude Code copia los ficheros reales a su cache ([docs](https://code.claude.com/docs/en/plugins-reference#share-files-within-a-marketplace-with-symlinks)).
Apuntar fuera del plugin desde `plugin.json` (`"skills": ["../toolkit/..."]`)
**no** funciona, porque esos ficheros no se copian.

Lo unico duplicado de verdad es `hooks/hooks.json` y `NOTICE.md`, con
contenido distinto en cada plugin. Si cambias un hook, tocalo en los dos
sitios.

Dos avisos para quien clone el repo:

- **Windows** necesita Developer Mode o `git config core.symlinks true`.
- **`--plugin-dir` no vale** para los plugins individuales: en ese modo solo se
  conservan symlinks internos al propio plugin. Usa `plugins/toolkit`, que
  tiene los ficheros reales. Un marketplace por ruta local (`--local`) si
  funciona.

## Anadir una skill

La skill va siempre en `toolkit`, que es donde vive el contenido:

```bash
mkdir -p plugins/toolkit/skills/mi-skill
cp template/SKILL.md plugins/toolkit/skills/mi-skill/SKILL.md
$EDITOR plugins/toolkit/skills/mi-skill/SKILL.md   # frontmatter + instrucciones
```

Anade `scripts/` para ejecutables y `references/` para documentacion de
detalle que no necesita cargarse siempre. Con eso ya entra en `toolkit`: las
skills se autodescubren.

Para que ademas se instale suelta, dale su plugin individual:

```bash
mkdir -p plugins/mi-skill/.claude-plugin plugins/mi-skill/skills
ln -s ../../toolkit/skills/mi-skill plugins/mi-skill/skills/mi-skill
$EDITOR plugins/mi-skill/.claude-plugin/plugin.json
```

y su entrada en
[`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) con
`"source": "./plugins/mi-skill"`. Si trae hook, replica en
`plugins/mi-skill/hooks/hooks.json` solo su parte. Anade la skill a
`SKILL_LIST` en [`install.sh`](./install.sh). Comprueba con
`claude plugin validate plugins/mi-skill`.

Si viene de otro repo, anade su seccion a
[`plugins/toolkit/NOTICE.md`](./plugins/toolkit/NOTICE.md) y un `NOTICE.md`
corto en su plugin (ver [`plugins/nudge/NOTICE.md`](./plugins/nudge/NOTICE.md)).

> No crees `commands/` ni `agents/` con un `README.md` dentro a modo de
> recordatorio: Claude Code escanea esas carpetas y cargaria el README como
> una skill y un agente fantasma, sumando tokens a cada sesion.

## Licencia

[MIT](./LICENSE). Las skills portadas mantienen su atribucion original en
[`plugins/toolkit/NOTICE.md`](./plugins/toolkit/NOTICE.md).
