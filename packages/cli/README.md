# contexxxt CLI

CLI local y sin telemetría. La versión publicada 0.1 audita e instala la fundación legacy; la fuente `0.2.0-rc.1` implementa el ciclo local desde inspección hasta contexto, learning candidates, skills candidatas, evals y adapters de agentes.

## Uso con npx

Requiere Node.js 22 o superior. No necesita instalación global.

```bash
npx contexxxt --help
npx contexxxt audit .
npx contexxxt init .
npx contexxxt doctor .
```

`audit` es read-only. `init` crea actualmente una estructura `.contextos/` basada en plantillas. Las escrituras administradas son idempotentes, hash-aware y no-clobber: si un archivo del usuario entra en conflicto, la CLI conserva el original y genera una propuesta.

## Comandos 0.1

```text
init         inicializa sin sobrescribir
audit        inventario de solo lectura
doctor       valida estructura, vigencia y drift
add-space    crea un scope configurable legacy
sync         genera un adaptador Codex o Claude Code
export       genera un bloque para una superficie de chat
status       resume la instancia
prompt       imprime un prompt incluido en el runtime
```

También puede ejecutarse con `pnpm dlx contexxxt`.

## Core local · fuente 0.2.0-rc.1

Estos comandos existen en el repositorio y todavía no se presentan como publicados en npm:

```bash
pnpm contexxxt model validate --root .
pnpm contexxxt inspect .
pnpm contexxxt inspect . --json
pnpm contexxxt inspect . --output .contexxxt/inspection-report.json
pnpm contexxxt model build --root .
pnpm contexxxt model build --root . --inspection .contexxxt/inspection-report.json
pnpm contexxxt resolve --root . --target src/index.js --intent "Add validation"
pnpm contexxxt query catalog --root .
pnpm contexxxt query dimension why --root . --view summary
pnpm contexxxt query scope packages/cli/src/query --root .
pnpm contexxxt query knowledge contexxxt.model.self-reading --root .
pnpm contexxxt context packages/cli/src/query/query.mjs --root .
pnpm contexxxt structural capabilities .
pnpm contexxxt structural inspect . --provider native
pnpm contexxxt structural compare .
pnpm contexxxt observe ingest .contexxxt/inbox/run.json --root .
pnpm contexxxt learning list --root . --status supported
pnpm contexxxt drift .
pnpm contexxxt skill validate .contexxxt/generated/skills/contexxxt-core-development
pnpm contexxxt eval packages/cli/test/fixtures/project-model/query-suite.json --root .
pnpm contexxxt eval behavioral evals/core-behavioral.json --host codex --variant baseline,context,candidate --max-cases 1 --output .contexxxt/evals/local.json
pnpm contexxxt agent status codex --root .
pnpm contexxxt migrate status --root .
```

El modelo canónico vive por defecto en `.contexxxt/project-model.json`. `query` y `context` construyen índices derivados y devuelven resultados pequeños; `--view`, `--limit`, `--max-bytes`, `--depth`, `--include`, `--exclude`, `--dimensions` y `--at` controlan la recuperación. `inspect` no ejecuta scripts ni modifica el modelo. `structural` usa Native por sí solo y puede consumir Codebase Memory mediante su CLI o un `--snapshot` entregado por el host; nunca crea ni actualiza el índice. `observe` acepta verificación estructurada, no transcripts; `learning promote` exige una comparación positiva y genera una propuesta separada, no una mutación del modelo.

## Frontera honesta

La versión publicada 0.1 **no** implementa este core. La fuente 0.2 alpha implementa storage, validación, inspección, construcción conservadora, TaskResolution, ContextPacket, candidatos, síntesis de skills, evals conductuales, adapters Codex/Claude y migración explícita. El resolver local sigue siendo un fallback determinista. Existe un resultado positivo acotado en Codex y otro equivalente en Claude Code; ambos provienen de la misma suite de dos casos y no constituyen evidencia general de mejora.

Contrato, arquitectura, roadmap y estado real: [github.com/Ragosorio/contexxxt](https://github.com/Ragosorio/contexxxt).

## Privacidad

La CLI no envía telemetría, no escribe memorias cloud y no debe almacenar valores de secretos. `AGENTS.md`, `CLAUDE.md` y las skills generadas son instrucciones; no son una frontera de seguridad.

[MIT](LICENSE)
