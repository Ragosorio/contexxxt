# Arquitectura objetivo

## Criterio de diseño

La arquitectura existe para maximizar contexto útil por token, no para representar cada verbo como un servicio. Los nombres siguientes son responsabilidades lógicas; durante las primeras fases deben vivir en pocos módulos cohesivos dentro de la CLI.

El flujo central es:

```text
intent -> inspect -> Project Model -> query -> resolve 7Q -> compile -> execute -> verify -> observe -> evaluate
```

El Project Model conecta evidencia con outputs compilados. No ejecuta al agente, no reemplaza Git y no convierte un proveedor estructural en fuente normativa.

## Componentes

### Contexxxt Kernel

Orquesta una tarea y aplica los invariantes del producto. Selecciona inspector, providers, presupuesto, resolver, compilador, verificación y política de persistencia. Distingue preguntas de conocimiento de gates de autorización.

### Repository Inspector

Descubre el repositorio sin escribir: raíz, revisión Git, workspaces, manifests, lenguajes, CI, tests, configs, schemas, docs, instrucciones, skills y archivos administrados existentes. Produce Evidence con coverage y gaps.

En la fuente `0.2.0-alpha.2`, `inspect` implementa esta frontera para Git, filesystem, Node/pnpm, comandos declarados, GitHub Actions, tests, documentación, instrucciones por scope y estado `.contexxxt`/`.contextos`. El `InspectionReport` es un artefacto reproducible que contiene la misma forma `Evidence` aceptada por el Project Model. No es canon, no interpreta observaciones como reglas y no escribe salvo que el usuario solicite `--output`; ese output es atómico y no-clobber.

### Structural Provider

Contrato de capacidades para evidencia estructural. No expone nombres de herramientas externas al Kernel.

```ts
interface StructuralProvider {
  describe(): ProviderDescriptor;
  snapshot(scope: ScopeRef): Promise<StructuralSnapshot>;
  architecture?(scope: ScopeRef): Promise<ProviderEvidence>;
  search?(query: StructuralQuery): Promise<ProviderEvidence>;
  symbols?(query: SymbolQuery): Promise<ProviderEvidence>;
  trace?(query: TraceQuery): Promise<ProviderEvidence>;
  impact?(change: ChangeSet): Promise<ProviderEvidence>;
}
```

Cada respuesta incluye `provider_id`, versión, capacidades usadas, snapshot/revisión, scope, coverage, gaps, warnings y locators. “Sin resultados” no significa “no existe” salvo que la cobertura declarada y una verificación nativa lo sostengan.

### Native Structural Provider

Siempre disponible. Usa filesystem, Git, manifests, configuración, scripts, tests, documentación e inspección razonable de imports. Debe ofrecer un recorrido útil sin replicar un knowledge graph completo.

Su objetivo es responder topología básica, puntos de entrada, paquetes, comandos, fuentes normativas y evidencia suficiente para arrancar. Para relaciones profundas puede declarar `partial` y dejar que el compilador solicite evidencia puntual.

### Codebase Memory Adapter

Opcional y capability-driven. Puede acelerar arquitectura, símbolos, callers/callees, rutas, dependencias, impacto, data flow y búsqueda semántica/estructural. El adaptador traduce resultados a Evidence; nunca almacena directamente conclusiones canónicas.

La integración no asume una lista fija de tools. Negocia capacidades porque versiones y clientes pueden exponer conjuntos diferentes. Si el índice está ausente, stale, incompleto o falla, contexxxt continúa con Native y conserva la advertencia de cobertura.

La fuente `0.2.0-alpha.5` implementa esta frontera con `structural capabilities|inspect|compare`. Puede usar la CLI read-only externa o un snapshot entregado por un host MCP; ambos atraviesan el mismo normalizador testeable. No crea ni actualiza índices. La interfaz se basa en capacidades documentadas por el proyecto [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp), sin convertirlo en dependencia obligatoria.

### Evidence Resolver + 7Q Resolver

Estas responsabilidades comienzan en un mismo módulo:

- normalizan Evidence;
- enlazan evidencia con KnowledgeUnits;
- aplican scope, authority, revision, validity y supersession;
- detectan conflictos;
- determinan dimensiones requeridas y su estado;
- deciden si buscar más, inferir, preguntar o continuar.

Se separarán solo si métricas o complejidad real lo justifican.

### Project Model

IR estructurado y revision-bound descrito en [PROJECT_MODEL.md](PROJECT_MODEL.md). Mantiene unidades de conocimiento, evidencia, relaciones y candidatos. Puede reconstruirse; las fuentes primarias no desaparecen.

`model build` implementa la frontera `InspectionReport -> Project Model`: reutiliza Evidence canónica, agrupa observaciones en pocas unidades conservadoras y reconcilia por IDs estables. Las unidades generadas llevan un digest de generación; si fueron editadas, el builder las preserva y devuelve una propuesta. El modelo existente inválido nunca se sobrescribe. La observación del propio `.contexxxt/project-model.json` no se reingresa al snapshot, evitando una dependencia circular.

### Project Model Query Layer

