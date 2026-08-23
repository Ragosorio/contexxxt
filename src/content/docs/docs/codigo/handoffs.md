---
title: Handoffs y checkpoints
description: Continúa en otra sesión sin llevar el transcript completo.
---

## Checkpoint

Un checkpoint actualiza el estado durante el trabajo. Debe registrar:

- objetivo actual;
- alcance;
- evidencia verificada;
- cambios realizados;
- pruebas y resultados;
- decisiones aceptadas;
- bloqueos;
- próximo paso.

No copies logs completos, diffs o respuestas de herramientas si una referencia permite recuperarlos.

## Handoff

Un handoff permite que otra sesión o persona continúe sin leer lo anterior.

```markdown
# Handoff

## Objetivo
...

## Estado verificado
- ...

## Decisiones y motivo
- ...

## Fuentes que deben abrirse
- `ruta`: por qué importa

## Intentos descartados
- intento: evidencia de por qué no funcionó

## Bloqueos y preguntas
- ...

## Próximo paso exacto
1. ...
```

## Proceso de compactación

1. Captura todo lo que podría cambiar la continuación.
2. Marca qué es hecho, inferencia o decisión.
3. Conserva rutas y comandos para recuperar evidencia.
4. Elimina conversación social y resultados crudos recuperables.
5. Prueba el handoff en una sesión limpia.
6. Añade al template cualquier dato que se perdió.

## Completo no significa escrito

Un item se marca completo después de verificarlo. Distingue gates:

- implementación local;
- lint/typecheck/build;
- pruebas;
- publicación remota;
- despliegue;
- smoke en producción.

Pasar uno no prueba los siguientes.
