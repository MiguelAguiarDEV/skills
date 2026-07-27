# skills

Skills personales para [Claude Code](https://code.claude.com) (y compatibles con
el estandar [Agent Skills](https://agentskills.io)), empaquetadas como plugins
independientes, cada uno con su propia carpeta y su propio manifiesto.

Cada plugin vive en `plugins/<nombre>/` con su
`.claude-plugin/plugin.json` (nombre, descripcion, version), su
`skills/<nombre>/` (`SKILL.md` + `scripts/` + `references/`), y el resto de
componentes reservados (`agents/`, `hooks/`, `commands/`, `monitors/`, `bin/`).
Cada plugin tiene su propio `source` en `marketplace.json`, asi que sus
subagentes/hooks/etc. nunca se mezclan con los de otro plugin. Ver
[`template/`](./template) para el punto de partida de una skill nueva.

## Plugins disponibles

| Plugin | Que hace |
|-------|----------|
| [`how-to-chrome`](./plugins/how-to-chrome) | Control Google Chrome from the terminal via CDP (Chrome DevTools Protocol): navigate, capture (incl. full page and responsive), read console/DOM, fill forms, export to PDF, annotate elements to paste into an AI, and group tabs into a dedicated Chrome tab group. No extension, no MCP, no npm dependencies. |
| [`grill-me`](./plugins/grill-me) | Interrogar al usuario sin descanso sobre un plan o diseno hasta alcanzar entendimiento compartido, resolviendo rama a rama del arbol de decision con una respuesta recomendada en cada pregunta. |

## Instalar en Claude Code

Registra este repositorio como marketplace de plugins:

```
/plugin marketplace add MiguelAguiarDEV/skills
```

Luego instala cada plugin que quieras (no hay instalacion "todo de golpe",
hay que instalar uno por uno):

```
/plugin install how-to-chrome@miguelaguiardev-skills
/plugin install grill-me@miguelaguiardev-skills
```

O instalalos desde el menu interactivo `/plugin` → `Browse and install
plugins` (tambien uno a la vez).

Una vez instalada, basta con mencionar la tarea ("abre esta web en Chrome y
haz una captura") para que Claude cargue la skill sola.

## Crear un plugin nuevo

```bash
mkdir -p plugins/mi-plugin/.claude-plugin plugins/mi-plugin/skills/mi-skill
cp template/SKILL.md plugins/mi-plugin/skills/mi-skill/SKILL.md
$EDITOR plugins/mi-plugin/skills/mi-skill/SKILL.md   # frontmatter (name, description) + instrucciones
```

Crea `plugins/mi-plugin/.claude-plugin/plugin.json`:

```json
{
  "name": "mi-plugin",
  "description": "...",
  "version": "1.0.0",
  "author": { "name": "..." }
}
```

Anade `scripts/` para herramientas ejecutables y `references/` para
documentacion de detalle (troubleshooting, decisiones de diseno) que no
necesita cargarse siempre. Registra el plugin en
[`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) con su
propio `source` (`./plugins/mi-plugin`), para que quede aislado de los demas
plugins del marketplace.

## Estructura de un plugin

Cada carpeta bajo `plugins/<nombre>/` sigue el mismo layout:

| Carpeta / archivo | Estado | Para que |
|---|---|---|
| `.claude-plugin/plugin.json` | En uso | Metadatos del plugin: nombre, descripcion, version |
| `skills/` | En uso | Skills (`SKILL.md` + `scripts/` + `references/`) |
| `agents/` | Placeholder | Definiciones de subagentes personalizados |
| `hooks/` | Placeholder | `hooks.json`, manejadores de eventos del ciclo de vida |
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

[MIT](./LICENSE).
