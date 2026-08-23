---
title: Modelo mental en 10 minutos
description: Identidad, memoria, fuentes, estado y contexto de turno sin confundirlos.
---

Piensa en una reunión.

- La **ventana de contexto** es lo que está sobre la mesa ahora.
- La **atención** se reparte entre todo lo que pusiste sobre esa mesa.
- La **memoria** es un recordatorio destilado, no la grabación completa.
- La **compactación** conserva lo necesario para continuar y suelta los detalles recuperables.

## Cinco tipos de información

### Identidad

Define qué es el agente, qué puede decidir solo y qué requiere aprobación. No es una lista de adjetivos.

### Reglas obligatorias

Viven en instrucciones durables y versionadas. No dependen de que una memoria automática las recuerde.

### Conocimiento estable

Documentación grande que se recupera cuando una tarea la necesita. No debe ir completa en cada prompt.

### Estado

Qué se está haciendo, qué está verificado, qué falta y qué bloquea. Cambia con el proyecto y requiere checkpoints.

### Memoria curada

Preferencias o patrones que seguirán cambiando una recomendación futura. Incluye origen, confianza, fecha y revisión.

## El paquete de contexto

Antes de ejecutar, contexxxt intenta formar un paquete pequeño:

```yaml
space: producto
task: corregir flujo de pago
done_when:
  - cambio implementado
  - pruebas relevantes pasan
  - estado actualizado
sources:
  - AGENTS.md
  - .contextos/projects/checkout/STATE.md
  - .contextos/projects/checkout/DECISIONS.md
excluded:
  - resultados crudos antiguos
unknowns:
  - publicar o solo dejar local
```

## Una memoria no es una orden

Una memoria puede ser falsa, vieja o generada con demora. Por eso Context OS la trata como una pista. Una regla que siempre debe aplicarse vive en instrucciones o documentación del proyecto.

## Una corrección no borra el error

Agregar “eso estaba mal” deja en la ventana el error, la corrección y la discusión. Si un dato falso empezó a repetirse, abre una sesión limpia y reconstruye el paquete desde fuentes verificadas.
