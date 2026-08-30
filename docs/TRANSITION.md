# Auditoría y mapa de transición

## Alcance y método

Esta auditoría inspeccionó el README, instrucciones raíz, contrato de producto/diseño/arquitectura, paquetes, CLI, runtime distribuido, skill `context-os`, referencias, prompts, schemas, evals y tests. También revisó un snapshot estructural indexado de Rationale y las interfaces públicas relevantes de Codebase Memory.

Las clasificaciones significan:

- `KEEP`: conservar contrato y comportamiento.
- `EVOLVE`: mantener valor, cambiar representación o responsabilidad.
- `ABSORB`: incorporar una idea externa sin dependencia.
- `DEPRECATE`: mantener temporalmente con ruta de migración.
- `REMOVE`: sacar de la dirección del producto; no necesariamente borrar hoy.
- `UNKNOWN`: decisión abierta que exige evidencia posterior.

## Veredicto del estado actual

contexxxt 0.1 tiene una base de distribución y seguridad más sólida que su capa de inteligencia. La CLI es publicable, local, sin dependencias runtime, idempotente, no-clobber y capaz de auditar/sincronizar adaptadores. Sin embargo, el “entendimiento” del proyecto se representa principalmente con plantillas Markdown y una skill genérica. Los evals actuales son fixtures y rúbricas estáticas; no demuestran mejora del agente frente a baseline.

La evolución no debe tirar la CLI segura. Debe cambiar el centro de gravedad: de instalar un sistema de archivos de contexto a inspeccionar, modelar y compilar contexto por tarea.

## Mapa de conceptos actuales

| Concepto actual | Estado | Transición |
|---|---|---|
| Audit-first para repos existentes | KEEP | Se convierte en `inspect` read-only y sigue precediendo cualquier integración. |
| Requests en lenguaje natural | KEEP | El Kernel clasifica tarea/7Q sin exigir vocabulario CLI. |
| Preguntas solo cuando cambian decisiones | KEEP | Se formaliza separando knowledge question y authorization gate. |
| Escrituras atómicas, hashes, no-clobber | KEEP | Se aplica a todo output compilado y migración. |
| Protección de symlinks y targets peligrosos | KEEP | Invariante de todas las escrituras. |
| Core neutral + adapters Codex/Claude | KEEP | El core pasa a ser provider-neutral y los adapters compilan desde el IR. |
| Skill-router pequeño y progressive disclosure | KEEP | Patrón base para bootloader y skills especializadas. |
| `.contextos/` como núcleo canónico | DEPRECATE | Se lee como fuente legacy; el futuro IR vive en una estructura `.contexxxt/` aún por definir. |
| Markdown como representación principal | EVOLVE | Pasa a output compilado; el canon de interpretación será estructurado. |
| `context-os` como skill universal | EVOLVE | Se vuelve bootstrap/router del Kernel, no enciclopedia ni base de conocimiento. |
| Plantillas `PROJECT/STATE/SOURCES/DECISIONS` | EVOLVE | Se ingieren como legacy y se compilan desde KnowledgeUnits cuando exista el IR. |
| `HANDOFF.md` | EVOLVE | Proyección legible de un Context Packet y observaciones verificadas. |
| `MEMORY_POLICY.md` y memoria candidata | EVOLVE | Se reduce a política de project knowledge y LearningCandidates. |
| Spaces y separación personal/trabajo | REMOVE | Fuera del producto agent-first/project-first; solo conservar aislamiento por repo/scope/sensibilidad. |
| Perfil personal, chat-only y exports manuales | REMOVE | Fuera de la evolución actual. No migrar datos privados al nuevo núcleo. |
| Sync hacia AGENTS/CLAUDE/skills | EVOLVE | Compiler targets con provenance, hash, revisión y diff. |
| `doctor` | EVOLVE | Debe validar schema, revisión, drift, cobertura, conflictos y outputs, no solo presencia de archivos. |
| `status` | EVOLVE | Debe mostrar snapshot, provider, coverage, 7Q gaps y candidatos además de archivos. |
| `prompt` y playbooks fijos | DEPRECATE | Compatibilidad temporal; reemplazo por Context Packets compilados por tarea. |
| Schemas actuales de project/space/memory | DEPRECATE | Se versionan como legacy y migran al schema del Project Model. |
| Manifest de archivos administrados | KEEP | Se amplía como build manifest de outputs compilados. |
| Evals JSON actuales | EVOLVE | Se convierten en semillas de un runner baseline/variant ejecutable. |
| “evals reproducibles” como claim actual | REMOVE | No se afirma hasta existir runner, fixtures y resultados repetibles. |
| Instalación npm/npx | KEEP | Sigue siendo el canal principal de distribución, con smoke limpio por release. |
| Telemetría ausente | KEEP | Métricas de eval son locales y explícitas, no tracking oculto. |

## Evidencia de implementación actual

### Implementado en 0.1

- comandos `init`, `audit`, `doctor`, `add-space`, `sync`, `export`, `status` y `prompt`;
- binario npm y runtime incluido en el paquete;
- instalación idempotente y política no-clobber;
- hashes, propuestas de conflicto y detección de drift administrado;
- adaptadores para Codex y Claude Code;
- skill genérica `context-os` con referencias progresivas;
- tests de CLI y validación de contenido del repositorio.

