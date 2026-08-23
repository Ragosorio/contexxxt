---
title: Diseña tus espacios
description: Separa objetivos, cuentas y sensibilidad sin imponer categorías universales.
---

Un espacio es una frontera de contexto. No es necesariamente una carpeta ni una cuenta; representa un conjunto de tareas que comparten propósito, autoridad, fuentes y nivel de sensibilidad.

## Cuándo separar

Crea otro espacio cuando cambie una de estas cosas:

- la cuenta o propietario de la información;
- la sensibilidad o política de retención;
- el tipo de resultado esperado;
- la autoridad para ejecutar o publicar;
- las fuentes canónicas;
- el modo de aprender frente a terminar rápido.

No crees un espacio por cada conversación. Un proyecto puede contener chats separados por resultado y compartir el mismo contexto durable.

## Prompt Diseñar

```text
Ayúdame a diseñar espacios de contexto a partir de mis tareas reales.

Hazme una entrevista corta, una pregunta a la vez, sobre:
- resultados que busco;
- cuentas y dispositivos donde trabajo;
- información sensible o de terceros;
- fuentes que deberían mandar;
- decisiones que el agente puede tomar solo;
- qué debe persistir y por cuánto tiempo.

Después propone el menor número de espacios que evite contaminación.
Para cada espacio entrega: propósito, pertenece/no pertenece, cuenta permitida,
sensibilidad, fuentes canónicas, reglas durables, memoria útil, información que
nunca debe guardarse y fecha de revisión.

No uses categorías prefabricadas si mis tareas sugieren otras. No apliques cambios.
```

## Plantilla de espacio

```yaml
id: producto
purpose: mantener y evolucionar un producto específico
belongs:
  - arquitectura
  - implementación
  - revisión y pruebas
does_not_belong:
  - finanzas personales
  - proyectos de otra organización
allowed_accounts:
  - cuenta-autorizada
sensitivity: internal
canonical_sources:
  - repositorio
  - decisiones aceptadas
memory:
  promote_only_with_approval: true
review_on: 2026-09-22
```

## Frontera de trabajo

Información de una empresa debe permanecer en su entorno autorizado. Un perfil personal puede conservar criterios de ingeniería neutrales, pero no código, tickets, URLs internas, métricas, nombres de clientes ni decisiones confidenciales.
