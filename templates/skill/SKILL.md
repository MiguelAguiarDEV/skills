---
name: template-skill
description: Sustituye por una descripcion clara de que hace la skill y cuando debe usarse. Es lo unico que el agente ve antes de decidir si la carga, asi que incluye las palabras que apareceran en la peticion del usuario. Maximo 1024 caracteres.
# Opcionales:
# compatibility: Requiere python3 y acceso a internet.   (max 500 caracteres)
# license: MIT (ported from owner/repo, see ../../NOTICE.md)
# metadata:
#   category: productivity        (solo valores string, sin mapas anidados)
---

# Nombre de la skill

[Instrucciones que el agente seguira cuando esta skill este activa.]

## Ejemplos
- Ejemplo de uso 1
- Ejemplo de uso 2

## Requisitos y dependencias
- [Lista lo que hace falta instalar/configurar antes de usarla]

## scripts/ (opcional)
Scripts ejecutables que la skill invoca. Documentar su uso aqui, no volcar el
codigo en el propio SKILL.md.

## references/ (opcional)
Documentacion de detalle (troubleshooting, decisiones de diseno, specs) que el
agente carga solo cuando hace falta, para no inflar el contexto por defecto.
Manten SKILL.md por debajo de 500 lineas.

## assets/ (opcional)
Plantillas, imagenes y ficheros de datos que la skill usa tal cual.

---

Al terminar: anade la skill a `build/plugins.json` y corre `node build/build.mjs`.
Si necesita un hook, creale `hooks/<name>.json` en la raiz del repo.
