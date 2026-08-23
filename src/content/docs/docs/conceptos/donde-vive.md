---
title: Dónde vive cada dato
description: Árbol de decisión para system prompt, prompt de turno, memoria, herramienta o base de conocimiento.
---

La importancia percibida no decide el destino de una información. Usa frecuencia de cambio y frecuencia de uso.

## Árbol

1. **¿Aplica a toda interacción?**
   - Si cabe en pocas líneas: instrucciones globales.
   - Si es larga: archivo o skill referenciada bajo demanda.
2. **¿Cambia con el tiempo?**
   - Si la necesitas ahora: herramienta o fuente actual.
   - Si no la necesitas ahora: no la traigas.
3. **¿Debe sobrevivir a la sesión?**
   - Sí: memoria o estado curado.
   - No: prompt del turno.

## Mapa práctico

| Dato | Destino | Motivo |
| --- | --- | --- |
| “Nunca publiques sin aprobación” | instrucciones de proyecto | aplica siempre y define autoridad |
| “Corrige este error” | prompt actual | es la tarea de este turno |
| decisión arquitectónica aceptada | `DECISIONS.md` | debe sobrevivir y ser auditable |
| estado de CI ahora | herramienta | cambia con el tiempo |
| manual grande y estable | base de conocimiento | solo se consulta cuando hace falta |
| preferencia de estilo transversal | instrucciones globales mínimas | aplica entre proyectos |
| hipótesis en lluvia de ideas | ninguna memoria | todavía no es una decisión |

## Context OS añade dos destinos

### Estado

Lo que está sucediendo en un proyecto no es memoria personal ni una regla global. Vive en `STATE.md` y se reemplaza en cada checkpoint.

### Perfil privado

Un patrón transversal de una persona puede vivir fuera de los repositorios. El proyecto consulta el perfil permitido, pero no lo copia ni publica.

## Duplicar es crear drift

Una instrucción no debe existir completa en `AGENTS.md`, `CLAUDE.md`, una skill y cuatro exports. Guarda el contrato en el núcleo y genera adaptadores. Si una superficie requiere una diferencia, documenta únicamente esa diferencia.
