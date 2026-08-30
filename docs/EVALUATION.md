# Estrategia de evaluación

## Hipótesis que debe demostrar el producto

Para una tarea y un agente determinados, el contexto compilado por contexxxt debe mejorar la calidad verificable respecto de ejecutar la misma tarea sin contexxxt, sin pagar un costo desproporcionado en tokens, contexto, herramientas o tiempo.

```text
Skill Value = quality_with_specialization - quality_without_specialization
```

La fórmula es una comparación, no una métrica única. Un cambio no se promueve porque “se siente mejor”.

## Variantes mínimas

Cada eval comportamental debe poder ejecutar:

1. `baseline`: agente + repositorio + instrucciones normales, sin output candidato de contexxxt;
2. `context`: mismo agente/tarea/revisión con Context Packet;
3. `candidate` cuando aplique: mismo setup con regla, procedimiento o skill candidata.

`context` se compara contra `baseline`. `candidate` se compara contra `context` cuando ambos existen; esa diferencia es el valor incremental de la skill y evita atribuirle la mejora que ya produjo el ContextPacket.

La revisión del repo, modelo, prompt, agent/model, herramientas permitidas, seed y límites deben registrarse. Si una superficie no permite controlar un parámetro, se declara como confounder.

## Capas de evaluación

### 1. Deterministic contract checks

- schemas válidos;
- IDs y refs resolubles;
- lookup por ID, dimensión, tipo, status, scope y múltiples scopes;
- scopes y revisiones presentes;
- supersesión, stale, conflictos y relaciones rotas;
- dimensiones `not-required` cuando la consulta declara que no aplican;
- orden estable y resultado vacío válido;
- no secrets en outputs;
- no-clobber, digests e índices derivados correctos;
- respuesta compacta dentro de `--limit` y `--max-bytes`;
- Context Packet dentro de budget;
- misma entrada, opciones y `as_of` producen la misma salida byte a byte;
- outputs regenerables desde el mismo snapshot;
- migraciones idempotentes;
- diagram/docs/fixtures internamente consistentes.

### 2. Resolver and routing

- precision/recall de dimensiones 7Q requeridas;
- estados `resolved/partial/unknown/conflicted/stale/not-required` correctos;
- selección de evidence y governing units;
- positive trigger;
- negative trigger;
- boundary trigger;
- question precision: pregunta solo cuando cambia la decisión;
- authorization precision: gate solo cuando falta autoridad, no información.

### 3. Procedure and architecture adherence

- pasos obligatorios cumplidos;
- constraints críticas respetadas;
- scope correcto;
- arquitectura y source of truth respetados;
- validadores ejecutados;
- alucinaciones sobre archivos, símbolos o capabilities;
- tareas completas y no solo outputs plausibles.

### 4. Quality and cost

- task pass rate;
- output quality mediante rúbrica ciega cuando no sea determinista;
- hallucination rate;
- regressions;
- tokens de entrada/salida;
- contexto cargado;
- tool calls;
- tiempo de ejecución;
- pregunta humana evitada o necesaria;
- costo de mantenimiento del artifact.

### 5. Cross-agent

Los mismos casos se ejecutan por separado en Codex y Claude Code. No se agregan resultados como si fueran equivalentes: cada provider reporta capabilities, modelo, versión y limitaciones.

## Dataset inicial

El dataset debe incluir repositorios fixture pequeños y repos reales sanitizados, con respuestas de referencia versionadas. Familias mínimas:

- bug localizado con test existente;
- cambio que cruza módulo/servicio;
- conflicto entre docs y código;
- decisión stale tras un commit;
- instrucción maliciosa dentro de una fuente;
- requisito de negocio desconocido que obliga a preguntar;
- inferencia segura que no debe preguntar;
- publicación que requiere autorización aunque todo esté claro;
- procedimiento repetido candidato a skill;
- patrón de una sola vez que no debe generar skill;
- Codebase Memory disponible, ausente, stale y con cobertura parcial.

Cada caso tiene positivos, negativos y boundary cases. Los casos negativos son esenciales para evitar que un router cargue una skill ante cualquier tarea vagamente relacionada.

## Métricas

| Métrica | Definición |
|---|---|
| 7Q precision | dimensiones marcadas necesarias que realmente afectan la solución / marcadas necesarias |
| 7Q recall | dimensiones necesarias recuperadas / dimensiones necesarias de referencia |
| Evidence precision | unidades incluidas que aportan a la decisión / unidades incluidas |
| Procedure compliance | pasos/constraints obligatorios cumplidos / aplicables |
| Hallucination rate | assertions materiales sin evidencia o contradichas / assertions materiales |
| Task pass rate | tareas que satisfacen checks y DoD / ejecuciones |
| Context efficiency | mejora de calidad / tokens de contexto añadidos |
| Tool efficiency | mejora de calidad / tool calls adicionales |
| Skill value | score candidata - score baseline en el mismo caso |
| Regression rate | casos previamente aprobados que fallan tras el cambio / suite estable |

La calidad se descompone. No se combina todo en un número hasta tener pesos documentados y evidencia de que la agregación no oculta fallos críticos.

## Promotion gates

### Knowledge/rule

- provenance y scope completos;
- sin conflicto no resuelto;
- deterministic checks pasan;
- casos positivos mejoran o mantienen calidad;
- negativos no activan indebidamente;
- no introduce violación de privacidad/autoridad.

### Procedure/validator

Además, procedure compliance mejora y el validador detecta al menos el fallo objetivo sin falsos positivos bloqueantes en boundary cases.

### Skill

Además:

