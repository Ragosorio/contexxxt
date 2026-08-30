# Project Model / 7Q IR

## Propósito

El Project Model es la representación intermedia estructurada que contexxxt usa para compilar contexto. Evita que siete documentos, un `SKILL.md`, `AGENTS.md` y `CLAUDE.md` compitan como fuentes canónicas.

El modelo separa cuatro cosas que suelen confundirse:

- **evidencia:** lo observado y dónde;
- **conocimiento:** la interpretación vigente y aplicable de esa evidencia;
- **resolución:** lo que una tarea necesita saber ahora;
- **salida compilada:** el subconjunto entregado a una superficie o agente.

Phase 1 fija un primer encoding ejecutable: JSON canónico versionado en `.contexxxt/project-model.json`, validado por `packages/cli/schemas/project-model.schema.json`. Phase 2 amplía el mismo tipo `Evidence` para observaciones nativas; `InspectionReport` lo transporta, pero no introduce un segundo canon. El JSON del modelo es almacenamiento, no una interfaz de lectura para agentes. Los índices son derivados y regenerables.

> **Contexxxt should not need to reread itself.** El agente decide qué necesita; la Query Layer determina de forma reproducible cómo recuperarlo. Abrir el JSON completo queda reservado para debugging, auditoría o una carencia explícita de la interfaz pública.

## Modelo mínimo

No todos los conceptos necesitan ser entidades independientes. El núcleo propuesto usa seis tipos:

1. `Evidence`: observación direccionable y ligada a una revisión.
2. `KnowledgeUnit`: afirmación tipada que puede responder varias dimensiones 7Q.
3. `ProjectModel`: índice de unidades, evidencia, relaciones y snapshot.
4. `TaskResolution`: matriz 7Q efímera para una tarea.
5. `ContextPacket`: salida compilada e inmutable para una ejecución.
6. `LearningCandidate`: propuesta evaluable de cambio persistente.

`Decision`, `Constraint`, `Procedure`, `Goal`, `Actor` y `Artifact` son clases semánticas de `KnowledgeUnit`, con payloads tipados cuando requieren estructura adicional. `Source`, `Scope`, `Authority`, `Validity` y `RevisionBinding` son value objects reutilizados. `Validation` puede ser evidencia o un contrato de verificación adjunto a una unidad/procedimiento. `Observation` es una `Evidence` producida por ejecución y no un canon separado.

## Evidence

```yaml
Evidence:
  id: string
  type: source_fragment | repository_fact | command_result | test_result | human_statement | execution_observation
  summary: string
  observation: optional {category, key, value}
  locator:
    uri: string
    range: optional
    symbol: optional
  digest: string
  observed_at: timestamp
  revision: optional {commit, branch, dirty}
  provider:
    id: native | codebase-memory | human | agent | other
    version: optional string
    capabilities_used: [string]
  coverage:
    status: complete | partial | unknown | not-applicable
    scopes: [ScopeRef]
    gaps: [string]
  authority: Authority
  sensitivity: public | internal | confidential | secret-reference
```

El digest detecta cambios en el fragmento observado; no convierte el contenido en verdadero. `observation` ofrece un campo compacto y determinista para que `inspect` preserve categoría, clave y valor observado sin inventar una conclusión. `revision` liga la lectura a HEAD y declara si el árbol estaba dirty. `secret-reference` puede conservar un locator o nombre, nunca el valor del secreto.

## KnowledgeUnit

```yaml
KnowledgeUnit:
  id: string
  type: fact | decision | constraint | procedure | goal | actor | artifact
  summary: string # compacto, estable y limitado a 240 caracteres
  statement: string
  dimensions:
    what: optional complete | partial
    why: optional complete | partial
    how: optional complete | partial
    for_what: optional complete | partial
    which: optional complete | partial
    who: optional complete | partial
    where: optional complete | partial
  scopes: [ScopeRef]
  evidence: [EvidenceRef]
  provenance:
    created_by: human | agent | importer | compiler
    method: observed | declared | inferred | synthesized
    created_at: timestamp
  authority: Authority
  confidence: number # 0..1, calibrada; no sustituye authority
  validity: Validity
  revision_binding: RevisionBinding
  applicability:
    tasks: [pattern]
    agents: [codex | claude-code | any]
    environments: [pattern]
  relationships: [Relation]
  status: candidate | active | disputed | stale | superseded | rejected
  payload: optional typed object
```

Una unidad puede responder varias preguntas. Por ejemplo, “el webhook es la fuente autorizada de pago completado” puede cubrir WHAT, WHY, HOW, WHICH y WHERE sin duplicarse.

