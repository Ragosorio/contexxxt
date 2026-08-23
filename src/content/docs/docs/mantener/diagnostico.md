---
title: Diagnóstico de contexto
description: Identifica la falla antes de agregar más instrucciones o herramientas.
---

## Tabla de primera respuesta

| Síntoma | Diagnóstico probable | Primera acción |
| --- | --- | --- |
| inventa un dato y lo cita repetidamente | envenenamiento | sesión limpia con fuentes verificadas |
| repite variantes de una idea fallida | distracción | compactar y reiniciar |
| elige una herramienta irrelevante | confusión | podar catálogo y descripciones |
| cambia de regla entre turnos | choque | buscar instrucciones duplicadas |
| pierde una regla inicial | degradación normal | mover la regla a contexto durable y pequeño |

La tabla propone una hipótesis, no una certeza.

## Playbook

### 1. Congela el síntoma

Guarda la pregunta, respuesta, turno aproximado y configuración visible. No sigas agregando correcciones.

### 2. Clasifica

Pregunta:

- ¿hay un dato falso persistente?
- ¿solo olvidó o se contradijo?
- ¿repitió un intento descartado?
- ¿usó una herramienta distinta sin razón?
- ¿existen dos fuentes activas con reglas incompatibles?

### 3. Reconstruye el punto de origen

El error suele aparecer antes de la respuesta donde se volvió obvio. Busca el primer dato, resumen, resultado o instrucción que cambió la trayectoria.

### 4. Sesión limpia

Repite la tarea con el contexto mínimo verificado. Mantén modelo y configuración comparables. Si mejora, el contexto anterior fue un factor; todavía debes aislar qué pieza lo causó.

### 5. Aplica una mitigación

No combines cuatro arreglos si quieres aprender cuál funcionó. Prueba uno: nueva sesión, compaction, pruning, poda de herramientas o eliminación de una instrucción duplicada.

## Prompt de diagnóstico

```text
Algo salió mal, pero no quiero asumir la causa.

Revisa únicamente la evidencia visible de esta conversación y clasifica el caso
entre envenenamiento, distracción, confusión, choque o degradación normal.
Señala el primer turno que apoya tu hipótesis, una alternativa plausible y una
prueba limpia para distinguirlas. No modifiques memoria ni agregues reglas.
```

## Cuándo no corregir en la misma sesión

Si una premisa falsa se repite, una corrección añade otra copia del tema. Crea un handoff que excluya explícitamente el dato y reinicia desde fuentes canónicas.
