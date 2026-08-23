---
title: Archivos y autoridad
description: Contrato de cada archivo generado por Context OS y quién puede modificarlo.
---

## Núcleo canónico

| Archivo | Pregunta que responde | Dueño |
| --- | --- | --- |
| `core/IDENTITY.md` | qué decide el agente | usuario/equipo |
| `core/PRIVACY.md` | qué no debe cruzar o persistir | usuario/equipo |
| `core/MEMORY_POLICY.md` | qué puede promoverse a memoria | usuario/equipo |
| `spaces/<id>/SPACE.md` | qué pertenece a este contexto | usuario/equipo |
| `projects/<id>/PROJECT.md` | contrato estable del proyecto | equipo |
| `projects/<id>/STATE.md` | estado actual verificado | agente, revisable |
| `projects/<id>/SOURCES.md` | fuentes, autoridad y vigencia | equipo/agente |
| `projects/<id>/DECISIONS.md` | decisiones aceptadas y razón | equipo |
| `projects/<id>/HANDOFF.md` | continuidad mínima | agente |

## Derivados

Los adaptadores de proveedor y exports llevan un encabezado:

```text
generated-from: .contextos/...
schema-version: 1
template-version: 1
content-sha256: ...
```

El manifiesto conserva el hash aplicado. Si el usuario edita el derivado, Context OS no lo borra. Coloca la nueva versión propuesta en `patches/`.

## Autoridad sugerida

```text
consentimiento y privacidad
  > decisiones verificadas
  > fuentes canónicas vigentes
  > estado/handoff
  > patrones confirmados
  > memoria nativa
  > transcript y resultados crudos
```

Esta es una política de Context OS. No describe ni reemplaza la jerarquía interna del modelo.

## Vigencia

Todo dato que cambia debe incluir una de estas señales:

- `verified_at` para última comprobación;
- `review_on` para próxima revisión;
- `expires_at` para dejar de recuperarlo automáticamente;
- `supersedes` para reemplazar otra entrada.

## Archivos que nunca administra

- `.env` y variantes;
- `settings.local.json`;
- credenciales, cookies o tokens;
- memorias internas del proveedor;
- archivos fuera de la raíz seleccionada;
- cualquier symlink que salga del proyecto.