Frontera determinista entre almacenamiento y consumidores. Valida el JSON canónico, genera índices derivados en memoria y resuelve lookups por ID, dimensión, tipo, estado, scope, evidence y relación. También aplica supersesión, vigencia a un `as_of`, orden estable y budgets de salida.

La Query Layer no decide qué necesita una tarea ni interpreta intención. El 7Q Resolver hace esa decisión semántica y consulta esta capa. El Task Compiler recibe una selección ya acotada. Así `Project Model -> Query Layer -> 7Q Resolver -> Context Compiler` es una secuencia real y testeable, no un dump del IR dentro del prompt.

Phase 1 expone esta frontera mediante `model validate`, `query ...` y `context <target>`. Phase 4 añade `resolve` y ContextPacket con un fallback local explícito; el juicio semántico completo continúa siendo responsabilidad del host.

### Task Compiler

Selecciona el subconjunto aplicable del modelo y produce un Context Packet para Codex, Claude Code o un target genérico. Aplica presupuesto, prioridad, progressive disclosure y formato del provider. Registra qué incluyó, qué omitió y por qué.

### Provider Adapters

Traducen un Context Packet y outputs durables a la superficie objetivo. Deben mantener el core neutral y declarar sus limitaciones. Un adapter puede producir `AGENTS.md`, `CLAUDE.md`, reglas o una skill, pero no decide qué conocimiento es verdadero.

La implementación actual instala únicamente routers mínimos que indican cómo consultar `resolve`/`context`. Si `AGENTS.md` o `CLAUDE.md` ya pertenece al usuario, crea una propuesta separada; la desinstalación sólo elimina un archivo cuyo digest coincide con el manifest administrado.

### Verification + Execution Observation

Verification ejecuta los checks definidos por la tarea: tests, lint, typecheck, schemas, invariantes, diff y checks específicos. Las observaciones registran resultado, herramientas, tiempo, tokens/contexto cuando estén disponibles y desviaciones del procedimiento.

Una salida del modelo no se usa como única prueba de su propia corrección cuando existe un verificador determinista.

### Learning Candidate Pipeline

Agrupa observaciones sin promocionarlas. Evalúa repetición, estabilidad, autoridad, scope, sensibilidad, riesgo y forma mínima de persistencia. Puede proponer actualizar conocimiento, crear un constraint, procedimiento, validador o skill; también puede decidir no persistir.

### Skill Synthesizer

Compila una candidata mediante progressive disclosure. El router queda pequeño; detalle, código y casos se distribuyen en `references/`, `scripts/`, `assets/` y `evals/` solo cuando aportan valor. Toda salida es no-clobber, hash-aware y trazable al modelo.

La implementación exige una LearningCandidate `supported`, repetida, con autoridad, riesgo aceptable y contrato de routing. El bundle generado es un artefacto no canónico; puede validarse y evaluarse, pero `generated != promoted`.

### Eval Runner

Ejecuta baseline y variante, valida triggers positivos/negativos/boundary, compliance, calidad y costo. Sus resultados deciden promoción o rechazo; no se deja como validación final desconectada del desarrollo.

El runner actual soporta `baseline`, `context` y `candidate` a través de procesos reales de Codex y Claude Code. Conserva errores, versión, modelo observable, revisión, bytes de contexto, usage, tiempo y output digest. El scoring actual es una rúbrica determinista acotada; resultados entre hosts no se agregan como si sus métricas fueran equivalentes.

### Drift Detector

Compara revisión, digests, fuentes, outputs compilados, providers y validadores. Marca unidades o artefactos stale y propone recompilación o revisión. No repara ni sobrescribe silenciosamente.

## Flujo end-to-end

1. El Kernel recibe intención y target.
2. Clasifica task/risk y propone dimensiones 7Q requeridas.
3. Repository Inspector y Native obtienen evidencia mínima.
4. Providers opcionales añaden evidencia estructural y cobertura.
5. Evidence Resolver actualiza el Project Model canónico.
6. Query Layer recupera un índice o subconjunto compacto sin cargar el modelo completo.
7. 7Q Resolver decide las dimensiones requeridas y pide drill-down solo cuando es necesario.
8. Si falta conocimiento material, pregunta una sola cuestión de alto valor.
9. Task Compiler produce el Context Packet.
10. El agent adapter entrega el packet y el agente ejecuta.
11. Verification comprueba el resultado y Observation registra hechos.
12. Learning Pipeline propone o descarta candidatos; Eval Runner promueve o rechaza.

## Separación de planos

| Plano | Contenido | Mutabilidad |
|---|---|---|
| Evidence | repositorio, Git, docs, resultados, conocimiento humano autorizado | append/reobserve |
| Project Model | interpretación estructurada y revision-bound; JSON canónico | reconcile/version |
| Query/index | índices regenerables y respuestas compactas | derivado/efímero |
| Task | TaskResolution y Context Packet | efímero/inmutable por run |
| Compiled outputs | reglas, referencias, adapters, skills, docs | regenerable/no-clobber |
| Evaluation | casos, baselines, métricas y resultados | versionado |

## Autoridad

