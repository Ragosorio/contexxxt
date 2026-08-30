# Roadmap técnico

## Regla de avance

Cada fase usa `OBSERVE -> PLAN -> IMPLEMENT -> VERIFY -> EVAL -> LEARN -> UPDATE PROJECT MODEL`. Una fase no termina por cantidad de archivos ni porque el diseño parezca completo. Termina cuando su completion gate produce evidencia reproducible.

Los evals empiezan en Phase 1 y crecen con cada fase; Phase 8 los convierte en una comparación comportamental completa, no los introduce por primera vez.

## Phase 0 — Foundation

**Objective:** fijar tesis, alcance, modelo 7Q, arquitectura, transición y lenguaje honesto.

**Input:** contexxxt 0.1, auditoría del repo, ideas relevantes de Rationale, interfaces de Codebase Memory y tesis 7Q.

**Output:** PRODUCT, PROJECT_MODEL, ARCHITECTURE, TRANSITION, EVALUATION, ROADMAP, diagramas y README reconciliados.

**Invariants:** no cambiar comportamiento runtime; no presentar diseño como implementación; no duplicar canon.

**Deterministic checks:** enlaces y archivos presentes, validación de contenido, build/check del repo, SVG/HTML accesible y self-check visual.

**Evals:** revisión de claims IMPLEMENTED/EXPERIMENTAL/PLANNED contra evidencia del repo; revisión cruzada de contradicciones.

**Completion gate:** todos los documentos centrales usan la misma definición, estados y secuencia; `pnpm check` pasa.

## Phase 1 — Executable Project Model Foundation

**Status:** implemented in source as `0.2.0-alpha.1`; publication and clean-environment install are not claimed.

**Objective:** crear la representación mínima estructurada y una interfaz determinista capaz de consultarla sin cargarla completamente al contexto.

**Input:** PROJECT_MODEL, consultas agent-first diseñadas antes del schema, fixtures legacy y repos fixtures.

**Output:** JSON schema canónico, validación estructural y semántica, identidad de KnowledgeUnit, evidence refs, dimensiones 7Q, scopes tipados, validity, authority, confidence, relaciones, índices derivados, Query Layer pública, respuestas compactas, fixtures y base reproducible del eval runner.

**Invariants:** JSON es storage y la CLI es reading; ningún lookup determinista usa LLM; índices derivados no son canon; legacy permanece intacto; provenance sobrevive a respuestas compactas; un eval fallido devuelve exit no-cero.

**Deterministic checks:** lookup por ID, dimensión, scope y múltiples scopes; supersesión; stale a `snapshot.as_of`; conflicts; `not-required`; refs rotas; resultado vacío; budgets; orden estable; misma entrada produce la misma salida; invalid fixtures se rechazan.

**Evals:** suite pequeña de queries y context por target sin llamar a un agente; EvalRun se identifica por digest reproducible.

**Completion gate:** schema, fixtures, tests y eval runner pasan; `contexxxt model validate`, `query` y `context` funcionan sobre el propio repositorio; package contents incluyen schema. La publicación npm y el smoke de instalación limpia siguen siendo gates separados.

**Fuera de alcance:** automatic learning, skill synthesis, Codebase Memory, full LLM task resolver y autonomous knowledge promotion.

## Phase 2 — `contexxxt inspect` + Native provider

**Status:** implemented in source as `0.2.0-alpha.2`; publication and clean-environment install are not claimed.

**Objective:** producir evidencia útil read-only sin dependencia externa.

**Input:** ruta del repo, Git, manifests, configs, CI, tests, docs, instructions y skills.

**Output:** `InspectionReport` + Evidence normalizada con scope, revision, coverage y gaps.

**Invariants:** cero escrituras; no ejecutar scripts del repo por defecto; no leer valores de secretos; no afirmar completitud.

**Deterministic checks:** detección de Git/worktrees, packages/workspaces, commands/docs/tests/CI/instructions; repos sin manifest, existente y monorepo; conflicto potencial por scope; budget; output no-clobber; misma entrada + reloj produce el mismo report.

**Evals:** fixtures pequeños con inventario conocido y prueba de dogfood read-only. La medición formal de precision/recall y evidencia irrelevante se conserva como gate acumulativo antes del RC.

