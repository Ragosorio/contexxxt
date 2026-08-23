# Diseño: Flight Ledger

## Concepto

contexxxt se siente como una bitácora de vuelo cruzada con un mapa de rutas: cada pieza de contexto tiene origen, autoridad, vigencia y destino. La interfaz no promete magia; muestra qué entró, qué quedó fuera y qué necesita confirmación.

La referencia metodológica es Impeccable: propuesta clara, prueba visible y documentación operativa. La identidad visual, interacción y vocabulario son propios.

## Dirección visual

- **Papel mineral** `#f4f1e8`: superficie de lectura.
- **Azul noche** `#0b1739`: consola, navegación y texto de alto contraste.
- **Azul señal** `#2458e8`: contexto activo y enlaces.
- **Menta verificada** `#2fd6a2`: hechos confirmados.
- **Ámbar de vigencia** `#f2a93b`: información por revisar.
- **Coral de choque** `#f06b5d`: contradicción o frontera cruzada.

La tipografía combina una sans utilitaria para interfaz, una serif editorial para ideas y una mono para rutas, fechas y fuentes. El sistema funciona con fallbacks locales y no depende de que una fuente externa cargue.

## Motivos

- Líneas regladas y columnas marginales.
- Etiquetas de procedencia: `source`, `scope`, `verified`, `expires`.
- Paquetes de contexto apilados, no tarjetas SaaS genéricas.
- Bordes rectos y radios mínimos.
- Un registrador de contexto como demostración principal.

## Landing

El hero parte de una petición imperfecta: “Arregla esto y déjalo listo”. Una demostración determinista muestra cómo se convierte en espacio, fuentes, contexto descartado, riesgo semántico, pregunta mínima y condición de cierre.

La demo debe etiquetarse como simulación. No sugiere que existe una llamada a IA en vivo.

## Interacción

- Tabs con semántica ARIA y teclado.
- Botones de copia con confirmación visible y anuncio para lector de pantalla.
- Tema persistente en documentación.
- `skip link`, focus visible y navegación lógica.
- Animaciones solo para explicar flujo y desactivadas con `prefers-reduced-motion`.
- Ninguna información depende únicamente del color.

## Responsive

- Móvil: una sola columna, demo en secuencia y comandos con scroll horizontal controlado.
- Tablet: dos columnas únicamente donde la comparación lo exige.
- Escritorio: ledger de doce columnas con margen de fuente.

No se permite overflow horizontal a 320 px, 390 px, 768 px o 1440 px.

## Evitar

- La frase “The missing ___ for agents”.
- Oro sobre negro, pátina o la identidad Neo Kinpaku de Impeccable.
- Un deslizador visual antes/después idéntico.
- Gradientes decorativos, glassmorphism o grids de tarjetas intercambiables.
- Logos de proveedores como prueba de compatibilidad.
- Testimonios o métricas no verificadas.
