---
title: Matriz de capacidades
description: Qué puede automatizar Context OS y qué requiere aplicación manual en cada superficie.
---

Revisado contra documentación oficial el 22 de agosto de 2026. Los productos cambian; `doctor` y esta matriz deben versionarse.

| Superficie | Instrucciones durables | Memoria | Automatización segura |
| --- | --- | --- | --- |
| Codex | `AGENTS.md` por alcance | local y separada de ChatGPT web | archivos, skill y agentes locales |
| ChatGPT | globales y por proyecto | memoria de cuenta/workspace | export manual para configuración |
| Claude Code | `CLAUDE.md`, reglas y skills | auto memory local | archivos, skill y agentes locales |
| Claude Chat | perfil y proyecto | memoria por experiencia/proyecto | export manual |
| Cowork | global, carpeta o proyecto | aislada por proyecto según superficie | carpeta preparada y export manual |

## Regla de portabilidad

El núcleo `.contextos/` es portable. La memoria nativa no lo es. Al migrar:

1. lleva el núcleo y proyectos;
2. audita la nueva superficie;
3. genera su adaptador;
4. importa solo memorias confirmadas y permitidas;
5. prueba descubrimiento en una sesión limpia.

## No asumir

- No hay jerarquía pública completa para resolver todo conflicto entre instrucciones, memoria y chat en productos conversacionales.
- Una skill local de Claude Code no aparece automáticamente en Cowork.
- La memoria de ChatGPT web no es la memoria local de Codex.
- `AGENTS.md` y `CLAUDE.md` son contexto, no controles duros de seguridad.
- La UI, los planes y las capacidades pueden estar en despliegue gradual.
