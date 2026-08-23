---
title: Configura memoria
description: Promueve patrones útiles sin convertir una inferencia en verdad permanente.
---

La memoria es una capa de recuerdo. No es el lugar para reglas obligatorias ni para el estado completo de un proyecto.

## Qué merece sobrevivir

Guarda un dato solo si:

1. seguirá siendo útil mañana;
2. cambia una recomendación futura;
3. tiene un alcance claro;
4. puedes atribuir su origen;
5. tiene revisión o caducidad;
6. el usuario aprobó el texto exacto.

## Estados

- `candidate`: una observación plausible, todavía no confirmada.
- `confirmed`: evidencia suficiente y aprobación explícita.
- `superseded`: reemplazada por una versión nueva.
- `expired`: ya no debe recuperarse.
- `rejected`: nunca fue cierta o no debe almacenarse.

## Prompt de curación

```text
Audita una posible memoria. No la guardes todavía.

Texto u observación: [pegar]

1. Separa afirmación, evidencia, contraevidencia e inferencia.
2. Explica qué recomendación futura cambiaría si fuera cierta.
3. Propón alcance, sensibilidad, fuente, confianza y fecha de revisión.
4. Si la evidencia no basta, déjala como candidata y dime qué observar.
5. Muéstrame el texto exacto que se guardaría.
6. Espera mi confirmación explícita antes de escribir o modificar memoria.
```

## Esquema recomendado

```yaml
id: mem-20260822-ejemplo
scope: personal
type: pattern
status: candidate
claim: "El usuario tiende a estimar una fase sin incluir verificación."
evidence: []
counterevidence: []
sample_size: 0
source: user-explicit
observed_at: 2026-08-22
verified_at: null
review_on: 2026-09-22
confidence: low
sensitivity: private
allowed_surfaces: []
```

## Nunca guardar

- secretos o credenciales;
- datos personales de terceros;
- contenido dicho en lluvia de ideas;
- juicios sobre personas;
- cifras que cambian rápidamente;
- información de trabajo en una cuenta personal;
- una conclusión inferida como si fuera cita del usuario.

## Auditoría periódica

Revisa memorias personales cada mes y las sensibles con mayor frecuencia. Etiqueta cada entrada: sigue cierta, necesita revisión, ya no aplica o nunca fue cierta.
