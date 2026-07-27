# skills

Skills personales para [Claude Code](https://code.claude.com) (y compatibles con
el estandar [Agent Skills](https://agentskills.io)): carpetas autocontenidas de
instrucciones, scripts y referencias que Claude carga dinamicamente para tareas
concretas.

Cada skill vive en `skills/<nombre>/` con su `SKILL.md` (frontmatter + instrucciones),
sus `scripts/` (herramientas ejecutables) y sus `references/` (documentacion de
detalle que Claude solo lee cuando hace falta, para no inflar el contexto por
defecto). Ver [`template/`](./template) para el punto de partida de una skill nueva.

## Skills disponibles

| Skill | Que hace |
|-------|----------|
| [`how-to-chrome`](./skills/how-to-chrome) | Control Google Chrome from the terminal via CDP (Chrome DevTools Protocol): navigate, capture (incl. full page and responsive), read console/DOM, fill forms, export to PDF, annotate elements to paste into an AI, and group tabs into a dedicated Chrome tab group. No extension, no MCP, no npm dependencies. |
| [`grill-me`](./skills/grill-me) | Interrogar al usuario sin descanso sobre un plan o diseno hasta alcanzar entendimiento compartido, resolviendo rama a rama del arbol de decision con una respuesta recomendada en cada pregunta. |

## Instalar en Claude Code

Registra este repositorio como marketplace de plugins:

```
/plugin marketplace add MiguelAguiarDEV/skills
```

Luego instala una skill concreta:

```
/plugin install how-to-chrome@miguelaguiardev-skills
```

O instala todo el marketplace desde el menu `Browse and install plugins`.

Una vez instalada, basta con mencionar la tarea ("abre esta web en Chrome y
haz una captura") para que Claude cargue la skill sola.

## Crear una skill nueva

```bash
mkdir -p skills/mi-skill
cp template/SKILL.md skills/mi-skill/SKILL.md
$EDITOR skills/mi-skill/SKILL.md   # frontmatter (name, description) + instrucciones
```

Anade `scripts/` para herramientas ejecutables y `references/` para
documentacion de detalle (troubleshooting, decisiones de diseno) que no necesita
cargarse siempre. Registra la skill como plugin en
[`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) para que
sea instalable individualmente.

## Licencia

[MIT](./LICENSE).
