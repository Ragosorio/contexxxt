---
title: Adoptar un proyecto existente
description: Audita primero e integra contexxxt sin borrar instrucciones o decisiones previas.
---

Un proyecto existente ya tiene arquitectura de contexto, aunque nadie la haya llamado así: README, reglas, issues, código, decisiones, scripts, chats y conocimiento tácito. Adoptarlo empieza con descubrimiento de solo lectura.

## 1. Crea una línea base

```bash
npx contexxxt audit /ruta/al/proyecto --json > context-audit.json
```

La salida JSON no incluye valores de posibles secretos. Revisa:

- instrucciones globales y por directorio;
- skills y agentes existentes;
- archivos de estado o handoff;
- duplicación entre `AGENTS.md` y `CLAUDE.md`;
- documentos grandes o con revisión vencida;
- superficies locales que no deben publicarse;
- fronteras de cuenta o sensibilidad.

:::caution[Antes de compartir el reporte]
El JSON sí puede incluir la ruta absoluta de la raíz y nombres de archivos. Revísalo y sanitiza esos metadatos antes de publicarlo o enviarlo fuera de tu equipo.
:::

## 2. Clasifica autoridad

No todas las fuentes pesan igual. Separa:

- **aceptado:** decisión o contrato vigente;
- **propuesto:** idea todavía no aprobada;
- **histórico:** explica el pasado, no manda hoy;
- **generado:** derivado de otra fuente;
- **desconocido:** no puedes atribuirlo.

No conviertas el README en fuente canónica si el código y una ADR aceptada dicen otra cosa. Registra el conflicto.

## 3. Inicializa sin integrar a ciegas

```bash
npx contexxxt init /ruta/al/proyecto
```

La primera ejecución crea `.contextos/`. Si encuentra un adaptador existente, lo preserva y escribe una propuesta en `.contextos/patches/`.

## 4. Crea el primer proyecto

Completa `.contextos/projects/<id>/` con estado, fuentes, decisiones, preguntas y handoff. Empieza por lo que necesitas para la tarea actual; no documentes el universo.

## 5. Sincroniza una superficie

```bash
npx contexxxt sync /ruta/al/proyecto --provider codex --dry-run
npx contexxxt sync /ruta/al/proyecto --provider codex
```

Prueba un proveedor antes de generar todos. Si el archivo administrado cambió manualmente, `sync` produce un patch.

## 6. Verifica

```bash
npx contexxxt doctor /ruta/al/proyecto
```

Después prueba una tarea real en una sesión limpia y compara con tu línea base. Una compilación correcta no demuestra que el agente descubra las instrucciones adecuadas; inspecciona el paquete que leyó.
