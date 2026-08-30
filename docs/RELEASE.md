# Release closure — 0.2.0

Este documento es el gate operativo único. Claude Code completó el mismo contrato conductual que Codex el 2026-08-29 y la versión avanzó a `0.2.0-rc.1`. Publicar queda fuera de este gate y siempre requiere autorización humana explícita.

## Pre-Claude

- [x] `pnpm check`: suite CLI y contenido pasan.
- [x] `pnpm build`: build estático pasa.
- [x] `pnpm contexxxt model validate --root .`: Project Model válido.
- [x] Dogfood público: `inspect`, `model build`, `query`, `context` y `resolve` pasan; un segundo build queda `unchanged`.
- [x] Regresiones del segundo repositorio: summaries con muchos comandos y caches generados están cubiertos por tests.
- [x] Codex ejecuta `baseline`, `context` y `candidate` con la suite `evals/core-behavioral.json`.
- [x] La skill `contexxxt-core-development` sigue generada y no promovida: candidate vs context tiene delta de calidad `0` y mayor costo.
- [x] `npm pack` y auditoría del tarball pasan; instalación limpia del tarball alpha funciona.
- [x] `git diff --check` pasa y la versión raíz/CLI estaba en `0.2.0-alpha.9` al abrir el gate.

## Claude gate

Prerequisito externo: la sesión OAuth de Claude Code debe estar autenticada mediante su flujo normal de login. No intentar bypass, copiar tokens ni modificar el adapter para evitar autenticación.

Desde la raíz del repositorio:

```bash
pnpm contexxxt eval behavioral evals/core-behavioral.json \
  --host claude-code \
  --variant baseline,context,candidate \
  --agent-model sonnet \
  --timeout-ms 90000 \
  --output .contexxxt/evals/claude-alpha9-release-gate.json \
  --root .
```

El gate pasa únicamente si:

- las tres variantes de todos los casos terminan con `status: "completed"`;
- `execution_errors` es `0`;
- el EvalRun queda persistido atómicamente en la ruta indicada;
- provider, versión, modelo observable, commit, task, variant, score, context bytes y duración están presentes;
- tokens/tool calls son números sólo cuando Claude los expone; de lo contrario son `null`;
- no existe ningún `not-measurable-*` ni fallo silencioso;
- candidate se compara contra context, no contra baseline.

Si falla por autenticación, timeout, transporte o output inválido, mantener alpha.9. Corregir solamente el defecto reproducido, añadir una regresión y repetir primero `pnpm check`.

## Estado del Claude gate (2026-08-30, Claude Code 2.1.251, modelo `claude-sonnet-5`)

El gate se ejecutó cinco veces. **Pasa sobre el artefacto actual**, pero sólo después de corregir dos defectos reales de contexxxt que la primera ejecución limpia había ocultado. La versión avanzó a `0.2.0-rc.1`.

| Run | Momento | `execution_errors` | baseline | context | candidate | Duración máx. |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | pre-fix | 0 | `0.475` | `1.00` | `1.00` | 13 s |
| 2 | pre-fix | 3 | `0.375` | `0.50` | `0.50` | 1740 s |
| 3 | pre-fix | 1 | `0.375` | `1.00` | `1.00` | 27 s |
| 4 | post-fix | 0 | `0.475` | `1.00` | `1.00` | 12 s |
| 5 | post-fix | 0 | `0.475` | `1.00` | `1.00` | 16 s |

Una sola ejecución limpia no era evidencia suficiente: el run 2 y el run 3 no la reprodujeron. Los runs 4 y 5, posteriores a las correcciones, son idénticos caso por caso (`3/4`, `4/4`, `4/4`, `1/5`, `5/5`, `5/5`).

### Defectos corregidos (demostrados por el gate)

1. **Clasificación de errores desde el texto de la respuesta.** La rama Claude de `createHostAdapter` sustituía el error de transporte por `payload.result`. `classifyExecutionError` recibía entonces la *respuesta del modelo* y la analizaba por patrones: una respuesta correcta que contenía `.contexxxt/project-model.json` se clasificaba como `invalid-host-output`, y una que mencionaba «timeout» como `timeout`. La rama Codex no tenía el defecto porque conserva `error.stderr || error.message`. Corregido: el payload gobierna la clasificación sólo cuando el host reporta `is_error`; en cualquier otro fallo manda el error de transporte. Esto preserva la clasificación `authentication-error` del bloqueo OAuth original.
2. **Timeout no aplicado.** `runClosed` enviaba `SIGTERM` y esperaba `close` indefinidamente. Un host que ignora `SIGTERM` convertía un presupuesto de 90 s en 15–29 minutos (runs de 923 s, 1740 s y 912 s). Corregido con escalado a `SIGKILL` tras 5 s de gracia; el transporte ahora resuelve en ~5,5 s en la regresión determinista.

