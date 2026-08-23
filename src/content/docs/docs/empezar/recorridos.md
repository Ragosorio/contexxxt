---
title: Elige tu recorrido
description: Empieza con chat, un proyecto existente o un proyecto nuevo.
---

No necesitas implementar todo Context OS de una vez. Escoge la puerta que corresponde a lo que tienes hoy.

## Solo chat

Úsalo cuando trabajas principalmente en ChatGPT o Claude Chat y todavía no quieres descargar nada.

1. Ejecuta la [auditoría guiada](/docs/chat/auditoria/).
2. Diseña espacios que no mezclen objetivos ni información sensible.
3. Revisa memoria e instrucciones.
4. Aplica cada cambio exacto manualmente.

Resultado: un mapa de fuentes, una lista de cambios y bloques listos para copiar.

## Proyecto existente

Úsalo cuando ya existe un repositorio, carpeta, `AGENTS.md`, `CLAUDE.md`, documentación o historia de decisiones.

```bash
pnpm context-os audit /ruta/al/proyecto
pnpm context-os init /ruta/al/proyecto
```

El orden es importante. La auditoría debe ocurrir antes de escribir integración. Si el proyecto ya tiene instrucciones, `init` las conserva y crea una propuesta.

## Proyecto nuevo

Úsalo para una carpeta vacía o una iniciativa que aún no tiene decisiones durables.

```bash
pnpm context-os init mi-proyecto
pnpm context-os add-space producto --path mi-proyecto
```

Empieza con un espacio. Agrega otro solo cuando cambien el objetivo, la sensibilidad, la cuenta o las fuentes canónicas.

## Migrar de computadora o proveedor

Lleva el núcleo `.contextos/` con el proyecto. Mantén el perfil personal en una ruta privada externa y regenera adaptadores con `sync`. No copies memorias locales de un proveedor como si fueran la fuente de verdad.

## Regla para decidir

| Si la tarea… | Empieza con… |
| --- | --- |
| termina en un solo chat y no comparte fuentes | chat sin proyecto |
| continuará o produce varios resultados | proyecto/espacio |
| ya tiene historia o instrucciones | auditoría de proyecto existente |
| depende de datos personales transversales | perfil privado opcional |
