# Changelog

Formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Las versiones son las de los plugins; el marketplace lleva la suya en
`build/plugins.json`.

## [Sin publicar]

### Removed

- **Se elimina la skill `nudge`** y todo lo suyo: `skills/nudge/` con sus tres
  scripts, `hooks/nudge.json` y el plugin `nudge`. El marketplace declara
  `renames: { "nudge": null }`, asi que Claude Code retira el plugin de quien
  lo tenga instalado en vez de dejarlo apuntando a una entrada inexistente.
  Su base de datos (`${CLAUDE_CONFIG_DIR:-~/.claude}/nudge/alerts.db`) es tuya
  y no la toca nadie: borrala a mano si no la quieres.
- `toolkit` 2.1.0 → 3.0.0 (una skill menos), marketplace 3.0.0 → 3.1.0.

### Changed

- **El repo se reorganiza como una carpeta de configuracion de agente.** Las
  skills viven en `skills/<name>/` en la raiz, en formato Agent Skills puro y
  portable a cualquier harness; los hooks en `hooks/<name>.json`. `plugins/` y
  `.claude-plugin/marketplace.json` pasan a ser un build generado por
  `node build/build.mjs` desde `build/plugins.json`.
- Los `hooks/hooks.json` de cada plugin se componen automaticamente a partir de
  los fragmentos por skill. Antes estaban duplicados a mano entre `toolkit` y
  cada plugin individual.
- Los `NOTICE.md` se generan desde `notices/<upstream>.md`, y el `NOTICE.md`
  completo pasa a estar en la raiz (antes en `plugins/toolkit/`).
- `always-on.sh` se muda a `hooks/i-have-adhd/` y resuelve `SKILL.md` con
  `../../skills/...`, que funciona igual en un plugin instalado y en `~/.claude`.
- `toolkit` 2.0.0 → 2.1.0; el resto de plugins 1.0.0 → 1.1.0.

### Added

- `install.sh --copy`: instala volcando `skills/`, `agents/`, `commands/` y
  `output-styles/` en `${CLAUDE_CONFIG_DIR:-~/.claude}` y fusionando los hooks
  en `settings.json` (con backup y registro de lo insertado).
  `--copy --uninstall` lo deshace sin tocar tus propios hooks.
- `install.sh --copy --as-plugin`: copia el plugin construido a
  `~/.claude/skills/<x>`, que carga como `<x>@skills-dir` sin marketplace.
- `install.sh` clona el repo en un directorio temporal cuando `--copy` se usa
  a traves de `curl | sh`, donde no hay checkout del que copiar.
- Validacion de la spec Agent Skills en el build (nombre, limites de longitud,
  `metadata` plano) y CI que corre `build --check` mas
  `claude plugin validate --strict`.
- `$schema` en los manifiestos, y `license`, `homepage`, `repository`,
  `keywords`, `displayName` y `category` en el catalogo.
- `AGENTS.md` (con `CLAUDE.md` apuntando a el) y `docs/`.

### Fixed

- La `description` de `how-to-chrome` medía ~1036 caracteres, por encima del
  limite de 1024 de la spec.
- El `metadata` de `i-have-adhd` era un mapa anidado; la spec solo admite
  valores string.

### Added (skills)

- `compatibility` en `how-to-chrome` (Chrome + Node) y `daily-journal`
  (python3).

## [2.0.0]

- `toolkit` con las siete skills, mas un plugin individual por skill.
- Portadas `daily-journal`, `obsidian-vault`, `nudge`,
  `test-driven-development` (ravila4/claude-adhd-skills) e `i-have-adhd`
  (ayghri/i-have-adhd).
- `install.sh` interactivo con seleccion de skills y scope.
