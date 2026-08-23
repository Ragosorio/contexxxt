---
title: Referencia CLI
description: Comandos, opciones, salida y códigos de contexxxt.
---

## Uso

```bash
npx contexxxt <command> [path] [options]
```

La CLI no tiene telemetría ni dependencias runtime.

## Comandos

### `init [path]`

Crea el núcleo `.contextos/` y plantillas neutrales. Detecta si la carpeta está vacía o existente.

Opciones:

- `--dry-run`: lista operaciones sin escribir.
- `--json`: salida determinista.
- `--provider <id>`: genera un adaptador inicial; repetible.

No existe `--force`.

### `audit [path]`

Inventario de solo lectura: instrucciones, skills, agentes, estado, fuentes, tamaños, duplicados, fechas y superficies sensibles.

Opciones: `--json`.

### `doctor [path]`

Valida manifiesto, archivos requeridos, schemas, fechas, drift de derivados y posibles contradicciones. No repara.

Opciones: `--json`.

### `add-space <slug>`

Crea `.contextos/spaces/<slug>/SPACE.md`.

Opciones:

- `--path <dir>`: raíz de la instancia.
- `--json`.

El slug admite minúsculas, números y guiones.

### `sync [path]`

Genera adaptadores administrados desde el núcleo.

Opciones:

- `--provider codex|claude-code|chatgpt|claude-chat|cowork`.
- `--dry-run`.
- `--json`.

### `prompt <name>`

Imprime un prompt para uso sin instalación: `discover`, `design`, `apply`, `session`, `memory` o `diagnose`.

### `export [path] --provider <id>`

Genera un bloque manual dentro de `.contextos/generated/<provider>/` para `chatgpt`, `claude-chat` o `cowork`. No modifica cuentas ni memorias cloud.

Proveedores: `chatgpt`, `claude-chat` o `cowork`.

Opciones:

- `--provider <id>`: requerido; repetible.
- `--json`.

### `status [path]`

Resumen de espacios, proyectos y cantidad de hallazgos actuales de `doctor`.

## Códigos de salida

| Código | Significado |
| --- | --- |
| `0` | correcto, sin hallazgos bloqueantes |
| `1` | hallazgos, conflictos o drift |
| `2` | uso inválido o error de ejecución |

## JSON

Con `--json`, stdout contiene un solo objeto JSON y los mensajes humanos van a stderr. Las listas se ordenan para permitir diffs estables. La salida no incluye valores de posibles secretos.

## Rutas peligrosas

`init`, `sync` y `add-space` rechazan `/`, el directorio personal completo y rutas administradas que sean symlinks. Usa una carpeta específica.
