---
title: Skill y agentes
description: Un router pequeño y especialistas con contexto limpio para trabajo recurrente.
---

## La skill-router

`context-os` es una única puerta de entrada. Su descripción debe permitir activación implícita con frases normales: “audita mi contexto”, “continúa este proyecto”, “qué debería recordar” o simplemente una tarea dentro de una instancia.

El cuerpo no contiene todos los playbooks. Decide cuál cargar:

| Intención | Playbook |
| --- | --- |
| configurar | bootstrap |
| revisar fuentes o drift | audit |
| entender una falla | diagnose |
| abrir/cerrar sesión | session |
| proponer memoria | memory |
| cuestionar una decisión | critical-review |

Esta divulgación progresiva evita pagar el costo del manual completo en cada turno.

## Agentes opcionales

### Context auditor

Inventaria fuentes, duplicados, vigencia y autoridad. Es de solo lectura salvo que se le pida producir un informe.

### Memory curator

Separa observación, evidencia, inferencia y texto propuesto. Nunca persiste sin aprobación.

### Critical reviewer

Evalúa una decisión contra evidencia y una rúbrica. Busca el mejor caso contrario, no una redacción complaciente.

### Handoff builder

Devuelve una transferencia compacta: objetivo, estado verificado, decisiones, fuentes, bloqueos y próximo paso.

## Cuándo usar un subagente

Úsalo cuando una tarea independiente se beneficie de ventana limpia: explorar un código grande, comparar documentación, ejecutar pruebas o revisar una decisión. No lo uses para una operación simple ni permitas que dos agentes editen el mismo archivo en paralelo.

## Portabilidad

Codex y Claude Code descubren skills y subagentes de forma distinta. Context OS genera copias desde una fuente canónica. Cowork o productos cloud pueden requerir instalación separada; una skill local no implica disponibilidad allí.
