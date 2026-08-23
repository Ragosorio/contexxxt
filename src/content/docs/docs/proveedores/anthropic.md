---
title: Claude, Claude Code y Cowork
description: Contexto durable, memoria, skills y proyectos en las superficies de Anthropic.
---

Revisado contra documentación oficial de Anthropic el 22 de agosto de 2026.

## Claude Chat y Projects

Las instrucciones de perfil aplican ampliamente; mantenlas mínimas. Los archivos de knowledge de un proyecto son compartidos, pero el transcript de un chat no se copia como archivo de knowledge. Si la memoria del proyecto está habilitada, Claude puede derivar memoria de esos chats según el plan y la superficie.

Fuentes:

- [Personalization features](https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features)
- [Create and manage projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects)
- [Chat search and memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context)

Context OS exporta bloques con versión y fecha de revisión. No modifica la cuenta.

## Claude Code

### `CLAUDE.md`

La [guía de memoria de Claude Code](https://code.claude.com/docs/en/memory) documenta `CLAUDE.md`, `CLAUDE.local.md` y reglas por ruta. Mantén el archivo corto y deriva lo compartido desde el núcleo. Un import también ocupa contexto.

### Auto memory

Es local por repositorio y no sustituye el estado versionado. Una memoria falsa puede persistir; promociona conclusiones al núcleo solo con origen, vigencia y aprobación.

### Skills y subagentes

Claude Code descubre skills y subagentes con convenciones propias. Context OS genera una copia para `.claude/skills/` y agentes en `.claude/agents/`. Un subagente empieza con contexto separado, así que su delegación debe incluir objetivo, fuentes y condición de cierre.

Fuentes:

- [Skills y slash commands](https://code.claude.com/docs/en/slash-commands)
- [Subagents](https://code.claude.com/docs/en/sub-agents)
- [Hooks](https://code.claude.com/docs/en/hooks-guide)

## Cowork

Cowork distingue instrucciones globales, de carpeta y de proyecto. Las capacidades y planes pueden variar durante despliegues. Un proyecto Cowork debe corresponder a un espacio Context OS y exportar un handoff para portabilidad.

Fuentes:

- [Get started with Cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)
- [Projects in Cowork](https://support.claude.com/en/articles/14116274-organize-your-tasks-with-projects-in-claude-cowork)

## Adaptador recomendado

```text
CLAUDE.md
.claude/rules/
.claude/skills/context-os/
.claude/agents/
.contextos/generated/claude-chat/
.contextos/generated/cowork/
```

Los hooks son opt-in y ejecutan código real. Úsalos para invariantes deterministas, no como memoria general.