**Completion gate:** completado para el alcance Native actual: funciona en Node, monorepo, instrucciones conflictivas, repo sin manifest, repo con `.contexxxt/` y este repositorio; valida toda Evidence contra el schema 1.1.0 y deja el árbol sin cambios. Otros ecosystems reconocidos todavía reciben sólo detección de presencia y deben declarar cobertura limitada cuando se estructuren.

## Phase 3 — Project Model Builder

**Status:** implemented in source as `0.2.0-alpha.3`; publication and clean-environment install are not claimed.

**Objective:** transformar un InspectionReport validado en un Project Model útil y actualizarlo sin destruir conocimiento válido.

**Input:** InspectionReport, schema/Query Layer de Phase 1 y Project Model existente opcional.

**Output:** `model build`, snapshot versionado, Evidence normalizada, KnowledgeUnits justificadas y proposals para reconciliaciones ambiguas.

**Invariants:** inspect y build siguen separados; observed fact, inference, declared rule, decision, constraint y procedure no se confunden; IDs estables; unknown antes que invención; update no-clobber y provenance preservada.

**Deterministic checks:** build reproducible, schema validation, merge idempotente, evidence dedup/reobservation, referencias válidas, contradicción estructural y proposal no-clobber.

**Evals:** precision de KnowledgeUnits construidas, factualidad contra Evidence, duplicación, preservación de conocimiento manual válido y tasa de proposals ambiguas.

**Completion gate:** completado para el alcance conservador actual: contexxxt construye y revalida su propio modelo desde `inspect`, una segunda ejecución queda `unchanged`, las unidades humanas sobreviven, el drift generado produce proposals y ninguna interpretación sin soporte se marca como observed fact.

## Phase 4 — 7Q Resolver, Context Compiler y causalidad

**Status:** implemented in source as `0.2.0-alpha.4` with a deterministic fallback; behavioral host comparison remains a release gate.

**Objective:** resolver una tarea por scope e intención, compilar un Context Packet presupuestado y completar las relaciones causales/revision-aware que el recorrido necesite.

**Input:** Project Model construido, target, intención, decisiones, constraints, opciones, consecuencias, bindings e historia Git.

**Output:** TaskResolution 7Q, preguntas mínimas, assumptions, Context Packet, explicación de inclusión/omisión, payloads causales y drift por revisión.

**Invariants:** Query Layer sigue determinista y Resolver semántico; no cargar el modelo completo; budget obligatorio; cada conclusión tiene Evidence o etiqueta de inferencia; Rationale no es dependencia ni línea de producto; authority no se confunde con confidence.

**Deterministic checks:** scope/applicability, estados 7Q, stale/conflict, budget, packet digest estable, supersession, competing authority, revision mismatch y retención de constraints gobernantes.

**Evals:** 7Q precision/recall, evidence precision, question precision, tokens/context loaded, arquitectura/constraint adherence y conflictos correctamente resueltos o escalados.

**Completion gate:** tareas acotadas producen packets reproducibles que al menos mantienen task pass rate frente al baseline sin exceder budget; casos causales contradictorios y cambios de commit producen resultados explicables.

## Phase 5 — Optional Codebase Memory provider

**Status:** implemented in source as `0.2.0-alpha.5`; structural breadth is measured, while task-quality and ContextPacket comparison remain release gates.

**Objective:** mejorar visión estructural sin degradar el modo Native.

**Input:** capability descriptor, index/snapshot y consultas estructurales.

**Output:** adapter, ProviderEvidence, coverage/warnings y merge/fallback.

**Invariants:** core sin dependencia; capability negotiation; provider provenance en cada conclusión; ausencia en graph no prueba inexistencia.

**Deterministic checks:** unavailable/stale/partial/truncated responses, capability mismatch, fallback Native, merge conflict.

**Evals:** misma task suite Native vs Native+adapter; arquitectura, tool calls, tokens, tiempo y task pass rate.

**Completion gate:** el adapter mejora al menos una medida estructural o de eficiencia sin regresión material y todas las tareas soportadas siguen funcionando sin él.

## Phase 6 — Drift, observations and learning candidates

**Status:** implemented in source as `0.2.0-alpha.6` for structured observations, revision-only drift, candidate lifecycle and eval-gated non-canonical proposals; deeper file/symbol drift remains a release gate.