### Payloads tipados

- `decision`: problema, opciones consideradas, elección, razones y consecuencias.
- `constraint`: condición, severidad, superficie de enforcement y excepción autorizada.
- `procedure`: precondiciones, pasos, outputs, validadores y condiciones de abortar.
- `goal`: resultado, invariantes y definition of done.
- `actor`: identidad funcional, autoridad y responsabilidades; no perfil personal.
- `artifact`: formato, productor, consumidor, ubicación y lifecycle.

Los payloads añaden estructura; no repiten `statement`, scope, evidence ni validity.

## Identidad

Los IDs son estables, legibles y namespaced por dominio, por ejemplo `payments.webhook.authority`. La identidad representa el concepto, no el texto exacto ni la ubicación actual. Cambiar un statement sin cambiar su significado conserva el ID; reemplazar el significado crea una unidad nueva y una relación `supersedes`.

Evidence IDs se derivan de categoría, locator y digest. La revisión y el momento observado permanecen como metadata explícita: contenido idéntico conserva identidad aunque se reobserve; contenido diferente produce otra Evidence.

## Scope

```yaml
ScopeRef:
  kind: project | workspace | package | directory | file | symbol | route | service | domain | environment | surface
  value: string
  match: optional exact | prefix | glob
  exclude: optional [ScopeRef]
```

Una unidad puede gobernar múltiples scopes. La forma tipada permite construir índices `scope -> KnowledgeUnit IDs` sin interpretar objetos heterogéneos. Para paths, `directory` usa prefix y `file` exact por defecto; `glob` debe pedirse explícitamente. El scope más específico aplicable gana sobre una regla general si la autoridad es equivalente. Un conflicto de autoridad o una exclusión explícita no se resuelve solo por especificidad.

## Authority, confidence y coverage

Son ejes independientes:

- `authority` responde quién o qué puede definir el asunto;
- `confidence` expresa certeza sobre la interpretación;
- `coverage` expresa cuánto del scope relevante fue inspeccionado.

Una prueba puede dar alta confianza sobre comportamiento observado, pero no autoridad para cambiar un requisito de negocio. Un documento de producto puede tener autoridad normativa y estar stale. Un índice estructural puede tener excelente cobertura de símbolos y ninguna autoridad normativa.

```yaml
Authority:
  level: governing | authoritative | supporting | observational | unknown
  subject: string
  source: optional EvidenceRef
```

## Vigencia y revisión

```yaml
Validity:
  observed_at: timestamp
  reviewed_at: optional timestamp
  expires_at: optional timestamp
  expires_when: [condition]
  stale: boolean
  stale_reason: optional string

RevisionBinding:
  repository: optional string
  valid_at_commit: optional string
  valid_for_tree: optional digest
  files: optional [{path, digest}]
```

El detector de drift puede marcar stale por tiempo, cambio de archivos gobernados, cambio de commit, desaparición de una fuente, fallo de validación o supersesión. No borra automáticamente la unidad.

## Relaciones

El conjunto inicial es pequeño y dirigido:

```text
supports | contradicts | supersedes | governs | applies_to
depends_on | implements | validates | produced_by | consumed_by
```

Cada relación tiene `from`, `to`, evidence opcional y scope. Relaciones inversas se consultan; no se duplican en almacenamiento.

## Query Layer ejecutable

El Project Model no se entrega entero al agente. La capa pública de lectura opera sobre el JSON validado y construye índices derivados en memoria por ID, dimensión, tipo, estado, scope, evidence y relaciones. Para el volumen actual esto evita otra base de datos y mantiene una sola fuente canónica. SQLite solo se evaluará con mediciones de latencia, tamaño o concurrencia que justifiquen su costo.

```text
canonical JSON -> schema validation -> derived indexes -> compact query result
```

Consultas implementadas en Phase 1:

```bash
contexxxt model validate
contexxxt query catalog
contexxxt query knowledge <id>
contexxxt query evidence <id>
contexxxt query dimension <7q>
contexxxt query scope <kind:value|path>
contexxxt query type <type>
contexxxt query status <status>
contexxxt query decisions|constraints|procedures|actors|conflicts|stale
contexxxt query actor <id>
contexxxt context <target>
```

`query target <target>` es un alias estructural de `context <target>`. `context` calcula conocimiento gobernante y estados 7Q a partir de dimensiones declaradas, scope, vigencia, supersesión y conflictos. No interpreta todavía una intención en lenguaje natural. El futuro `resolve --target ... --intent ...` decidirá semánticamente qué dimensiones requiere la tarea y después reutilizará esta misma capa; no tendrá una ruta privada de búsqueda.

