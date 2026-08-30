# Contrato de producto

## Definición

**contexxxt es un compilador adaptativo de contexto y comportamiento para agentes de software.**

Entra a un repositorio nuevo o existente, obtiene evidencia de forma progresiva, construye un modelo estructurado del proyecto y compila el contexto mínimo que un agente necesita para una tarea concreta. Después de la ejecución verifica el resultado y convierte observaciones en candidatos de conocimiento, reglas, procedimientos o skills únicamente cuando la evidencia y los evals justifican persistirlos.

La analogía técnica es deliberada:

```text
repository + evidence -> Project Model / IR -> compiled agent artifacts
```

El repositorio y sus fuentes autorizadas aportan evidencia. El Project Model es la representación intermedia, versionada y reconstruible. `AGENTS.md`, `CLAUDE.md`, referencias, context packets, validadores, handoffs, documentación y skills son salidas compiladas; no son bases de datos paralelas.

El Project Model no es un prompt. JSON es almacenamiento y la Query Layer determinista es lectura. Los agentes recuperan un índice compacto, hacen drill-down por ID y consultan evidencia cruda solo cuando la decisión lo requiere. **Contexxxt should not need to reread itself.**

## Problema

Los agentes fallan tanto por falta de contexto como por exceso de contexto. Las instrucciones se duplican, las decisiones pierden su causa, los documentos quedan desactualizados y una regla global termina aplicándose fuera de su scope. Agregar un megaprompt no resuelve autoridad, vigencia, contradicciones, cobertura ni relevancia por tarea.

contexxxt trata el contexto como un recurso finito. Su trabajo no es cargar todo: es seleccionar evidencia suficiente para resolver una tarea y mostrar qué sabe, qué infiere, qué desconoce y por qué.

## Tesis 7Q

Para cada tarea, el producto resuelve solo las dimensiones necesarias:

| Dimensión | Pregunta | Semántica operativa |
|---|---|---|
| WHAT | ¿Qué? | Estado, objetos, comportamiento, problema y cambio solicitado. |
| WHY | ¿Por qué? | Causalidad, decisiones, restricciones, historia y trade-offs relevantes. |
| HOW | ¿Cómo? | Arquitectura, mecanismos, procedimientos, comandos y dependencias. |
| FOR WHAT | ¿Para qué? | Propósito, resultado, invariantes y definición de terminado. |
| WHICH | ¿Cuál? | Alternativa aplicable, prioridad, estrategia o fuente que gobierna. |
| WHO | ¿Quién? | Actor, consumidor, propietario, autoridad y audiencia. |
| WHERE | ¿Dónde? | Scope: archivos, símbolos, módulos, servicios, entornos y superficies. |

El tiempo no es una octava dimensión. Vigencia, revisión, expiración, commit observado y supersesión son metadata transversal.

Las siete preguntas son un modelo de cobertura, no un cuestionario. El agente pregunta al humano únicamente cuando falta conocimiento que cambia materialmente la decisión y no puede obtenerse de evidencia, conocimiento vigente ni una inferencia segura y reversible.

## Usuarios

Los usuarios primarios son:

1. desarrolladores que delegan trabajo a Codex o Claude Code en repositorios reales;
2. equipos que necesitan conservar decisiones, constraints y procedimientos sin llenar cada sesión de contexto;
3. mantenedores de repositorios que quieren producir reglas y skills verificables desde evidencia del proyecto.

Chat personal, sincronización de memorias entre cuentas y organización de vida personal no forman parte de esta evolución.

## Unidad de valor

La unidad inmediata de valor es un **Context Packet verificable para una tarea**: pequeño, relevante, ligado a fuentes y revisión, con las dimensiones requeridas resueltas o señaladas explícitamente.

La unidad de valor acumulado es una especialización del proyecto —conocimiento, procedimiento, validador o skill— que demuestra mejorar resultados respecto de un baseline sin esa especialización.

