#!/usr/bin/env sh
# Installer for the miguelaguiardev-skills repository.
#
# Two ways in:
#
#   ./install.sh                     as Claude Code plugins, via the marketplace
#   ./install.sh --copy              by copying into ~/.claude (any agent harness)
#
# Examples:
#   ./install.sh                          pick interactively
#   ./install.sh --all                    every skill, via the `toolkit` plugin
#   ./install.sh grill-me how-to-chrome   just those, as individual plugins
#   ./install.sh --list                   show what is available
#   ./install.sh --copy --all             copy every skill into ~/.claude
#   ./install.sh --copy --as-plugin grill-me   copy it as a standalone plugin
#   ./install.sh --copy --uninstall       undo a --copy install
#
# Also works without cloning:
#   curl -fsSL https://raw.githubusercontent.com/MiguelAguiarDEV/skills/main/install.sh | sh -s -- --all
#
# The marketplace path is pure POSIX sh with no jq/python: it only wraps the
# `claude plugin` CLI. The --copy path needs python3 to merge hooks into
# settings.json, and a checkout (it clones one into a temp dir if needed).

set -eu

MARKETPLACE_NAME="miguelaguiardev-skills"
MARKETPLACE_SOURCE="MiguelAguiarDEV/skills"
REPO_URL="https://github.com/MiguelAguiarDEV/skills.git"

# name|one-line description. Order is the order shown in the picker.
# BEGIN GENERATED SKILL_LIST -- node build/build.mjs
SKILL_LIST="how-to-chrome|Manejar tu Chrome real desde la terminal via CDP
grill-me|Interrogarte sobre un plan hasta que no queden ramas sin resolver
daily-journal|Diario de desarrollo conversacional, consciente de la hora
obsidian-vault|Convenciones para una carpeta de notas personal (Obsidian opcional)
test-driven-development|Logic Gate + Iron Rule: TDD estricto donde hay logica
i-have-adhd|Estilo de salida para lector con ADHD: accion primero, sin relleno"
# END GENERATED SKILL_LIST

SCOPE="user"
SCOPE_SET=0
DRY_RUN=0
FORCE=0
WANT_ALL=0
SOURCE_OVERRIDE=""
SELECTION=""
MODE="marketplace"       # marketplace | copy
COPY_STYLE="config"      # config (vuelca en ~/.claude) | plugin (@skills-dir)
ACTION="install"         # install | uninstall
REPO_DIR=""
CLONED=""