### Progressive disclosure dentro del modelo

1. **Level 1 — index:** catálogo, IDs y summaries compactos.
2. **Level 2 — detail:** una KnowledgeUnit, Evidence, Decision, Constraint, Procedure o Actor específico y sus relaciones cercanas.
3. **Level 3 — proof:** evidencia cruda, código fuente o proveedor estructural Native/Codebase Memory.

El default es Level 1. `query knowledge <id>` y `query evidence <id>` hacen drill-down a Level 2. La capa nunca salta a Level 3 por un lookup determinista.

### Contrato de respuesta y budgets

Una respuesta compacta conserva `id`, `type`, `dimensions`, `scope`, `confidence`, `authority`, `status` y referencias de evidence. `--view ids|summary|detail`, `--limit`, `--max-bytes`, `--depth`, `--include`, `--exclude`, `--at` y `--dimensions` controlan tamaño y expansión. El orden es estable: status, authority, especificidad del scope que realmente coincidió, confidence e ID como desempate.

Toda respuesta reporta el budget efectivo, bytes emitidos, truncación y elementos omitidos. Cuando el envelope estructural mínimo no cabe, la consulta falla explícitamente en vez de producir JSON parcial o inválido.

No requieren LLM: validación de schema y referencias; lookup por ID/dimensión/tipo/estado/scope; matching de paths; supersesión; stale a una fecha `as_of`; conflictos explícitos; orden; hashes; duplicados exactos; relaciones rotas; budgets e índices. La misma entrada —modelo, selector, opciones y `as_of`— produce la misma salida byte a byte.

## Conflictos y supersesión

Dos unidades están en conflicto cuando son simultáneamente aplicables al mismo asunto y sus statements o payloads no pueden cumplirse juntos. El resolver intenta, en orden:

1. excluir unidades fuera de scope;
2. aplicar supersesión explícita;
3. comparar revision binding y vigencia;
4. comparar autoridad sobre el asunto;
5. buscar evidencia adicional;
6. usar una inferencia reversible si el riesgo lo permite;
7. marcar `conflicted` y preguntar solo si bloquea la tarea.

La mayor confianza no invalida por sí sola una fuente con mayor autoridad.

## TaskResolution

```yaml
TaskResolution:
  task_id: string
  intent: string
  task_type: string
  risk: low | medium | high | external-authority
  required_dimensions: [7Q]
  dimensions:
    what: DimensionResolution
    why: DimensionResolution
    how: DimensionResolution
    for_what: DimensionResolution
    which: DimensionResolution
    who: DimensionResolution
    where: DimensionResolution
  assumptions: [string]
  blocking_questions: [Question]
  authorization_gates: [Gate]
```

Cada dimensión tiene exactamente uno de estos estados:

| Estado | Regla de determinación |
|---|---|
| `resolved` | Evidencia suficiente, aplicable, vigente y sin conflicto bloqueante responde la dimensión. |
| `partial` | Parte de la respuesta está sustentada, pero faltan elementos que afectan precisión o ejecución sin bloquear el siguiente paso seguro. |
| `unknown` | No existe evidencia suficiente ni inferencia segura. |
| `conflicted` | Dos o más unidades aplicables e incompatibles no pudieron ordenarse por scope, vigencia, supersesión o autoridad. |
| `stale` | La mejor respuesta depende de evidencia vencida o de una revisión que cambió materialmente. |
| `not-required` | El clasificador justificó que la dimensión no cambia la tarea ni su verificación. |

`resolved` no significa certeza absoluta. Incluye confidence, evidence refs, coverage y rationale breve de selección.

## Determinación de dimensiones requeridas

El task classifier produce un conjunto inicial según tipo y riesgo. Ejemplos:

- corregir un bug suele requerir WHAT, HOW, FOR WHAT y WHERE; WHY/WHICH se activan si hay alternativas o decisiones previas;
- diseñar arquitectura requiere las siete;
- renombrar texto localizado puede marcar WHY y WHO como `not-required` si no alteran el resultado;
- publicar requiere WHO por autoridad aunque la implementación ya esté completa.

El resolver puede activar una dimensión adicional al descubrir un conflicto, boundary o constraint. Debe registrar por qué la activó; nunca carga siete respuestas por costumbre.

## ContextPacket

