---
title: ChatGPT y Codex
description: Dónde poner instrucciones, memoria, proyectos y skills en las superficies de OpenAI.
---

Esta página sigue la [documentación oficial de OpenAI](https://learn.chatgpt.com/docs) revisada el 22 de agosto de 2026.

## ChatGPT

### Instrucciones globales

Úsalas para preferencias realmente transversales: idioma, estilo y límites universales. No incluyas decisiones de un proyecto, cifras volátiles ni contexto de trabajo dentro de una cuenta personal.

La guía [Personalize ChatGPT](https://learn.chatgpt.com/docs/personalize) separa instrucciones personalizadas de memoria y recomienda mantener reglas obligatorias en instrucciones o documentación durable.

### Projects

Un proyecto agrupa chats, instrucciones, archivos y fuentes. La guía [Projects and chats](https://learn.chatgpt.com/docs/projects) recomienda un chat separado por resultado distinto mientras el proyecto conserva el contexto compartido.

Context OS exporta:

- instrucciones de proyecto;
- inventario de fuentes;
- prompt de primera sesión;
- checklist de memoria.

La aplicación es manual: la CLI no edita tu cuenta.

### Memoria

La [documentación de Memories](https://learn.chatgpt.com/docs/customization/memories) distingue la memoria web de la memoria local de Codex. Trátala como recall. Audita antes de compartir una configuración y nunca guardes secretos.

## Codex

### `AGENTS.md`

Codex compone instrucciones desde el ámbito global hasta el directorio de trabajo. Archivos más cercanos aparecen después. La guía oficial de [`AGENTS.md`](https://learn.chatgpt.com/docs/agent-configuration/agents-md) documenta un límite combinado predeterminado de 32 KiB.

Context OS genera un root `AGENTS.md` corto. Usa archivos anidados solo para diferencias reales de un subárbol.

### Skills

Las [skills](https://learn.chatgpt.com/docs/build-skills) cargan progresivamente: nombre y descripción primero; `SKILL.md` completo al activarse. Por eso Context OS usa un router con una descripción clara y playbooks bajo demanda.

### Memoria local

La memoria local vive bajo el home de Codex y está separada de ChatGPT web. Las reglas requeridas se mantienen en el repositorio. Context OS puede auditar esa memoria, pero no editarla a escondidas.

## Adaptador recomendado

```text
AGENTS.md
.agents/skills/context-os/
.codex/agents/
.contextos/generated/chatgpt/
```

No instales Context OS solo en una carpeta secundaria esperando que Codex descubra su configuración. Inicia Codex desde la raíz primaria del proyecto.
