# Working on this repository

This repo is shaped like an agent config directory (`~/.claude`, `~/.codex`,
`.agents`): the sources at the root are what you edit, and `plugins/` plus
`.claude-plugin/marketplace.json` are a **generated build**.

## Layout

| Path | What it is |
|---|---|
| `skills/<name>/SKILL.md` | Source. [Agent Skills](https://agentskills.io) format, portable to any harness |
| `hooks/<name>.json` | Source. Hook config for the skill of the same name |
| `hooks/<name>/` | Source. Scripts used *only* by that skill's hook |
| `notices/<slug>.md` | Source. Third-party attribution for a ported upstream |
| `build/plugins.json` | Source. The catalog: which plugins exist and their metadata |
| `build/build.mjs` | The generator |
| `plugins/**` | **Generated. Do not edit.** |
| `.claude-plugin/marketplace.json` | **Generated. Do not edit.** |
| `NOTICE.md` | **Generated** from `notices/` |
| `install.sh` | Hand-written, except the block between the `GENERATED SKILL_LIST` markers |

## The one rule

After changing anything under `skills/`, `hooks/`, `notices/` or
`build/plugins.json`, run:

```bash
node build/build.mjs
```

CI runs `node build/build.mjs --check` and fails if the build is out of date or
if someone edited it by hand.

## Adding a skill

```bash
mkdir -p skills/my-skill
cp templates/skill/SKILL.md skills/my-skill/SKILL.md
$EDITOR skills/my-skill/SKILL.md
```

Then add an entry to `build/plugins.json` (with a `tagline`, which is what the
installer's picker shows) and run the build. If the skill needs a hook, add
`hooks/my-skill.json`; it is wired into both its own plugin and `toolkit`
automatically.

If the skill is ported from somewhere else, add `notices/<upstream>.md` and
list the skill under that slug in the `notices` map of `build/plugins.json`.

## Constraints the build enforces

- `name` in the frontmatter must match the directory name, be lowercase
  alphanumeric with single hyphens, and be 64 chars or less.
- `description` is required and capped at 1024 characters. It is the only thing
  an agent sees before deciding to load the skill, so it must say *what* the
  skill does and *when* to use it.
- `compatibility` is capped at 500 characters. Only add it when the skill has
  real environment requirements.
- `metadata` values must be strings, not nested maps.
- `SKILL.md` over 500 lines gets a warning: move detail into `references/`.

## Paths inside hooks

Hook commands use `${CLAUDE_PLUGIN_ROOT}`. Both installed layouts have the same
shape (`<root>/skills/<name>/`, `<root>/hooks/<name>/`), so the same relative
paths resolve whether the root is an installed plugin or `~/.claude`. The
copy installer rewrites `${CLAUDE_PLUGIN_ROOT}` to
`${CLAUDE_CONFIG_DIR:-$HOME/.claude}` when it merges hooks into `settings.json`.

## Do not

- Edit anything under `plugins/`. It gets overwritten.
- Create empty `agents/`, `commands/` or `output-styles/` folders inside a
  plugin with a placeholder README: Claude Code scans them and would load the
  README as a phantom skill or agent, costing tokens every session.
- Put a `CLAUDE.md` inside a plugin expecting it to load. Plugins contribute
  context through skills, agents and hooks only.
