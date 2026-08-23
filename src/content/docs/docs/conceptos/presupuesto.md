---
title: Presupuesto de contexto
description: Reduce costo, ruido y latencia sin perder las decisiones necesarias.
---

El presupuesto de contexto no es solo tokens o dinero. También incluye atención, latencia y riesgo de recuperar el dato equivocado.

## Qué ocupa espacio

- instrucciones del sistema y del proyecto;
- catálogo de herramientas;
- memoria recuperada;
- historial de conversación;
- documentos y archivos;
- resultados de herramientas;
- mensaje actual y respuesta.

Las herramientas que nunca se usan también pueden tener costo si sus definiciones están siempre disponibles.

## Presupuesto por capas

### Precarga

Incluye solo identidad, autoridad, privacidad y reglas críticas. Deben ser cortas.

### Recuperación

Trae documentación, decisiones o fuentes estables cuando la tarea lo requiere.

### Estado

Mantén una síntesis estructurada de lo verificado, pendiente y bloqueado.

### Poda

Elimina resultados crudos viejos. Conserva su conclusión verificable y una referencia para recuperar el original.

## Regla de selección

No traigas un dato si:

- el modelo ya lo sabe y no es específico del proyecto;
- no cambia una decisión;
- pesa más de lo que aporta;
- ya está presente y vigente;
- proviene de una fuente sin autoridad suficiente.

## Caché no es contexto gratis

El caché puede reducir costo y latencia al reutilizar un prefijo estable, pero el contenido todavía ocupa ventana. Evita poner timestamps u otro contenido volátil en instrucciones cacheables.

## Señales de agotamiento

- respuestas cada vez más lentas;
- pérdida de reglas iniciales;
- repetición de intentos fallidos;
- recuperación de archivos irrelevantes;
- herramientas elegidas por nombre y no por necesidad;
- correcciones que no reemplazan la premisa vieja.

Al alcanzar un hito, crea un handoff, abre una sesión limpia y recupera solo las fuentes necesarias para la siguiente fase.
