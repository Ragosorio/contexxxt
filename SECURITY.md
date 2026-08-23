# Seguridad

## Reportar una vulnerabilidad

No publiques credenciales, transcripts o datos personales en un issue. Envía un reporte privado al mantenedor mediante GitHub Security Advisories en este repositorio.

## Modelo de seguridad

contexxxt organiza instrucciones y contexto; no es una sandbox. `AGENTS.md`, `CLAUDE.md`, memorias y skills guían a un modelo, pero no sustituyen permisos del sistema operativo, controles de red ni revisión humana.

La CLI no usa telemetría, no escribe en memorias cloud, no modifica archivos de secretos, no imprime coincidencias sensibles, conserva archivos que no administra y produce propuestas cuando detecta drift manual.
