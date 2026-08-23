---
title: Esquemas
description: Contratos de manifiesto, espacio, proyecto y memoria.
---

Los schemas JSON viven en `/schemas`. Cada documento estructurado incluye una versión para permitir migraciones explícitas.

## Manifest

```json
{
  "$schema": "https://raw.githubusercontent.com/Ragosorio/contexxxt/main/schemas/manifest.schema.json",
  "schema_version": 1,
  "context_os_version": "0.1.0",
  "created_at": "2026-08-22",
  "updated_at": "2026-08-22",
  "mode": "existing",
  "managed_files": []
}
```

Cada archivo administrado conserva ruta, proveedor, template, versión y hashes aplicado/generado.

## Space

Campos clave:

- `id`;
- `purpose`;
- `belongs` y `does_not_belong`;
- `allowed_accounts` y `allowed_surfaces`;
- `sensitivity`;
- `canonical_sources`;
- `review_on`.

## Project

Separa el contrato estable de los archivos mutables. `PROJECT.md` contiene propósito, alcance, autoridad y criterios. `STATE.md` contiene el presente y puede reemplazarse.

## Memory

```json
{
  "id": "mem-20260822-example",
  "scope": "personal",
  "type": "pattern",
  "status": "candidate",
  "claim": "...",
  "evidence": [],
  "counterevidence": [],
  "sample_size": 0,
  "source": "user-explicit",
  "observed_at": "2026-08-22",
  "verified_at": null,
  "review_on": "2026-09-22",
  "confidence": "low",
  "sensitivity": "private",
  "allowed_surfaces": []
}
```

Una candidata permite `verified_at: null`. Para pasar a confirmada requiere evidencia definida por la política, aprobación del usuario y una superficie permitida válida.

## Migraciones

Una versión nueva nunca reescribe silenciosamente contenido humano. `doctor` detecta schema antiguo; `update` futuro generará un plan y patch revisable.
