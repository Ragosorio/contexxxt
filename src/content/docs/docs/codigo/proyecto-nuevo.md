---
title: Iniciar un proyecto nuevo
description: Crea el mínimo contexto durable antes de acumular historial.
---

Un proyecto nuevo necesita muy poco contexto para empezar bien.

## Crear

```bash
pnpm context-os init mi-proyecto
cd mi-proyecto
pnpm context-os add-space producto --path mi-proyecto
```

## Completar el núcleo

### Identidad

Cinco líneas bastan:

```text
Eres [qué es] para [quién], dentro de [dominio].
Decides solo: [decisiones reversibles].
Nunca decides solo: [publicar, borrar o comprometer recursos].
Cuando el límite no sea claro, pregunta.
Si detectas una premisa equivocada, señálala antes de ejecutar.
```

### Privacidad

Define datos prohibidos, superficies permitidas, retención y qué requiere confirmación. Una instrucción del agente no reemplaza permisos del sistema.

### Memoria

Empieza vacía. No inventes cinco patrones para llenar una plantilla. Promueve uno cuando existan observaciones y el usuario apruebe el texto.

## Crear el primer proyecto de trabajo

```text
.contextos/projects/app/
├── PROJECT.md
├── STATE.md
├── SOURCES.md
├── DECISIONS.md
├── OPEN_QUESTIONS.md
└── HANDOFF.md
```

`STATE.md` debe describir el presente. `DECISIONS.md` conserva por qué se aceptó algo. `HANDOFF.md` es una transferencia, no otro historial infinito.

## Primera tarea

Pide un resultado real. No pruebes el sistema con una conversación artificialmente abstracta. Al cerrar, verifica que el checkpoint actualiza estado sin guardar el transcript.

## Cuándo añadir más

- otra skill: cuando exista un workflow recurrente distinto;
- otro agente: cuando una tarea necesite contexto limpio o un rol especializado;
- otra herramienta: cuando un dato sea volátil, grande o externo;
- otro espacio: cuando cambien propósito, cuenta, sensibilidad o autoridad.
