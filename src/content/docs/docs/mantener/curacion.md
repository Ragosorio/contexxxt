---
title: Curación y caducidad
description: Mantén fuentes, estado y memoria sin acumular versiones incompatibles.
---

## Ritmos recomendados

| Superficie | Evento o frecuencia | Acción |
| --- | --- | --- |
| `STATE.md` | cierre de sesión o hito | reemplazar estado actual |
| `HANDOFF.md` | cambio de sesión/persona | reconstruir desde evidencia |
| fuentes volátiles | antes de una decisión | verificar y fechar |
| decisiones | cuando se aceptan o sustituyen | registrar motivo y supersede |
| memoria personal | mensual | conservar, revisar, expirar o rechazar |
| instrucciones globales | trimestral o tras una falla | quitar reglas sin caso real |
| herramientas/skills | mensual | retirar las no usadas o solapadas |

Adapta el ritmo al riesgo. Una cifra financiera o regla legal requiere verificación en el momento de uso.

## Recency real

Agregar una versión nueva no mata la vieja. Usa estado explícito:

```yaml
status: superseded
superseded_by: decision-2026-08-22-b
effective_until: 2026-08-21
```

La recuperación debe excluir por defecto entradas `expired`, `rejected` o `superseded`.

## Poda de herramientas

Cuenta herramientas disponibles y usadas en sesiones representativas. Elimina definiciones que nunca cambian una decisión, combina herramientas solapadas y mejora descripciones ambiguas.

## Poda de resultados

Conserva:

- conclusión verificable;
- timestamp;
- consulta o comando para repetir;
- referencia al artefacto.

Elimina del contexto activo el volcado completo cuando ya no se usa.

## Mantenimiento de instrucciones

Por cada restricción pregunta: “¿qué falla reproducible evita?”. Si no existe, conviértela en preferencia flexible o elimínala. Busca parejas que se solapen incluso si no usan las mismas palabras.

## Doctor no repara a escondidas

`doctor` detecta drift, caducidad y contradicciones. La reparación es una acción separada y revisable. Esto evita que una auditoría cambie el sistema que pretendía medir.