La autoridad se evalúa por asunto, no con una jerarquía global rígida. Como defaults:

1. límites explícitos, seguridad y autorización externa;
2. fuente normativa del proyecto para el asunto;
3. decisiones vigentes y aprobadas por la autoridad correspondiente;
4. código/configuración/tests como evidencia del estado implementado;
5. documentación descriptiva y observaciones;
6. inferencias y recuerdos del provider.

Código y tests pueden demostrar comportamiento actual, pero no inventar intención. Un documento puede definir intención, pero no demostrar que el runtime la cumple.

## Absorción de Rationale

Rationale no será una dependencia. Se absorben ideas, no su producto completo:

- causalidad y razones de decisiones;
- constraints y consecuencias;
- provenance, evidence y authority;
- applicability y binding al scope;
- confidence separada de authority;
- revision awareness, consistency y drift;
- relaciones entre decisiones y código gobernado;
- Context Packets con presupuesto y prioridad;
- propuestas separadas de records vigentes.

Se cambia una decisión importante: una unidad normativa no requiere aprobación humana por defecto. contexxxt intenta evidencia, conocimiento vigente e inferencia segura antes de preguntar. La aprobación se reserva para autoridad externa o acciones difíciles de revertir.

No se absorben:

- una CLI o storage de Rationale como dependencia;
- el requisito universal de aprobación manual;
- la arquitectura interna si no sirve al Project Model;
- un segundo canon de decisiones separado del IR.

## Integración opcional con Codebase Memory

### Sin Codebase Memory

contexxxt funciona con Native. Puede descubrir estructura, comandos, packages, instrucciones, CI, tests, archivos y dependencias observables. Debe reportar límites en callers, data flow o relaciones semánticas complejas cuando no pueda verificarlas eficientemente.

### Con Codebase Memory

El adapter puede producir mejor evidencia estructural y reducir tool calls. Antes de usar una respuesta comprueba:

- disponibilidad y versión;
- repositorio/index correcto;
- revisión o freshness;
- capacidad solicitada;
- scope y coverage;
- warnings y truncación.

### Fallback y merge

1. Native define identidad del repo, Git y fuentes locales.
2. El adapter agrega relaciones estructurales con provenance propio.
3. Resultados convergentes elevan confianza, no authority normativa.
4. Resultados divergentes disparan verificación directa o conflicto.
5. Un fallo del adapter degrada cobertura; no bloquea tareas que Native puede resolver.

## Almacenamiento y migración

La CLI 0.1 usa `.contextos/` y Markdown/JSON administrado. Phase 1 añade `.contexxxt/project-model.json`; Phase 2 lleva su schema a `1.1.0` para representar observaciones de inspección y binding de revisión sin crear un inventario paralelo. Los índices por scope, dimensión, tipo, estado, source y relaciones se reconstruyen en memoria desde ese archivo y no se versionan. No habrá rename destructivo del canon legacy.

SQLite no se introduce por anticipación. Solo se reconsidera con mediciones que demuestren que JSON validado + índices derivados no satisface latencia, volumen o concurrencia.

La migración pública implementada:

1. leer `.contextos/` como una fuente legacy;
2. crear el nuevo modelo al lado sin sobrescribir;
3. validar el modelo antes de persistirlo y registrar un reporte;
4. mantener lectura legacy durante `0.2.x`;
5. no retirar compatibilidad antes de `0.3.0`, y sólo con evidencia de migración verificable.

## Límites de componentes

Para evitar arquitectura estética, las primeras implementaciones deben agruparse así:

```text
inspect/      Repository Inspector + Native provider
model/        schemas + Evidence/KnowledgeUnit/ProjectModel
query/        deterministic indexes, retrieval and budgets
resolve/      semantic Evidence + 7Q resolution
compile/      Context Packet + provider projections
evaluation/   verification, observations and eval harness
learning/     observations, candidate lifecycle and promotion proposals
skills/       candidate bundle compilation and validation
agents/       thin Codex and Claude Code retrieval adapters
migration/    explicit legacy-to-canonical transition
```

El vertical slice, skill synthesis y behavioral eval foundation ya existen. El adapter Codebase Memory tiene amplitud estructural medida, pero su impacto en calidad de tarea aún no. La integración completa de ejecución del agente sigue fuera del core local actual.

## Seguridad y escritura

- nunca capturar o imprimir valores de secretos;
- rechazar targets raíz/home y symlinks en rutas administradas;
- usar escrituras atómicas, hashes y propuestas ante drift;
- preservar instrucciones del usuario;
- no tratar skills o Markdown como sandbox;
- exigir autorización para acciones externas o irreversibles;
- mantener datos privados fuera del repositorio público.

## Decisiones abiertas

- umbral medido para persistir índices o introducir SQLite;
- protocolo de ejecución “todo pasa por contexxxt” en hosts que no ofrecen hooks;
- cómo ampliar el scorer conductual sin ocultar diferencias de métricas entre Codex y Claude Code;
- cuándo un Context Packet se inyecta, referencia o guarda como artifact;
- criterio empírico para terminar la ventana de compatibilidad `.contextos/` después de 0.2.x.
