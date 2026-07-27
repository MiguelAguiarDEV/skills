# skills

Skills personales para [Claude Code](https://code.claude.com) (y compatibles con
el estandar [Agent Skills](https://agentskills.io)), empaquetadas en un unico
plugin (`toolkit`) para que instalarlas todas sea un solo comando.

El plugin vive en `plugins/toolkit/` con su `.claude-plugin/plugin.json`
(nombre, descripcion, version), su carpeta `skills/` (una subcarpeta por
skill, cada una con `SKILL.md` + `scripts/` + `references/`), y el resto de
componentes reservados (`agents/`, `hooks/`, `commands/`, `monitors/`, `bin/`),
compartidos por todas las skills del plugin. Ver [`template/`](./template)
para el punto de partida de una skill nueva.

## Skills incluidas en `toolkit`

| Skill | Que hace |
|-------|----------|
| [`how-to-chrome`](./plugins/toolkit/skills/how-to-chrome) | Control Google Chrome from the terminal via CDP (Chrome DevTools Protocol): navigate, capture (incl. full page and responsive), read console/DOM, fill forms, export to PDF, annotate elements to paste into an AI, and group tabs into a dedicated Chrome tab group. No extension, no MCP, no npm dependencies. |
| [`grill-me`](./plugins/toolkit/skills/grill-me) | Interrogar al usuario sin descanso sobre un plan o diseno hasta alcanzar entendimiento compartido, resolviendo rama a rama del arbol de decision con una respuesta recomendada en cada pregunta. |

## Instalar en Claude Code

Registra este repositorio como marketplace de plugins:

```
/plugin marketplace add MiguelAguiarDEV/skills
```

Instala el plugin (trae todas las skills de golpe, en un solo comando):

```
/plugin install toolkit@miguelaguiardev-skills
```

O instalalo desde el menu interactivo `/plugin` → `Browse and install plugins`.

Una vez instalado, basta con mencionar la tarea ("abre esta web en Chrome y
haz una captura", "grill me este plan") para que Claude cargue la skill
correspondiente sola.

> **Si ya tenias este marketplace anadido de antes** (por ejemplo de cuando
> `how-to-chrome` y `grill-me` eran plugins separados) y `install` te dice
> `Plugin "toolkit" not found`: `marketplace add` no refresca el catalogo si
> ya estaba en disco. Corre `/plugin marketplace update MiguelAguiarDEV/skills`
> primero y reintenta el `install`.

## Anadir una skill nueva a `toolkit`

```bash
mkdir -p plugins/toolkit/skills/mi-skill
cp template/SKILL.md plugins/toolkit/skills/mi-skill/SKILL.md
$EDITOR plugins/toolkit/skills/mi-skill/SKILL.md   # frontmatter (name, description) + instrucciones
```

Anade `scripts/` para herramientas ejecutables y `references/` para
documentacion de detalle (troubleshooting, decisiones de diseno) que no
necesita cargarse siempre. Registra la ruta nueva en el array `"skills"` de
la entrada `toolkit` en
[`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json). Con
esto, todo el mundo que ya tenga `toolkit` instalado la recibe en la proxima
`/plugin marketplace update`.

### Si una skill nueva necesita agentes/hooks propios y aislados

Los `agents/`/`hooks/`/etc. de `plugins/toolkit/` son compartidos por todas
las skills del bundle (es el precio de la instalacion en un solo comando). Si
una skill nueva necesita sus propios agentes o hooks sin mezclarse con los
del resto, dale su propio plugin en vez de anadirla a `toolkit`:

```bash
mkdir -p plugins/mi-plugin/.claude-plugin plugins/mi-plugin/skills/mi-skill
```

y una entrada propia en `marketplace.json` con `"source": "./plugins/mi-plugin"`
(en vez de anadirla a la lista de skills de `toolkit`). Esa skill se instala
aparte, con su propio `/plugin install mi-plugin@miguelaguiardev-skills`.

## Estructura del plugin `toolkit`

| Carpeta / archivo | Estado | Para que |
|---|---|---|
| `.claude-plugin/plugin.json` | En uso | Metadatos del plugin: nombre, descripcion, version |
| `skills/` | En uso | Una subcarpeta por skill (`SKILL.md` + `scripts/` + `references/`) |
| `agents/` | Placeholder | Definiciones de subagentes personalizados, compartidos por todas las skills |
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