### Distribución verificada el 2026-08-28

- el registro público de npm devolvió `contexxxt@0.1.0` y un tarball descargable;
- un caché temporal vacío descargó el paquete y ejecutó `contexxxt help` mediante `npm exec`/npx;
- el mismo paquete ejecutó `audit` sobre un directorio vacío con exit code 0;
- `npm pack --dry-run` desde `packages/cli` produjo 49 entradas; el README del paquete fue ampliado en esta iteración, por lo que un próximo tarball tendrá un digest distinto y requerirá una publicación nueva;
- el tarball incluye binario, source y runtime, pero no incluye los schemas ni evals de la raíz del monorepo.

Esto prueba distribución y ejecución actual de la CLI 0.1. No prueba Project IR, compilación 7Q ni mejora de calidad del agente.

### Experimental

- plantillas de proyecto, fuentes, decisiones, estado y handoff como modelo manual;
- schemas de memoria/proyecto/espacio;
- fixtures de eval y scorecard sin ejecución comparativa de agentes;
- prompts de discover/design/apply y playbooks del runtime.

### Solo diseñado

- Repository Inspector semántico y Native Structural Provider;
- Project Model/IR y KnowledgeUnits;
- resolución 7Q por tarea;
- Context Packet compiler;
- absorción causal de Rationale;
- adapter opcional de Codebase Memory;
- drift ligado a revisión/scope;
- observations y learning candidates;
- síntesis y promoción de skills;
- eval runner baseline/variant para Codex y Claude Code.

## Qué se absorbe de Rationale

La evaluación usó el snapshot estructural local disponible; el repositorio Rationale no estaba presente como checkout durante esta iteración. Por eso el mapa se limita a conceptos y contratos observables, no declara equivalencia completa con su estado remoto actual.

| Idea de Rationale | Acción | Adaptación en contexxxt |
|---|---|---|
| Record vs proposal | ABSORB | KnowledgeUnit activa se separa de LearningCandidate aún no promovida. |
| Evidence y provenance | ABSORB | Evidence direccionable, revision-bound y provider-aware. |
| Causalidad/decisiones/consecuencias | ABSORB | `decision` es un kind tipado con opciones y relaciones al código. |
| Constraint crítico | ABSORB | Prioridad máxima en compilación y eval de compliance. |
| Authority y applicability | ABSORB | Ejes por asunto y scope; no jerarquía global ciega. |
| Confidence | ABSORB | Separada de authority y coverage. |
| Revision consistency/drift | ABSORB | Validity + RevisionBinding + detector de drift. |
| Binding de decisiones al código | ABSORB | Relaciones `governs`, `implements`, `validates`, `applies_to`. |
| Context Packet con budget | ABSORB | Salida central del Task Compiler. |
| Manual approval de decisiones normativas | EVOLVE | Evidencia/inferencia primero; gate humano solo por conocimiento imprescindible o autoridad externa. |
| Storage/CLI/producto Rationale | REMOVE | No se incorpora como dependencia ni canon paralelo. |

## Contrato de Codebase Memory

| Aspecto | Native | Codebase Memory adapter |
|---|---|---|
| Disponibilidad | obligatoria | opcional |
| Repo/Git/manifests/configs | fuente directa | contexto auxiliar |
| Arquitectura básica | filesystem + manifests + imports razonables | graph/clusters enriquecidos |
| Símbolos/callers/data flow | parcial, puntual | acelerado si la capacidad existe |
| Fuente normativa | nunca por sí solo | nunca por sí solo |
| Coverage | declarada con gaps | declarada por respuesta/index |
| Fallo | degrada una capacidad | fallback transparente a Native |
| Canon | Evidence para el IR | Evidence para el IR |

El adapter debe capability-negotiate; no puede asumir que cada cliente expone exactamente las mismas herramientas o que un índice limpio prueba completitud.

## Secuencia de migración

1. Congelar 0.1 como baseline de compatibilidad y seguridad.
2. Introducir schemas del IR y fixtures sin cambiar outputs existentes.
3. Implementar `inspect` read-only y medirlo en repos fixture.
4. Generar Project Model v0 junto a `.contextos/`, nunca encima.
5. Compilar un Context Packet para una tarea acotada y compararlo contra baseline.
6. Añadir causalidad/revisión y luego Codebase Memory opcional.
7. Introducir observaciones y candidates sin promoción automática.
8. Generar una primera skill candidata solo después de demostrar valor.
9. Proveer migración explícita y reversible antes de retirar el canon legacy.

## Decisiones deliberadamente no tomadas

- JSON vs SQLite para el IR;
- nombre final de la skill bootstrap;
- hooks específicos para interceptar cada tarea en Codex/Claude Code;
- compatibilidad temporal exacta de `.contextos/`;
- si el paquete 0.2 será prerelease o minor estable;
- thresholds numéricos de promoción antes de obtener distribuciones reales.

Estas decisiones permanecen `UNKNOWN`, no `PLANNED`, hasta que una fase produzca evidencia suficiente.
