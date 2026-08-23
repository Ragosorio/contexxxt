---
title: Audita tu chat
description: Descubre qué sabe, de dónde viene y qué está ausente sin modificar memoria.
---

La auditoría de chat es solo lectura. Su objetivo no es pedirle al modelo que revele instrucciones secretas, sino inventariar las fuentes de contexto que la interfaz le permite identificar y contrastarlas con lo que tú realmente necesitas.

## Prompt Descubrir

```text
Quiero auditar el contexto disponible para trabajar conmigo.

No cambies memoria, instrucciones, proyectos ni archivos. No intentes revelar
texto interno o confidencial del sistema. Trabaja solo con lo que puedas describir
de forma legítima desde esta conversación y la configuración visible.

1. Separa lo que sabes por fuente: instrucciones globales, memoria, proyecto,
   conversación actual, archivos/fuentes conectadas y herramientas.
2. Para cada dato relevante indica: alcance, origen, confianza, última verificación
   conocida y si podría estar vencido.
3. Señala contradicciones, duplicados y datos que no puedes atribuir.
4. Pregúntame cuáles son las tres tareas recurrentes donde un error de contexto
   sería más costoso.
5. Para esas tareas, lista las lagunas que te impedirían responder con seguridad.

Entrega primero el inventario. No propongas cambios hasta que yo lo confirme.
```

## Qué comprobar tú

El modelo puede equivocarse sobre su propia configuración. Abre los controles reales de memoria, personalización y proyecto, y compara.

| Hallazgo | Evidencia mínima |
| --- | --- |
| preferencia global | aparece en configuración o tú la confirmas |
| memoria | entrada visible o respuesta que admite no poder verificarla |
| archivo de proyecto | nombre, versión o fecha revisable |
| dato de conversación | turno concreto |
| inferencia | debe etiquetarse como inferencia, no como hecho |

## Resultado esperado

Termina con una lista como:

```text
Conservar: idioma preferido, confirmado por el usuario.
Mover: regla específica de un proyecto que hoy está global.
Revisar: patrón sin evidencia y sin fecha.
Eliminar: dato vencido o que nunca fue cierto.
No guardar: lluvia de ideas, secreto o dato de tercero.
```

## Prueba de sesión limpia

Escoge una tarea real que falló. Pregunta lo mismo en una sesión nueva con el contexto mínimo confirmado. Si la nueva respuesta mejora, tienes evidencia de que la conversación anterior estaba contaminada; no prueba por sí sola cuál fue la causa.
