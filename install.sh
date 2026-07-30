#!/usr/bin/env sh
# Installer for the miguelaguiardev-skills marketplace.
#
#   ./install.sh                      pick interactively
#   ./install.sh --all                every skill, via the `toolkit` plugin
#   ./install.sh nudge how-to-chrome  just those, as individual plugins
#   ./install.sh --list               show what is available
#
# Also works without cloning:
#   curl -fsSL https://raw.githubusercontent.com/MiguelAguiarDEV/skills/main/install.sh | sh -s -- --all
#
# Pure POSIX sh, no jq/python needed: it only wraps the `claude plugin` CLI.

set -eu

MARKETPLACE_NAME="miguelaguiardev-skills"
MARKETPLACE_SOURCE="MiguelAguiarDEV/skills"

# name|one-line description. Order is the order shown in the picker.
SKILL_LIST="how-to-chrome|Manejar tu Chrome real desde la terminal via CDP
grill-me|Interrogarte sobre un plan hasta que no queden ramas sin resolver
daily-journal|Diario de desarrollo conversacional, consciente de la hora
obsidian-vault|Convenciones para una carpeta de notas personal (Obsidian opcional)
nudge|Recordatorios por tiempo (parame a las 11, standup en 30m)
test-driven-development|Logic Gate + Iron Rule: TDD estricto donde hay logica
i-have-adhd|Estilo de salida para lector con ADHD: accion primero, sin relleno"

SCOPE="user"
DRY_RUN=0
FORCE=0
WANT_ALL=0
SOURCE_OVERRIDE=""
SELECTION=""

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

usage() {
  cat <<EOF
Instala las skills de $MARKETPLACE_SOURCE en Claude Code.

Uso:
  ./install.sh [opciones] [skill ...]

Sin argumentos abre un selector interactivo.

Opciones:
  -a, --all           Instala el plugin \`toolkit\` (todas las skills a la vez)
  -l, --list          Lista las skills disponibles y sale
  -s, --scope SCOPE   user (por defecto), project o local
  -n, --dry-run       Enseña los comandos sin ejecutarlos
      --local [DIR]   Usa un checkout local como marketplace en vez de GitHub
  -f, --force         Salta el aviso de conflicto toolkit/plugin individual
  -h, --help          Esta ayuda

Ejemplos:
  ./install.sh --all
  ./install.sh nudge how-to-chrome
  ./install.sh --scope project --all
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
  say "  ./install.sh nudge grill-me"
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
  say "instalados la skill se carga dos veces y, si tiene hook (nudge,"
  say "daily-journal, i-have-adhd), el hook corre dos veces por prompt."
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

# ---------------------------------------------------------------- main

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -l|--list) list_skills; exit 0 ;;
    -a|--all) WANT_ALL=1 ;;
    -n|--dry-run) DRY_RUN=1 ;;
    -f|--force) FORCE=1 ;;
    -s|--scope)
      [ $# -ge 2 ] || die "--scope necesita un valor (user, project o local)"
      SCOPE="$2"; shift
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

case "$SCOPE" in
  user|project|local) ;;
  *) die "scope no valido: $SCOPE (usa user, project o local)" ;;
esac

command -v claude >/dev/null 2>&1 \
  || die "no encuentro el comando \`claude\`. Instala Claude Code primero: https://code.claude.com"

if [ "$WANT_ALL" -eq 1 ]; then
  [ -z "$SELECTION" ] || die "--all/toolkit ya instala todas: no lo mezcles con skills sueltas."
  SELECTION="toolkit"
fi

SELECTION=$(printf '%s' "$SELECTION" | sed 's/^ *//')
[ -n "$SELECTION" ] || pick_interactive
SELECTION=$(printf '%s' "$SELECTION" | sed 's/^ *//')

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