```yaml
ContextPacket:
  id: string
  task_id: string
  target: codex | claude-code | generic
  model_snapshot: string
  compiled_at: timestamp
  budget:
    max_tokens: number
    used_tokens: number
  resolutions: [DimensionResolution]
  governing_units: [KnowledgeUnitRef]
  procedures: [KnowledgeUnitRef]
  evidence_index: [EvidenceRef]
  assumptions: [string]
  unknowns: [string]
  authorization_gates: [Gate]
  verification_contract: [Validation]
  omissions: [{unit, reason}]
```

La compilación prioriza, en este orden: seguridad/autoridad, constraints que gobiernan, definition of done, scope, procedimiento aplicable, evidencia de alta relevancia y contexto explicativo. El packet registra omisiones importantes y nunca incluye el Project Model completo por defecto.

## LearningCandidate

```yaml
LearningCandidate:
  id: string
  kind: knowledge_update | rule | procedure | validator | skill
  proposed_change: object
  observations: [EvidenceRef]
  target_scope: [ScopeRef]
  stability: one_off | repeated | stable
  risk: low | medium | high
  baseline_eval: optional EvalRunRef
  candidate_eval: optional EvalRunRef
  status: observed | proposed | evaluating | promoted | rejected | deferred
  decision_reason: optional string
```

Promover exige provenance suficiente, scope correcto, ausencia de secretos, checks deterministas y el gate de eval correspondiente. Rechazar conserva el resultado del eval para no redescubrir la misma mala regla.

## Modelo de skill candidata

Antes de sintetizar una skill se prueba esta secuencia:

1. ¿El conocimiento es estable y específico del proyecto?
2. ¿Existe un procedimiento repetido o un routing que una regla corta no resuelve?
3. ¿La especialización reduce errores o contexto irrelevante?
4. ¿Puede medirse contra un baseline y casos negativos?
5. ¿El costo de mantenimiento y drift es aceptable?

Si alguna respuesta necesaria es no, se elige una salida más pequeña o no se persiste nada.

## Canon y outputs

El Project Model será el canon de interpretación para compilar, pero sigue siendo reconstruible y revision-bound. El repositorio, Git, fuentes normativas y respuestas humanas autorizadas continúan siendo evidencia primaria.

Outputs compilables previstos:

- `AGENTS.md` y `CLAUDE.md` delgados;
- project rules y referencias;
- Context Packets y handoffs;
- validadores deterministas;
- documentación;
- skills especializadas;
- fixtures y evals.

Cada output declara `generated_from`, `model_snapshot`, `compiler_version` y hash. Una edición humana fuera del flujo no se sobreescribe: se reporta como drift o se propone reconciliación.

## Estado implementado de Phases 1 a 3

- schema JSON canónico `1.1.0` y validación semántica;
- identidad, evidence refs, dimensiones 7Q, scopes tipados, authority, confidence, validity, revision binding y relaciones;
- índices derivados en memoria;
- Query Layer y `context <target>` con resultados compactos y budgets;
- fixtures pequeños, tests deterministas y runner de eval de consultas;
- Project Model del propio repositorio consultado mediante el contrato público.
- `InspectionReport` reproducible que reutiliza Evidence canónica con observación y revisión;
- `inspect` read-only para Git, filesystem, Node/pnpm, comandos declarados, GitHub Actions, tests, docs, instrucciones y estado contexxxt;
- persistencia de report sólo bajo `--output`, atómica y sin sobrescritura.
- `model build` desde report guardado o inspección read-only en memoria;
- síntesis conservadora de estructura, comandos declarados, CI e instrucciones, sin una KnowledgeUnit por archivo;
- reconciliación idempotente con preservación humana, retiro seguro de unidades generadas y proposals ante drift;
- exclusión del archivo canónico como input de su propio snapshot para que contexxxt no necesite releerse.

Están implementados TaskResolution y ContextPacket v1, además de un adapter estructural opcional. ExecutionObservation y LearningCandidate viven en contratos versionados separados porque no son conocimiento canónico. Dos observaciones distintas pueden llevar una candidata a `supported`; `promoted` exige un eval positivo y sólo produce una propuesta. El Skill Synthesizer compila una candidata soportada como artefacto derivado con manifest y evals, pero no la promociona. El Behavioral Eval Runner ya compara baseline/context/candidate en hosts reales; existe un caso Codex medido y el run Claude Code conserva un bloqueo de autenticación como error no medible.

## Preguntas abiertas del modelo

- evidencia suficiente para retirar la ventana de compatibilidad `.contextos/` después de 0.2.x;
- calibración de confidence entre providers heterogéneos;
- granularidad mínima para bindear una unidad a símbolos sin acoplarla a un índice externo;
- política de retención para observaciones y eval runs;
- umbrales medidos que justificarían persistir índices o migrar a SQLite.