# ---------------------------------------------------------------- helpers

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# Runs a command, or just prints it under --dry-run.
run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  [dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

skill_names() { printf '%s\n' "$SKILL_LIST" | cut -d'|' -f1; }

is_known_skill() {
  skill_names | grep -qx "$1"
}

config_dir() {
  printf '%s' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
}

cleanup() {
  [ -n "$CLONED" ] && [ -d "$CLONED" ] && rm -rf "$CLONED"
  return 0
}
trap cleanup EXIT INT TERM

usage() {
  cat <<EOF
Instala las skills de $MARKETPLACE_SOURCE.

Uso:
  ./install.sh [opciones] [skill ...]

Sin argumentos abre un selector interactivo.

Modo (por defecto: plugins de Claude Code via marketplace):
  -c, --copy          Copia en ~/.claude en vez de instalar plugins
      --as-plugin     Con --copy: copia cada plugin a ~/.claude/skills/<x>,
                      que carga como <x>@skills-dir sin tocar tu settings.json
  -u, --uninstall     Con --copy: deshace la copia (borra las skills y quita
                      sus hooks de settings.json)

Opciones:
  -a, --all           Todas las skills (plugin \`toolkit\` en modo marketplace)
  -l, --list          Lista las skills disponibles y sale
  -s, --scope SCOPE   user (por defecto), project o local. Solo marketplace
  -n, --dry-run       Enseña los comandos sin ejecutarlos
      --local [DIR]   Usa un checkout local como marketplace en vez de GitHub
  -f, --force         Salta el aviso de conflicto toolkit/plugin individual
  -h, --help          Esta ayuda

Ejemplos:
  ./install.sh --all
  ./install.sh grill-me how-to-chrome
  ./install.sh --scope project --all
  ./install.sh --copy --all
EOF
}

list_skills() {
  say "Skills disponibles en $MARKETPLACE_NAME:"
  say ""
  printf '  %-26s %s\n' "toolkit" "TODAS las de abajo, en un solo plugin"
  say ""
  printf '%s\n' "$SKILL_LIST" | while IFS='|' read -r name desc; do
    printf '  %-26s %s\n' "$name" "$desc"
  done
  say ""
  say "Instala todas con --all, o nombra las que quieras:"
  say "  ./install.sh grill-me how-to-chrome"
}

# Names of plugins from THIS marketplace that are currently installed.
installed_ours() {
  claude plugin list --json 2>/dev/null \
    | grep -o "\"id\"[[:space:]]*:[[:space:]]*\"[^\"]*@${MARKETPLACE_NAME}\"" \
    | sed 's/.*"\([^"]*\)@'"${MARKETPLACE_NAME}"'"/\1/' \
    || true
}

# True only if /dev/tty can actually be opened. `[ -r /dev/tty ]` is not
# enough: the node exists in plenty of non-interactive environments (CI,
# containers) but opening it fails with ENXIO because there is no controlling
# terminal, which would crash the script mid-prompt.
have_tty() { ( : < /dev/tty ) >/dev/null 2>&1; }

# Reads a line from the terminal even when the script itself arrived on stdin
# (curl | sh). Prints nothing and returns 1 if there is no terminal.
read_tty() {
  have_tty || return 1
  # shellcheck disable=SC2162
  read _reply < /dev/tty || return 1
  printf '%s' "$_reply"
  return 0
}

# --copy needs the actual files. When the script arrived through a pipe there
# is no checkout to copy from, so clone a shallow one into a temp dir.
ensure_checkout() {
  [ -n "$REPO_DIR" ] && return 0

  script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" 2>/dev/null && pwd) || script_dir=""
  if [ -n "$script_dir" ] && [ -d "$script_dir/skills" ] && [ -d "$script_dir/build" ]; then
    REPO_DIR="$script_dir"
    return 0
  fi

  command -v git >/dev/null 2>&1 || die "--copy sin checkout necesita git. Clona el repo y vuelve a intentarlo."
  CLONED=$(mktemp -d)
  say "Clonando $REPO_URL..."
  run git clone --depth 1 --quiet "$REPO_URL" "$CLONED"
  REPO_DIR="$CLONED"
}

# ---------------------------------------------------------------- picker

pick_interactive() {
  have_tty || die "sin argumentos hace falta un terminal. Usa --all o nombra skills (--help)."

  {
    say ""
    say "Que quieres instalar?"
    say ""
    printf '   0) %-26s %s\n' "toolkit" "TODAS, en un solo plugin"
    i=1
    printf '%s\n' "$SKILL_LIST" | while IFS='|' read -r name desc; do
      printf '  %2d) %-26s %s\n' "$i" "$name" "$desc"
      i=$((i + 1))
    done
    say ""
    say "Elige numeros separados por espacios (ej: 1 5), o Enter para 0."
    printf 'Seleccion: '
  } > /dev/tty

  choice=$(read_tty || true)
  [ -n "$choice" ] || choice="0"

  for tok in $choice; do
    case "$tok" in
      0) SELECTION="toolkit" ; return 0 ;;
      *[!0-9]*) die "seleccion no valida: $tok (usa numeros)" ;;
      *)
        name=$(printf '%s\n' "$SKILL_LIST" | sed -n "${tok}p" | cut -d'|' -f1)
        [ -n "$name" ] || die "no hay ninguna opcion numero $tok"
        SELECTION="$SELECTION $name"
        ;;
    esac
  done

  [ -n "$SELECTION" ] || die "no seleccionaste nada"
}

# Asked only when the picker ran and --scope was not given on the command line.
pick_scope() {
  have_tty || return 0

  {
    say ""
    say "Donde lo instalo?"
    say ""
    printf '   1) %-10s %s\n' "user" "para ti, en todos tus proyectos (por defecto)"
    printf '   2) %-10s %s\n' "project" "para todo el que clone este proyecto (.claude/settings.json)"
    printf '   3) %-10s %s\n' "local" "solo este proyecto y solo para ti (gitignored)"
    say ""
    printf 'Seleccion [1]: '
  } > /dev/tty

  ans=$(read_tty || true)
  case "$ans" in
    ""|1) SCOPE="user" ;;
    2)    SCOPE="project" ;;
    3)    SCOPE="local" ;;
    user|project|local) SCOPE="$ans" ;;
    *) die "seleccion no valida: $ans" ;;
  esac
}

# ---------------------------------------------------------------- conflicts

# toolkit and an individual plugin ship the SAME skill. Installing both loads
# it twice and, if it has a hook, runs the hook twice per prompt.
check_conflicts() {
  want="$1"
  have=$(installed_ours)
  [ -n "$have" ] || return 0

  clash=""
  case " $want " in
    *" toolkit "*)
      for p in $have; do
        [ "$p" = "toolkit" ] && continue
        clash="$clash $p"
      done
      ;;
    *)
      for p in $have; do
        [ "$p" = "toolkit" ] || continue
        clash="$clash toolkit"
      done
      ;;
  esac

  clash=$(printf '%s' "$clash" | sed 's/^ *//')
  [ -n "$clash" ] || return 0

  say ""
  say "AVISO: ya tienes instalado esto, que solapa con lo que vas a instalar:"
  for p in $clash; do say "  - $p"; done
  say ""
  say "toolkit y los plugins individuales traen LA MISMA skill. Con los dos"
  say "instalados la skill se carga dos veces y, si tiene hook"
  say "(daily-journal, i-have-adhd), el hook corre dos veces por prompt."
  say ""

  if [ "$FORCE" -eq 1 ]; then
    say "--force: sigo de todos modos."
    return 0
  fi

  if have_tty; then
    printf 'Desinstalo lo que solapa y sigo? [s/N] ' > /dev/tty
    ans=$(read_tty || true)
    case "$ans" in
      s|S|y|Y|si|Si|SI|yes)
        for p in $clash; do
          say "Desinstalando $p..."
          run claude plugin uninstall "${p}@${MARKETPLACE_NAME}"
        done
        return 0
        ;;
    esac
  fi

  say "Abortado. Desinstala primero:"
  for p in $clash; do say "  claude plugin uninstall ${p}@${MARKETPLACE_NAME}"; done
  say "o repite con --force si sabes lo que haces."
  exit 1
}

# ---------------------------------------------------------------- copy mode

# Dumps skills/, agents/, commands/ and output-styles/ into the config dir and
# merges the hooks of the selected skills into settings.json.
copy_into_config() {
  names="$1"
  dest=$(config_dir)

  say "Copiando en $dest ..."
  run mkdir -p "$dest/skills"

  hook_files=""
  for name in $names; do
    [ -d "$REPO_DIR/skills/$name" ] || die "no existe skills/$name en el checkout"
    run rm -rf "$dest/skills/$name"
    run cp -R "$REPO_DIR/skills/$name" "$dest/skills/$name"
    say "  skills/$name"

    if [ -d "$REPO_DIR/hooks/$name" ]; then
      run mkdir -p "$dest/hooks"
      run rm -rf "$dest/hooks/$name"
      run cp -R "$REPO_DIR/hooks/$name" "$dest/hooks/$name"
      say "  hooks/$name/"
    fi
    if [ -f "$REPO_DIR/hooks/$name.json" ]; then
      hook_files="$hook_files $REPO_DIR/hooks/$name.json"
    fi
  done

  # Loose components are not tied to a single skill, so they only travel with
  # a full install.
  if [ "$WANT_ALL" -eq 1 ]; then
    for dir in agents commands output-styles; do
      if [ -d "$REPO_DIR/$dir" ] && [ -n "$(ls -A "$REPO_DIR/$dir" 2>/dev/null)" ]; then
        run mkdir -p "$dest/$dir"
        run cp -R "$REPO_DIR/$dir/." "$dest/$dir/"
        say "  $dir/"
      fi
    done
  fi

  if [ -n "$hook_files" ]; then
    command -v python3 >/dev/null 2>&1 \
      || die "hace falta python3 para fusionar los hooks en settings.json (o usa --as-plugin)"
    say ""
    say "Fusionando hooks en $dest/settings.json ..."
    # shellcheck disable=SC2086
    run python3 "$REPO_DIR/build/merge-hooks.py" add "$dest/settings.json" $hook_files
  fi
}

# Copies the built plugin instead, which loads as <name>@skills-dir and keeps
# its hooks to itself. -L dereferences the symlinks in the build.
copy_as_plugin() {
  names="$1"
  dest=$(config_dir)

  say "Copiando plugins en $dest/skills ..."
  run mkdir -p "$dest/skills"
  for name in $names; do
    [ -d "$REPO_DIR/plugins/$name" ] || die "no existe plugins/$name en el checkout"
    run rm -rf "$dest/skills/$name"
    run cp -RL "$REPO_DIR/plugins/$name" "$dest/skills/$name"
    say "  $name -> carga como ${name}@skills-dir"
  done
}

uninstall_copy() {
  dest=$(config_dir)
  say "Deshaciendo la instalacion por copia en $dest ..."

  for name in $(skill_names) toolkit; do
    if [ -d "$dest/skills/$name" ]; then
      run rm -rf "$dest/skills/$name"
      say "  borrado skills/$name"
    fi
    if [ -d "$dest/hooks/$name" ]; then
      run rm -rf "$dest/hooks/$name"
      say "  borrado hooks/$name"
    fi
  done

  if [ -f "$dest/.miguelaguiardev-skills-hooks.json" ]; then
    command -v python3 >/dev/null 2>&1 \
      || die "hace falta python3 para quitar los hooks de settings.json"
    ensure_checkout
    run python3 "$REPO_DIR/build/merge-hooks.py" remove "$dest/settings.json"
  fi

  say ""
  say "Listo. Reinicia la sesion de Claude Code."
}

# ---------------------------------------------------------------- main

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -l|--list) list_skills; exit 0 ;;
    -a|--all) WANT_ALL=1 ;;
    -n|--dry-run) DRY_RUN=1 ;;
    -f|--force) FORCE=1 ;;
    -c|--copy) MODE="copy" ;;
    --as-plugin) COPY_STYLE="plugin" ;;
    -u|--uninstall) ACTION="uninstall" ;;
    -s|--scope)
      [ $# -ge 2 ] || die "--scope necesita un valor (user, project o local)"
      SCOPE="$2"; SCOPE_SET=1; shift
      ;;
    --local)
      # Optional dir argument; defaults to where this script lives.
      if [ $# -ge 2 ] && [ -d "$2" ]; then
        SOURCE_OVERRIDE="$2"; shift
      else
        SOURCE_OVERRIDE=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
      fi
      ;;
    -*) die "opcion desconocida: $1 (--help para la ayuda)" ;;
    *)
      if [ "$1" = "toolkit" ]; then
        WANT_ALL=1
      elif is_known_skill "$1"; then
        SELECTION="$SELECTION $1"
      else
        say "No conozco la skill \"$1\"." >&2
        say "" >&2
        list_skills >&2
        exit 1
      fi
      ;;
  esac
  shift
done

if [ "$ACTION" = "uninstall" ]; then
  [ "$MODE" = "copy" ] || die "--uninstall solo aplica a --copy. Para plugins usa: claude plugin uninstall <x>@$MARKETPLACE_NAME"
  uninstall_copy
  exit 0
fi

case "$SCOPE" in
  user|project|local) ;;
  *) die "scope no valido: $SCOPE (usa user, project o local)" ;;
esac

if [ "$WANT_ALL" -eq 1 ]; then
  [ -z "$SELECTION" ] || die "--all/toolkit ya instala todas: no lo mezcles con skills sueltas."
  SELECTION="toolkit"
fi

SELECTION=$(printf '%s' "$SELECTION" | sed 's/^ *//')
if [ -z "$SELECTION" ]; then
  pick_interactive
  # Interactive run: ask where too, unless --scope already answered it.
  if [ "$MODE" = "marketplace" ] && [ "$SCOPE_SET" -eq 0 ]; then
    pick_scope
  fi
fi
SELECTION=$(printf '%s' "$SELECTION" | sed 's/^ *//')
case " $SELECTION " in *" toolkit "*) WANT_ALL=1 ;; esac

# ------------------------------------------------------------ copy install

if [ "$MODE" = "copy" ]; then
  ensure_checkout
  say ""
  if [ "$COPY_STYLE" = "plugin" ]; then
    copy_as_plugin "$SELECTION"
  else
    # `toolkit` is a packaging concept; copying it means copying every skill.
    if [ "$WANT_ALL" -eq 1 ]; then
      names=$(skill_names | tr '\n' ' ')
    else
      names="$SELECTION"
    fi
    copy_into_config "$names"
  fi

  say ""
  if [ "$DRY_RUN" -eq 1 ]; then
    say "Dry run: no se ha tocado nada."
    exit 0
  fi
  say "Listo. Reinicia la sesion de Claude Code para que carguen los hooks."
  say "Para deshacerlo:  ./install.sh --copy --uninstall"
  exit 0
fi

# ----------------------------------------------------- marketplace install

command -v claude >/dev/null 2>&1 \
  || die "no encuentro el comando \`claude\`. Instala Claude Code primero: https://code.claude.com"

check_conflicts "$SELECTION"

source_to_add="${SOURCE_OVERRIDE:-$MARKETPLACE_SOURCE}"
say ""
if claude plugin marketplace list 2>/dev/null | grep -q "$MARKETPLACE_NAME"; then
  say "Marketplace ya registrado, actualizando catalogo..."
  run claude plugin marketplace update "$MARKETPLACE_NAME"
else
  say "Registrando marketplace ($source_to_add)..."
  run claude plugin marketplace add "$source_to_add" --scope "$SCOPE"
fi

say ""
for name in $SELECTION; do
  say "Instalando $name..."
  run claude plugin install "${name}@${MARKETPLACE_NAME}" --scope "$SCOPE"
done

say ""
if [ "$DRY_RUN" -eq 1 ]; then
  say "Dry run: no se ha tocado nada."
  exit 0
fi

say "Listo. Instalado: $SELECTION"
say ""
say "Reinicia la sesion de Claude Code para que carguen los hooks."
say "Comprueba con:  claude plugin list"
case " $SELECTION " in
  *" toolkit "*|*" i-have-adhd "*)
    say ""
    say "Nota: i-have-adhd no se auto-invoca. Escribe /i-have-adhd, o activalo"
    say "siempre con:  touch \"\${CLAUDE_CONFIG_DIR:-\$HOME/.claude}/.i-have-adhd-always\""
    ;;
esac