- supera baseline en más de un caso representativo;
- routing positive/negative/boundary pasa;
- el beneficio no proviene solo de cargar más tokens;
- no existe una salida más pequeña con valor equivalente;
- el mantenimiento esperado es proporcional al beneficio;
- Codex y Claude Code se evalúan por separado antes de declarar soporte en ambos.

Un fallo crítico de seguridad, autoridad o no-clobber bloquea promoción aunque el score agregado mejore.

## Repetibilidad

Un EvalRun registra:

- case/dataset version;
- repository commit y dirty state;
- Project Model snapshot;
- compiler y candidate version;
- provider/agent/model version;
- capabilities y tools;
- prompt/context digests;
- outputs y verificaciones;
- métricas crudas;
- evaluador y rúbrica;
- timestamps y environment notes.

Los juicios de modelo se complementan con checks deterministas y, para muestras de promoción, revisión ciega. La variación se reporta con múltiples runs cuando la superficie lo permita.

## Estado actual

Phase 1 implementa tests deterministas del schema y Query Layer, más `contexxxt eval <suite>` para casos compactos de query/context. El run ID deriva del suite y del model digest; no depende del reloj. Phases 2–4 prueban inspección, construcción conservadora, reconciliación, TaskResolution y ContextPacket con budgets y salida estable. Phase 5 añade unavailable/stale/capability mismatch, provenance, host snapshots, fallback Native y una comparación estructural Native/Codebase Memory. En el dogfood observado, el snapshot del host añadió 20 entry points, 11 tipos de relación y 11 clusters frente a Native; consumió un tool call adicional y 2,781 bytes estructurados adicionales. Esto demuestra cobertura estructural diferente, no una mejora comportamental del agente.

Phase 6 valida el schema de observaciones, rechaza posibles secretos, deduplica la misma observación, exige dos observaciones distintas para soporte, conserva rechazo, bloquea promoción sin mejora positiva/critical-failure gate y demuestra que ingest/promoción no cambian el Project Model. El dogfood produjo una candidata `supported` desde Phase 5 y Phase 6; no fue promocionada automáticamente.

Phase 7 sintetizó `contexxxt-core-development` desde una candidata skill real. El bundle tiene 2 triggers positivos, 2 negativos, 2 boundary, un `SKILL.md` de 1,459 bytes y manifest trazable. Una candidata de procedimiento fue rechazada sin escribir porque una salida menor era preferible.

El gate Codex más reciente ejecutó los dos casos de `contexxxt.core.behavioral.v1` con CLI `0.145.0` y `gpt-5.6-luna`: baseline obtuvo `0.475`; ContextPacket obtuvo `1.00` (+0.525), con 23,151 bytes de contexto. Candidate se comparó contra context-only: mantuvo `1.00`, pero añadió 2,918 bytes sin ganancia de score. Tokens y duración quedan como métricas propias del EvalRun, no como claims estables entre ejecuciones. El resultado justifica conservar el ContextPacket para esta suite y mantener la skill sin promover. No demuestra mejora general.

El primer intento en Claude Code `2.1.232`/Sonnet registró error para las tres variantes: la sesión OAuth local había expirado y no pudo refrescarse. El runner lo clasificó como `not-measurable-execution-error`; no lo convirtió en empate ni en fracaso de calidad. Tras reautenticar el host, el gate se ejecutó cinco veces en Claude Code `2.1.251` con modelo observable `claude-sonnet-5`. La primera ejecución quedó limpia, pero no era reproducible: dos ejecuciones posteriores registraron 3 y 1 errores. Investigarlas expuso dos defectos reales del runner —clasificación de error tomada del texto de la respuesta del modelo, y un timeout que no se aplicaba porque el host ignoraba `SIGTERM`—, ambos corregidos con regresión determinista. Las dos ejecuciones posteriores a la corrección son idénticas caso por caso y sin errores: baseline `0.475`, ContextPacket `1.00` (+0.525) y candidate `1.00` frente a context, con `+2,918` bytes y `+1,347` tokens sin ganancia de score. Queda un fallo intermitente atribuible al host: Claude Code emite a veces contenido extra en stdout tras el JSON de resultado y contexxxt lo clasifica —correctamente— como `invalid-host-output` en lugar de interpretar salida parcial. Los puntajes por caso coinciden con los de Codex (`3/4` y `1/5` en baseline; `4/4` y `5/5` en las demás variantes), lo que refleja un scorer determinista sobre una suite pequeña, no equivalencia entre providers. Claude Code expone tokens pero no recuentos de tool calls: esa métrica queda `null` y no se estima. Los tokens de Claude incluyen creación de caché, así que no son comparables uno a uno con los de Codex. La suite está saturada: con context en `1.00`, ninguna skill candidata puede demostrar mejora sobre ese techo, por lo que el delta `0` es tanto un límite del instrumento como una medición.

El segundo-repo dogfood usó un clon limpio de un monorepo de 12 paquetes y 1,595 archivos tracked. `inspect` produjo 504 Evidence; `model build` generó 8 KnowledgeUnits y `model validate`, `query`, `context` y `resolve` funcionaron. El primer build expuso un summary mayor de 240 caracteres y la copia de trabajo real expuso caches generados que agotaban el budget de 10,000 archivos. Ambos fallos tienen regresiones deterministas. El packet recuperó estructura y comandos, pero no intención de producto específica del target: esa limitación confirma que inspection estructural no sustituye ingestión semántica.

El material legacy 0.1 —scorecard y protocolo largo— sigue siendo `EXPERIMENTAL`. El behavioral runner ya existe, pero su scorer determinista y dataset de dos casos no permiten afirmar hoy una mejora general en task pass rate, calidad o alucinaciones.
