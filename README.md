# contexxxt

`contexxxt` es un sistema operativo de contexto para personas que trabajan con ChatGPT, Codex, Claude, Claude Code y Cowork. Convierte una petición humana —incluso incompleta— en un paquete pequeño de contexto verificable: espacio, fuentes, autoridad, vigencia, límites y condición de cierre.

No intenta crear una memoria universal. Mantiene una fuente canónica neutral y genera adaptadores pequeños para cada superficie.

## Probarlo

Requiere Node.js 22 o superior.

```bash
pnpm install
pnpm build
pnpm test
```

Para desarrollar la CLI desde este repositorio:

```bash
pnpm contexxxt help
pnpm contexxxt audit .
```

Para usar el paquete publicado:

```bash
npx contexxxt init
npx contexxxt audit .
npx contexxxt doctor .
```

Con pnpm puedes ejecutar lo mismo con `pnpm dlx contexxxt`.

## Qué incluye

- Landing y documentación en Astro 7 + Tailwind CSS 4.
- CLI idempotente y sin sobrescritura silenciosa.
- Skill-router para aceptar tareas en lenguaje natural.
- Plantillas neutrales para identidad, privacidad, memoria, espacios y proyectos.
- Adaptadores para Codex, Claude Code y exports manuales para productos de chat.
- Auditoría, diagnóstico, doctor, checkpoints y handoffs.
- Evaluaciones reproducibles para contaminación, memoria y drift.

## Límites

- No escribe en memorias cloud ni configura cuentas por ti.
- No convierte `AGENTS.md`, `CLAUDE.md` o una skill en una frontera de seguridad.
- No guarda secretos, opiniones exploratorias ni datos de terceros como memoria.
- No sobrescribe instrucciones existentes: propone un patch cuando hay conflicto.
- No promete paridad entre proveedores; cada adaptador declara sus capacidades.

## Estructura

```text
src/                    landing y documentación
packages/cli/           CLI publicable
packages/cli/runtime/   skill, agentes y plantillas canónicas
schemas/                contratos JSON
evals/                  casos y rúbrica
docs/                   decisiones del propio producto
```

Lee [PRODUCT.md](docs/PRODUCT.md), [DESIGN.md](docs/DESIGN.md) y [ARCHITECTURE.md](docs/ARCHITECTURE.md) antes de cambiar el contrato del producto.

## Privacidad del autor

La configuración personal usada para desarrollar contexxxt vive fuera de este repositorio. Los ejemplos públicos son ficticios y no contienen memorias, cuentas, auditorías o proyectos reales del autor.

## Licencia

[MIT](LICENSE). contexxxt se inspira en la claridad de producto y la arquitectura de skills de [Impeccable](https://impeccable.style/), sin reutilizar su identidad visual, assets o contenido.