Ambos tienen regresión determinista en `packages/cli/test/behavioral-eval.test.mjs`. La suite pasa 93/93.

### Defecto del host, no corregido aquí

Claude Code emite de forma intermitente contenido adicional en stdout después del JSON de resultado, lo que rompe `JSON.parse`. Ocurrió una vez en ~25 ejecuciones previas a las correcciones y ninguna en las 12 posteriores; no se reprodujo en 7 sondeos directos. contexxxt lo clasifica correctamente como `invalid-host-output` y se niega a interpretar salida parcial. No se relajó el parser: tolerar salida malformada enmascararía errores reales del host. El gate puede por tanto fallar de forma intermitente por una causa ajena a contexxxt.

### Resultado del artefacto vigente (runs 4 y 5)

- Context Value: `+0.525` frente a baseline; claim `measured-positive-on-this-run`.
- Skill Value: `0` frente a context, con `+1347` tokens y `+2918` bytes; claim `no-measured-quality-difference`. La candidata `contexxxt-core-development` **no se promueve**.
- Tool calls quedan `null`: Claude Code no los expone en `--output-format json`; no se estiman.
- Los tokens incluyen creación de caché y no son comparables uno a uno con los de Codex.
- La suite está saturada en `1.00` para context: por construcción no puede detectar una skill que mejore un puntaje ya perfecto, así que el delta `0` es tanto un límite del instrumento como una medición.

Artifacts: `.contexxxt/evals/claude-postfix-1.json` y `claude-postfix-2.json` (vigentes), más `claude-alpha9-release-gate.json`, `claude-rc1-reproducibility.json`, `claude-rc1-repro-2.json` y `claude-alpha9-release-gate.blocked-auth.json` conservados como historia. El de Codex sigue siendo `.contexxxt/evals/codex-alpha9-ground-truth.json`.

## RC gate

Ejecutado tras el Claude gate exitoso:

1. cambiar versión raíz y CLI a `0.2.0-rc.1`;
2. ejecutar `pnpm check && pnpm build && git diff --check`;
3. reconstruir y validar el Project Model; el segundo build debe ser `unchanged`;
4. ejecutar `npm pack` desde `packages/cli` e inspeccionar el tarball exacto;
5. instalar ese tarball en un directorio temporal limpio;
6. ejecutar allí `npx --no-install contexxxt version`, `inspect`, `model build`, `model validate`, `query`, `context`, `resolve` y eval determinista;
7. verificar adapters Codex/Claude, migración `.contextos/`, no-clobber, uninstall por digest y archivos residuales;
8. confirmar que el tarball contiene CLI, schemas, runtime, adapters y README, y excluye secretos, caches, eval runs locales, paths personales y temporales;
9. no publicar: entregar el artefacto y esperar autorización.

## Handoff exacto para Claude Code

- Base HEAD al preparar el gate: `8a2b12a56d3a52d5c426ce12999cbe842eb76a86`; el worktree contiene cambios no comprometidos de `0.2.0-alpha.9` que no deben descartarse.
- Ejecutar primero `git status --short`, `node packages/cli/bin/contexxxt.mjs version` y `pnpm contexxxt model validate --root .`.
- Ejecutar exactamente el comando de **Claude gate** anterior con la suite versionada `evals/core-behavioral.json`.
- Éxito: artifact presente, `execution_errors: 0`, todos los resultados `completed`, sin claims `not-measurable-*`.
- Fallo: conservar el artifact, aislar el problema, cambiar sólo código/test/documentación directamente relacionados y repetir el gate completo.
- No cambiar arquitectura, providers, Project Model canónico, suite, skill, landing ni versión para hacer pasar el benchmark.
- `0.2.0-rc.1` queda permitido sólo cuando Claude pase y todos los gates pre-Claude sigan verdes.