No cuentan como valor por sí solos la cantidad de Markdown, claims, skills o contexto cargado, ni una respuesta convincente sin verificación.

## Qué significa entender un proyecto

contexxxt entiende un proyecto **para una tarea** cuando:

1. determinó qué dimensiones 7Q requiere esa tarea;
2. vinculó las conclusiones relevantes a evidencia y scope;
3. declaró cobertura, autoridad, confianza y vigencia;
4. resolvió conflictos bloqueantes o los hizo visibles;
5. compiló el contexto dentro del presupuesto definido;
6. puede explicar qué evidencia faltaría para elevar la certeza.

No significa indexar cada línea, conocer toda la historia ni afirmar que la ausencia en un índice demuestra inexistencia.

## Qué significa resolver una tarea

Una tarea está resuelta cuando el agente produce el resultado solicitado, respeta las restricciones aplicables, ejecuta las verificaciones acordes al riesgo y satisface una condición de cierre observable. Generar un Context Packet no completa la tarea; prepara y hace auditable su ejecución.

## Qué significa aprender

Aprender no es guardar el transcript ni convertir cada corrección en una regla. Es detectar una observación reutilizable, proponer un cambio acotado al Project Model o a un artefacto compilado, probarlo contra casos positivos y negativos y promoverlo solo si mejora el resultado sin introducir regresiones desproporcionadas.

Un aprendizaje permanece como candidato cuando todavía no tiene estabilidad, repetición, autoridad o evidencia de valor.

## Ciclo de una tarea

1. Recibir intención humana en lenguaje normal.
2. Clasificar tarea, riesgo, scope probable y dimensiones 7Q requeridas.
3. Consultar el Project Model mediante índices y resultados compactos; no cargarlo completo.
4. Recuperar evidencia adicional mediante inspección nativa y proveedores opcionales solo si hace falta.
5. Resolver, inferir, detectar conflicto o marcar desconocimiento.
6. Hacer como máximo una pregunta de alto valor si el conocimiento humano es imprescindible.
7. Compilar un Context Packet específico para el agente y la tarea.
8. Ejecutar mediante la superficie elegida.
9. Verificar con checks deterministas cuando sea práctico y evaluación cuando corresponda.
10. Registrar observaciones con provenance; evaluar candidatos sin promoverlos automáticamente.

## Inferencia, preguntas y autorización

### Puede inferir cuando

- la evidencia disponible converge;
- el scope y la autoridad son suficientes;
- la conclusión es reversible y de bajo riesgo;
- la suposición queda explícita en el packet o resultado;
- una verificación posterior puede detectar el error.

### Debe preguntar cuando

- dos interpretaciones de negocio válidas producen resultados materiales distintos;
- falta una preferencia o intención que el repositorio no puede contener;
- la autoridad de las fuentes es insuficiente para resolver una contradicción;
- la suposición sería difícil de revertir o invisible para el usuario.

### Debe pedir autorización cuando

La información puede estar completa y aun así faltar autoridad para actuar. Se conserva un gate humano para publicación, producción, dinero, secretos, borrado destructivo, migraciones irreversibles y acciones externas con consecuencias importantes.

Necesidad de información y necesidad de autorización son estados distintos.

## Persistencia

Puede persistirse:

- evidencia direccionable y su provenance;
- unidades de conocimiento con scope, autoridad, confianza y vigencia;
- decisiones y consecuencias ligadas al código que gobiernan;
- procedimientos estables y sus validadores;
- resultados de eval y observaciones de ejecución;
- candidatos de aprendizaje y su estado de promoción.

No debe persistirse por defecto:

- transcript completo o razonamiento exploratorio;
- secretos o datos personales ajenos al proyecto;
- salidas crudas sin utilidad demostrada;
- inferencias temporales como reglas globales;
- copias canónicas redundantes en varios formatos.

## Proyecto nuevo y proyecto existente