**Objective:** cerrar el ciclo de ejecución sin promover aprendizaje automáticamente.

**Input:** execution results, verification, model snapshot y cambios de revisión.

**Output:** Observational Evidence, drift events y LearningCandidates con scope/risk.

**Invariants:** transcripts no se guardan por defecto; secretos redactados; errores one-off no se vuelven reglas; outputs del usuario se preservan.

**Deterministic checks:** dedup de observaciones, expiry/revision drift, candidate lifecycle, rejection retention.

**Evals:** candidatos correctos vs ruido, false promotion = 0 porque promoción sigue desactivada, regresiones de privacy.

**Completion gate:** sesiones fixture producen candidatos explicables y ningún cambio canónico sin un gate de evaluación.

## Phase 7 — Skill synthesis

**Status:** implemented in source as `0.2.0-alpha.7`; one real candidate was synthesized and evaluated, while a smaller-artifact candidate was rejected before writing.

**Objective:** generar una skill candidata solo cuando sea la forma mínima correcta.

**Input:** procedure/knowledge candidate estable, target provider y eval cases.

**Output:** candidate bundle con router corto, referencias/scripts/assets/evals necesarios, manifest y provenance.

**Invariants:** no skill por defecto; progressive disclosure; no duplicate canon; no-clobber; target-specific adapter separado del conocimiento.

**Deterministic checks:** structure/schema, broken refs, size/context budget, trigger metadata, idempotent regeneration, drift detection.

**Evals:** positive/negative/boundary routing, procedure compliance y comparación contra regla/procedimiento más pequeño.

**Completion gate:** al menos una candidata real se sintetiza y compara, al menos una se rechaza correctamente, y promoción sólo ocurre si supera baseline/context. El dogfood cumplió el gate sin promoción: la skill no mejoró sobre el ContextPacket.

## Phase 8 — Behavioral eval runner + promotion

**Status:** implemented as a provider-aware foundation in `0.2.0-alpha.8`; one Codex case is measured, and Claude Code execution is recorded as blocked rather than scored.

**Objective:** automatizar comparación baseline/context/candidate y tomar decisiones de promoción auditables.

**Input:** datasets versionados, agents, packets/candidates y rubrics.

**Output:** EvalRuns reproducibles, reports comparativos, promotion/rejection decision y regression suite.

**Invariants:** claims por provider; checks críticos dominan score; costo se reporta; no cherry-picking de casos.

**Deterministic checks:** run manifests, environment capture, result digests, reruns, threshold versioning.

**Evals:** task pass rate, quality, hallucination, adherence, tokens, context, tools, time y regressions.

**Completion gate:** decisiones de promoción se reproducen desde artifacts y una regresión crítica bloquea release. El primer run reproducible rechazó promover la skill porque no mejoró context-only; ampliar el dataset sigue siendo gate de evidencia, no de arquitectura.

## Phase 9 — Codex / Claude Code validation

**Status:** implementation complete in `0.2.0-rc.1`; adapters, migration, deterministic tests, `npm pack` and clean tarball installation pass. npm currently serves `0.1.0`, and remote `npx contexxxt@0.1.0` works. Codex and Claude Code behavioral execution both pass on the two-case suite. The 0.2 RC has not been published.

**Objective:** demostrar el flujo completo en ambos targets sin fingir paridad.

**Input:** release candidate, clean environments, shared datasets y target adapters.

**Output:** matrices de capacidad, resultados por provider, install/npx smoke y guía de limitaciones.

**Invariants:** provider-neutral core; resultados separados; ninguna capability se declara sin prueba actual; clean-user safety.

**Deterministic checks:** package contents, `npm pack`, `npx`, install/uninstall/no-clobber y adapter output validation.

**Evals:** mismas familias de tareas ejecutadas por separado en Codex y Claude Code, más provider-specific boundaries.

**Completion gate:** ambos targets completan el vertical slice en entorno limpio o se publica soporte explícitamente parcial con evidencia del límite.

## Siguiente paso exacto

Renovar la autenticación de Claude Code y repetir el mismo Behavioral EvalRun. Si pasa, fijar `0.2.0-rc.1`, repetir el clean-install smoke sobre ese tarball exacto y solicitar autorización explícita antes de publicar.
