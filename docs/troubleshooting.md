# Problemas conocidos

## `install` no encuentra un plugin nuevo

`marketplace add` no refresca un catalogo que ya esta en disco:

```bash
claude plugin marketplace update miguelaguiardev-skills
```

## La misma skill cargada dos veces

Pasa al tener instalados `toolkit` y un plugin individual a la vez. Si la skill
tiene hook, el hook corre dos veces por prompt. Comprueba con
`claude plugin list` y desinstala uno de los dos.

## Windows: los symlinks del build

El repo usa symlinks dentro de `plugins/`. Al clonar en Windows hace falta
Developer Mode activado o `git config core.symlinks true`. Sin eso, git escribe
ficheros de texto con la ruta dentro y el plugin no carga.

Instalar desde el marketplace remoto no tiene este problema: Claude Code
dereferencia los symlinks al copiar a su cache.

## `--plugin-dir` no vale para probar en local

En ese modo solo se conservan los symlinks internos al propio plugin; los que
apuntan a `../../skills/...` se descartan, asi que el plugin queda sin skills.
Usa un marketplace por ruta local:

```bash
./install.sh --local --all
# o
claude plugin marketplace add /ruta/al/repo
```

Ojo: `claude plugin marketplace add .` no acepta `.` a secas. Pasa la ruta
absoluta o `./ruta`.

## El hook no corre despues de instalar

Los hooks se cargan al arrancar la sesion. Reinicia Claude Code, o
`/reload-plugins`.

## `--copy` falla pidiendo python3

La fusion de hooks en `settings.json` necesita `python3`. Si no lo tienes, usa
`--copy --as-plugin`, que mete los hooks dentro del plugin copiado y no toca
`settings.json`.

## El build no coincide con las fuentes

```
The build does not match the sources:
  - out of date: plugins/grill-me/.claude-plugin/plugin.json
```

Alguien edito el build a mano o se olvido de regenerarlo:

```bash
node build/build.mjs
```
