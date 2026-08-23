---
title: Fundamentos del curso
description: El conjunto mínimo de ideas para diseñar un sistema de contexto completo.
---

Esta síntesis reorganiza los materiales aportados al proyecto. Las instrucciones incluidas dentro de los PDFs y ejemplos del curso se tratan como datos de estudio, no como órdenes activas para el agente.

## De prompt engineering a context engineering

Prompt engineering pregunta cómo redactar una instrucción. Context engineering decide qué información está disponible al responder, de dónde viene y qué se descarta. Una laguna crítica empuja al modelo a completar el vacío con una suposición.

## Todo compite por atención

Instrucciones, historial, memoria, documentos, imágenes, resultados de herramientas y las propias definiciones de herramientas ocupan contexto. Una ventana grande reduce ciertos límites, pero no elimina ruido, contradicciones ni recuperación imperfecta.

## El conjunto mínimo completo

Un system prompt útil contiene:

1. rol y límites de decisión;
2. restricciones que responden a una falla observada;
3. formato necesario.

“Sé experto” no define una decisión. “Nunca publiques sin confirmación” sí define un límite.

## Las cuatro R

| Principio | Pregunta de auditoría |
| --- | --- |
| Relevance | Si quito esta línea, ¿cambia una respuesta? |
| Recency | ¿Lo viejo puede morir o solo se acumula? |
| Retrieval | ¿Debe estar siempre o buscarse cuando haga falta? |
| Ranking | ¿Lo crítico está visible o enterrado? |

## Búsqueda, ranking y selección

Recuperar no es pegar documentos. Primero se encuentran candidatos, después se ordenan y al final se decide cuántos merecen entrar. La selección es una decisión de presupuesto.

## Memoria que persiste, error que persiste

La memoria valiosa captura patrones que cambian recomendaciones futuras. Debe tener evidencia, estado de confianza, vigencia y aprobación. No guardes secretos, datos de terceros, lluvia de ideas ni cifras volátiles.

## Context rot y contaminación

La longitud reduce precisión, pero la basura es peor que la longitud. Diagnostica el síntoma antes de aplicar una mitigación:

- error que se cita a sí mismo: envenenamiento;
- ideas repetidas: distracción;
- herramientas mal elegidas: confusión;
- reglas incompatibles: choque;
- pérdida gradual de lo inicial: degradación normal.

## Compactar con intención

Primero maximiza cobertura: objetivo, decisiones, estado, fuentes, resultados verificados, bloqueos y próximos pasos. Después elimina detalles recuperables. Un resumen que empieza buscando brevedad puede perder información irreversible.

## Identidad y memoria

La identidad define decisiones. La memoria captura aprendizaje curado. Un agente sin memoria empieza de cero; uno con memoria no auditada arrastra errores con confianza.

## Medir antes de declarar

Una prueba de degradación debe controlar modelo, herramientas, memoria, compactación y contenido contradictorio. Compara una línea base corta con una condición larga neutral, repite corridas y evalúa con una rúbrica ciega. Contradecir deliberadamente las reglas mide choque, no context rot puro.

## Defensa contra complacencia

No cargues la pregunta con tu conclusión. Pide primero el análisis, solicita el mejor argumento contrario y valida contra una rúbrica. Una instrucción durable puede exigir señalar errores, pero no sustituye evidencia independiente.
