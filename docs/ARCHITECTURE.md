# Arquitectura

## Principio raíz

No existe una memoria compartida automáticamente entre ChatGPT, Codex local, Claude Chat, Claude Code y Cowork. contexxxt mantiene una fuente canónica neutral y trata la memoria nativa de cada producto como una capa de recuerdo de menor autoridad.

```text
perfil privado opcional
          ↓
núcleo neutral versionado
          ↓
adaptadores generados por superficie
          ↓
memoria nativa auditada, no canónica
```

## Capas

### Núcleo neutral

Vive en `.contextos/` dentro de una instancia: identidad, privacidad, memoria, espacios configurables, estado, fuentes, decisiones, handoff y manifiesto de archivos administrados.

### Runtime

La skill `context-os` es un router corto. Carga un solo playbook cuando la tarea lo necesita: iniciar, auditar, diagnosticar, curar memoria, hacer checkpoint o construir handoff.

Los subagentes reciben tareas autocontenidas y devuelven evidencia destilada. No comparten una memoria invisible.

### Adaptadores

- Codex: `AGENTS.md`, `.agents/skills/context-os/`, agentes opcionales.
- Claude Code: `CLAUDE.md`, `.claude/skills/context-os/`, agentes opcionales.
- ChatGPT, Claude Chat y Cowork: exports versionados para aplicación manual.

Las copias generadas llevan origen, versión y hash. `doctor` detecta drift; no lo repara como efecto secundario.

### CLI

La CLI es local, sin telemetría y sin dependencias runtime. Sus escrituras son no-clobber:

1. archivo ausente: crear;
2. archivo administrado intacto: actualizar si cambió la plantilla;
3. archivo administrado modificado: generar propuesta;
4. archivo ajeno: conservar y reportar conflicto.

No hay `--force` en la versión inicial.

## Autoridad

De mayor a menor dentro de Context OS:

1. consentimiento y límites explícitos del usuario;
2. política de privacidad y seguridad;
3. decisiones verificadas del proyecto;
4. fuentes canónicas vigentes;
5. estado y handoff de la sesión;
6. patrones confirmados;
7. memoria nativa o inferencias candidatas;
8. transcript y resultados crudos antiguos.

La jerarquía del producto no pretende reemplazar la jerarquía interna de cada proveedor. El adaptador traduce el contrato a lo que esa superficie documenta.

## Seguridad

- Nunca imprimir el valor de una posible credencial.
- Nunca escribir en `.env`, settings locales o memorias cloud.
- Rechazar `/` y el home completo como objetivo de inicialización.
- Rechazar symlinks en rutas administradas.
- Mantener trabajo y vida personal separados por espacio y cuenta.
- Pedir aprobación antes de promover cualquier observación a memoria confirmada.

## Portabilidad

Un perfil personal puede vivir fuera del repositorio para mantener separada la identidad del motor. La versión 0.1 todavía no implementa `--profile` ni una variable de entorno para descubrirlo: esa integración queda como diseño futuro y nunca deberá copiar el perfil al proyecto sin una acción explícita.
