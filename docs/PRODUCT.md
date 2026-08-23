# Producto: Context OS

## Promesa

Una persona puede pedir una tarea con sus propias palabras. Context OS prepara el contexto mínimo que un agente necesita, detecta huecos que sí cambian la decisión y deja una continuidad verificable para la próxima sesión.

## Problema

Las personas mezclan proyectos, cuentas, memorias, instrucciones y conversaciones largas. El mismo dato termina duplicado, vencido o en una superficie que no corresponde. Cuando una respuesta falla, se intenta arreglar agregando todavía más texto.

El problema no es solamente redactar mejor. Es decidir qué información entra, cuál deja de ser válida, cuándo se recupera, dónde se coloca, quién puede cambiarla y qué nunca debe persistir.

## Usuarios

1. Personas que usan asistentes de chat y quieren separar contextos sin programar.
2. Desarrolladores que abren proyectos existentes y necesitan continuidad entre sesiones o proveedores.
3. Equipos pequeños que quieren instrucciones auditables, handoffs y mantenimiento sin construir una plataforma propia.

## Recorridos principales

### Solo chat

La documentación ofrece tres prompts: descubrir, diseñar y aplicar. Ningún cambio de memoria ocurre sin mostrar el texto exacto y recibir aprobación.

### Proyecto existente

El recorrido empieza con `context-os audit` para inspeccionar sin escribir. Después, `context-os init` crea su núcleo dentro de `.contextos/` y propone cómo enlazar instrucciones existentes; no las reemplaza.

### Proyecto nuevo

El asistente crea la estructura mínima, entrevista al usuario sobre autoridad y privacidad, y genera adaptadores seleccionados.

### Migración

El núcleo neutral viaja con el proyecto. Los datos personales pueden vivir en un perfil privado externo. Los adaptadores se regeneran para la computadora o proveedor nuevo.

## Contrato del escudo de tarea

Ante una petición, el runtime debe:

1. resolver espacio, proyecto, superficie y sensibilidad;
2. separar hechos, hipótesis y conclusiones del usuario;
3. inferir resultado y condición de terminado;
4. recuperar solo fuentes relevantes y vigentes;
5. detectar huecos, contradicciones, drift o autoridad insuficiente;
6. preguntar únicamente si la respuesta cambia privacidad, autoridad, artefacto o una acción difícil de revertir;
7. avanzar con una suposición explícita cuando sea segura y reversible;
8. verificar el resultado antes de marcarlo completo;
9. registrar un checkpoint pequeño y curable.

## No objetivos de la primera versión

- Sincronizar memorias nativas entre empresas.
- Editar configuraciones cloud automáticamente.
- Crear un RAG o base vectorial obligatoria.
- Reemplazar el control de permisos del sistema operativo.
- Diagnosticar psicológicamente a una persona.
- Conservar el transcript completo como memoria.

## Criterios de éxito 0.1

- `init` puede ejecutarse dos veces sin sobrescribir contenido del usuario.
- Un proyecto existente recibe una auditoría antes de integrarse.
- `doctor` detecta archivos faltantes, drift generado, fechas vencidas y superficies en conflicto.
- La skill enruta tareas imperfectas sin exigir comandos exactos.
- Los adaptadores de Codex y Claude Code se validan por separado.
- La documentación permite configurar un chat sin descargar el repositorio.
- La landing no contiene testimonios, cifras de adopción ni compatibilidades no verificadas.
