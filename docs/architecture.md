# Como esta montado el repo

La raiz se lee como una carpeta de configuracion de agente. Lo que hay debajo
de `plugins/` y `.claude-plugin/` es un build generado desde ella.

```
skills/<name>/          SKILL.md + scripts/ + references/ + assets/
hooks/<name>.json       config de hook de esa skill
hooks/<name>/           scripts que SOLO usa ese hook
notices/<slug>.md       atribucion de un upstream
build/plugins.json      el catalogo: que plugins existen
build/build.mjs         el generador
build/merge-hooks.py    fusiona hooks en settings.json (instalacion por copia)
----------------------------------------------------------------------------
plugins/<name>/         GENERADO: manifiesto + symlinks + hooks.json compuesto
.claude-plugin/marketplace.json   GENERADO
NOTICE.md               GENERADO desde notices/
install.sh              a mano, salvo el bloque SKILL_LIST entre marcadores
```

`node build/build.mjs` escribe el build; `--check` lo verifica sin escribir y
es lo que corre CI.

## Por que el contenido no se duplica

Cada `plugins/<x>/skills/<y>` es un symlink a `../../../skills/<y>`. Claude Code
dereferencia los symlinks que apuntan a otro punto del mismo marketplace: copia
los ficheros reales a su cache al instalar
([docs](https://code.claude.com/docs/en/plugins-reference#share-files-within-a-marketplace-with-symlinks)).
Asi que en git hay una sola copia de cada skill, y quien instala recibe
ficheros de verdad. Lo mismo aplica a `LICENSE` y a `hooks/<name>/`.

Los unicos ficheros reales del build son los manifiestos, los `hooks.json`
compuestos y los `NOTICE.md`, y los tres se generan.

## Decisiones

**El build se commitea.** `claude plugin marketplace add MiguelAguiarDEV/skills`
clona la rama por defecto y lee `.claude-plugin/marketplace.json` de ahi. Con el
build en una rama aparte haria falta un `--ref` que nadie recuerda. El coste es
que hay que regenerar antes de commitear, y CI lo comprueba.

**No hay `settings.json` en la raiz.** Seria ambiguo: ni es fuente (los hooks
viven troceados en `hooks/`) ni se puede volcar encima del tuyo. Es la unica
desviacion consciente respecto a un `~/.claude` literal.

**No se usa `metadata.pluginRoot`** en el marketplace, aunque permitiria escribir
`"source": "nudge"` en vez de `"source": "./plugins/nudge"`. La forma explicita
es la que esta probada aqui y ahorra nueve caracteres a cambio de un riesgo.

**El fichero de hook se llama como la skill.** Eso es lo que le dice al build a
que plugin pertenece cada hook, sin un mapa aparte. Un `hooks/foo.json` sin
`skills/foo/` es un error de build.

**Los scripts compartidos viven con la skill.** `check_alerts.py` lo llama el
hook, pero comparte base SQLite con `add_alert.py` y `ack_alert.py`, que los
llama la skill. Separarlos por quien los invoca los alejaria sin motivo, asi que
los tres estan en `skills/nudge/scripts/` y el hook apunta ahi.
`hooks/<name>/` es solo para scripts que no pertenecen a ninguna skill, como
`always-on.sh`.

## Las dos rutas de instalacion tienen la misma forma

```
<plugin instalado>/skills/<name>/    ~/.claude/skills/<name>/
<plugin instalado>/hooks/<name>/     ~/.claude/hooks/<name>/
```

Por eso un hook puede resolver rutas relativas (`../../skills/...`) y funcionar
en los dos sitios, y por eso el instalador por copia solo tiene que reescribir
`${CLAUDE_PLUGIN_ROOT}` por `${CLAUDE_CONFIG_DIR:-$HOME/.claude}`.

## Que valida el build

De la [spec Agent Skills](https://agentskills.io/specification): `name` igual al
directorio y en kebab-case, `description` de 1 a 1024 caracteres,
`compatibility` hasta 500, `metadata` con valores string, aviso si `SKILL.md`
pasa de 500 lineas. Ademas: que cada hook corresponda a una skill existente, que
cada notice apunte a un fichero real, y que no queden ficheros huerfanos dentro
de `plugins/`.

Encima de eso, `claude plugin validate <dir> --strict` comprueba los manifiestos
generados. CI corre las dos cosas.
