---
schema: contextos/memory-policy/v1
status: draft
created_at: __CREATED_AT__
review_on: __REVIEW_ON__
owner: user
---

# Memory policy

La memoria es una capa de recuerdo, no la única fuente para reglas obligatorias.

## Promoción

Una entrada pasa de `candidate` a `confirmed` solo cuando:

1. cambia una recomendación futura;
2. tiene evidencia atribuible y contraevidencia considerada;
3. el alcance y las superficies permitidas son válidos;
4. incluye revisión o expiración;
5. el usuario aprobó el texto exacto.

## Esquema de entrada

```yaml
id: mem-YYYYMMDD-slug
scope: __SCOPE__
type: pattern
status: candidate
claim: "__CLAIM__"
evidence: []
counterevidence: []
sample_size: 0
source: user-explicit
observed_at: __CREATED_AT__
verified_at: null
review_on: __REVIEW_ON__
confidence: low
sensitivity: private
allowed_surfaces: []
supersedes: null
```

Estados: `candidate`, `confirmed`, `superseded`, `expired`, `rejected`.