En un proyecto existente, el recorrido empieza con inspección read-only. contexxxt reconoce fuentes, instrucciones, arquitectura observable, CI, tests y convenciones antes de proponer integración. Los archivos del usuario se preservan y cualquier artefacto compilado es hash-aware y no-clobber.

En un proyecto nuevo, el modelo empieza escaso. contexxxt obtiene intención, restricciones y definición de terminado de los artefactos disponibles y del humano solo donde sea necesario. La ausencia de historia se representa como desconocimiento, no se rellena con invención.

## Proveedores estructurales

La inspección nativa es obligatoria y suficiente para operar: filesystem, Git, manifests, imports razonables, CI, tests, configs, schemas, documentación e instrucciones existentes.

Codebase Memory es un acelerador opcional. Cuando está disponible puede mejorar arquitectura, símbolos, callers, rutas, dependencias, impacto, data flow y búsqueda estructural. Cada conclusión conserva provider, revisión, cobertura y advertencias. El núcleo negocia capacidades y siempre puede volver al proveedor nativo.

## Generación de skills

Una skill es una salida especializada, no el almacén del proyecto. Solo se genera como candidata cuando existe conocimiento estable, un procedimiento repetido, beneficio de routing o especialización contextual y un eval que puede compararla contra baseline.

Una candidata puede contener `SKILL.md`, `references/`, `scripts/`, `assets/` y `evals/`. `SKILL.md` debe concentrarse en routing, workflow, contrato y referencias mediante progressive disclosure.

No se genera una skill cuando una regla corta, un validador, una referencia, documentación o el propio Context Packet resuelve el problema con menos costo y menor riesgo de drift.

## Lo que contexxxt no es

- un megaprompt;
- una memoria personal o universal;
- un wrapper genérico que oculta al agente;
- un segundo Codebase Memory;
- una dependencia de Rationale;
- un generador masivo de skills;
- una frontera de seguridad basada en Markdown;
- una afirmación de calidad sin baseline y evals.

## Invariantes

1. **Progressive disclosure:** ninguna tarea carga todo el modelo.
2. **Context is finite:** cada packet declara presupuesto y selección.
3. **Evidence before assertions:** una conclusión sin fuente se marca como inferencia o desconocida.
4. **Identifiable source of truth:** todo artefacto compilado declara origen y revisión.
5. **No silent overwrite:** archivos del usuario nunca se sustituyen silenciosamente.
6. **No duplicate canon:** Markdown y skills son proyecciones, no fuentes paralelas.
7. **Provider-neutral core:** Native funciona siempre; integraciones son opcionales.
8. **Models decide; deterministic systems verify:** parsing, hashes, schemas y checks son código cuando sea práctico.
9. **Human gates are exceptional:** preguntar por conocimiento y solicitar autorización no se confunden.
10. **No unjustified skill:** cada promoción necesita utilidad, scope y eval.
11. **Revision awareness:** vigencia y commit forman parte de cada conclusión material.
12. **Public neutrality:** perfiles, cuentas, auditorías privadas y secretos no entran al producto público.
13. **Self-reading through queries:** agentes y componentes prefieren `query/context/resolve` al JSON canónico; el full model solo se abre para debugging o auditoría.

## Estado del contrato

Este documento define el contrato del producto. La fuente local `0.2.0-rc.1` conserva la base segura 0.1 y ya implementa Project Model, Query Layer, inspección, builder, TaskResolution, ContextPacket, providers estructurales, observaciones/candidatos, síntesis de skills candidatas, evals conductuales, adapters Codex/Claude y migración explícita. `resolve` usa hoy un fallback local explícito o dimensiones decididas por el host; no interpreta todavía cuerpos de documentación como conocimiento semántico. Codebase Memory conserva cobertura parcial cuando no puede probar la revisión indexada. Una skill generada no se promociona sin mejora: el primer dogfood mantuvo la candidata sin promover porque no superó al ContextPacket. La frontera exacta está en [README.md](../README.md).
