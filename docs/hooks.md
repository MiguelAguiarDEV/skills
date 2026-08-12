# Hooks

Los hooks son del plugin, no de la skill: corren en toda sesion con el plugin
instalado, uses o no la skill.

| Evento | Que corre | De que skill | Fuente |
|---|---|---|---|
| `SessionStart` | `always-on.sh` | `i-have-adhd` | [`hooks/i-have-adhd.json`](../hooks/i-have-adhd.json) |

`toolkit` lo trae, igual que el plugin individual. El build compone el
`hooks/hooks.json` de cada plugin concatenando los fragmentos de las skills
que incluye, asi que **no hay nada que mantener sincronizado a mano**.

Es inerte sin usarse: `always-on.sh` sale al instante salvo que exista
`${CLAUDE_CONFIG_DIR:-~/.claude}/.i-have-adhd-always`. Timeout de 5s, no
bloquea la sesion.

## Rutas

Los comandos usan `${CLAUDE_PLUGIN_ROOT}`, que Claude Code sustituye por el
directorio del plugin instalado. En la instalacion por copia esa variable no
existe, asi que [`build/merge-hooks.py`](../build/merge-hooks.py) la reescribe a
`${CLAUDE_CONFIG_DIR:-$HOME/.claude}` al fusionar en `settings.json`. Como las
dos disposiciones tienen la misma forma, la parte de la ruta que va detras no
cambia.

`always-on.sh` no usa ninguna de las dos: resuelve `SKILL.md` relativo a `$0`
(`../../skills/i-have-adhd/SKILL.md`), que funciona igual en el plugin y en
`~/.claude`.

## Añadir un hook a una skill

Crea `hooks/<name>.json` con el formato de
[hooks de Claude Code](https://code.claude.com/docs/en/hooks) y corre
`node build/build.mjs`. Entra solo en su plugin y en `toolkit`. Si el hook
necesita scripts que la skill no usa por su cuenta, ponlos en `hooks/<name>/`.

## Al instalar por copia

`install.sh --copy` inserta los grupos de hooks en tu `settings.json`, deja un
`.bak` del anterior y anota lo insertado en
`~/.claude/.miguelaguiardev-skills-hooks.json`. `--copy --uninstall` quita
exactamente esos grupos y respeta los tuyos. Reinstalar no duplica nada.
