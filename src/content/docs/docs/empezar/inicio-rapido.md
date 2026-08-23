---
title: Inicio rápido
description: Configura contexxxt en un proyecto sin sobrescribir instrucciones existentes.
---

## Requisitos

- Node.js 22 o superior.
- Una carpeta específica. No uses `/` ni tu directorio personal completo.
- Git recomendado para revisar cada cambio.

## Ejecutar desde npm

No necesitas instalarlo globalmente:

```bash
npx contexxxt help
# o
pnpm dlx contexxxt help
```

## Adoptar un proyecto existente

```bash
npx contexxxt audit /ruta/al/proyecto
npx contexxxt init /ruta/al/proyecto
npx contexxxt doctor /ruta/al/proyecto
```

`audit` es solo lectura. `init` escribe dentro de `.contextos/`. Si encuentra `AGENTS.md` o `CLAUDE.md`, no los sustituye; coloca un adaptador propuesto en `.contextos/patches/`.

## Crear un espacio

```bash
npx contexxxt add-space producto --path /ruta/al/proyecto
```

Abre `.contextos/spaces/producto/SPACE.md` y completa:

- propósito;
- qué pertenece y qué no;
- sensibilidad;
- cuenta o entorno permitido;
- fuentes canónicas;
- fecha de revisión.

## Generar adaptadores

```bash
npx contexxxt sync /ruta/al/proyecto --provider codex
npx contexxxt sync /ruta/al/proyecto --provider claude-code
```

Para ChatGPT, Claude Chat o Cowork, usa `export`: la CLI produce bloques para revisar y copiar manualmente.

## Pedir la primera tarea

No necesitas una fórmula especial:

> Revisa el flujo de login. Encuentra por qué falla después de refrescar y déjalo verificado.

La skill debe resolver el espacio, revisar fuentes y aclarar únicamente si “verificado” o el alcance del cambio son materialmente ambiguos.

## Cerrar

Antes de terminar, pide:

> Haz checkpoint de esta tarea. Separa lo verificado, lo pendiente y cualquier decisión que deba sobrevivir a la sesión.

No marques completo lo que no fue verificado.
