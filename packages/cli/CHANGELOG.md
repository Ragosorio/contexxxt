# Changelog

## 0.2.0-rc.1 — Unreleased

- añade adapters mínimos `agent install|status|uninstall` para Codex y Claude Code;
- preserva instrucciones user-owned mediante propuestas y desinstala sólo archivos con digest administrado;
- añade migración explícita y preservadora de `.contextos/` a `.contexxxt/`;
- completa dogfood en un segundo monorepo y corrige summaries sobredimensionados y caches generados.
- endurece el gate Claude: stdin cerrado, cwd/timeout verificables, status y clasificación de error explícitos, y métricas no disponibles como `null` en vez de equivalencias inventadas;
- corrige la clasificación de errores del host Claude: un fallo de transporte se clasifica desde el error de transporte y ya no desde el texto de la respuesta del modelo, que podía contener `json` o `timeout` y producir `invalid-host-output` o `timeout` falsos; el payload sólo gobierna la clasificación cuando el host reporta `is_error`;
- hace cumplir el timeout del transporte compartido: tras `SIGTERM` se escala a `SIGKILL` con gracia de 5 s, de modo que un host que ignora `SIGTERM` ya no extiende un presupuesto de 90 s a decenas de minutos.

## 0.2.0-alpha.8

- añade runner conductual `baseline`, `context` y `candidate` para Codex y Claude Code;
- registra configuración, revisión, métricas, output digest y errores específicos del host;
- demuestra una mejora acotada con ContextPacket en un caso Codex y rechaza promover la skill sin ganancia adicional.

## 0.2.0-alpha.7

- sintetiza bundles de skills sólo desde candidatas soportadas y justificadas;
- mantiene `SKILL.md` delgado, genera routing/evals/manifest y valida progressive disclosure;
- rechaza candidatas cuando una salida menor es suficiente y conserva `generated != promoted`.

## 0.2.0-alpha.6

- añade schemas versionados de ExecutionObservation y LearningCandidate store;
- expone `observe`, `learning` y `drift`;
- deduplica observaciones, eleva soporte sólo con repetición y bloquea secretos probables;
- exige eval positivo para promoción y genera propuestas no canónicas;
- dogfoodea el pipeline sin modificar silenciosamente el Project Model.

## 0.2.0-alpha.5

- añade providers estructurales Native y Codebase Memory con negociación de capacidades;
- expone `structural capabilities`, `structural inspect` y `structural compare`;
- normaliza snapshots CLI/MCP a Evidence con provider, coverage y provenance;
- mantiene fallback Native cuando el ejecutable, índice o capability opcional falla;
- mide amplitud/costo estructural sin afirmar mejora de calidad de tarea.

## 0.2.0-alpha.4

- Añade Project Model JSON canónico y schema `1.1.0`.
- Añade validación semántica e índices derivados regenerables.
- Añade `model validate`, `query`, `context` y un query eval runner determinista.
- Añade respuestas compactas con provenance, orden estable y budgets.
- Añade `inspect` read-only con Evidence normalizada, revisión Git, coverage, salida humana/JSON y persistencia explícita no-clobber.
- Añade fixtures y dogfood para Node, monorepo, instrucciones por scope, repos sin manifest y estado `.contexxxt`.
- Añade `model build`, reconciliación idempotente, preservación de conocimiento humano y proposals ante drift generado.
- Evita que el Project Model dependa de releer su propio archivo canónico.
- Añade `resolve`, schemas de TaskResolution/ContextPacket, budgets y preguntas mínimas.
- Añade selección semántica lexical provider-neutral y fallback 7Q explícito, sin fingir una integración LLM.
- Conserva los comandos y el runtime 0.1; aprendizaje y skill synthesis siguen pendientes.

## 0.1.0 — 2026-08-22

- Primera publicación de `contexxxt`.
- CLI sin telemetría para iniciar, auditar, diagnosticar y sincronizar Context OS.
- Runtime neutral con adaptadores para Codex, Claude Code, ChatGPT, Claude Chat y Cowork.
- Escrituras idempotentes y sin sobrescritura silenciosa.
