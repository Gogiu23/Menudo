# Plantilla con IA en el editor libre — diseño

**Aprobado por el usuario el 2026-11-24** («aprobado, empieza con Gemini gratis»).

## Intención
Que cualquier visitante escriba una petición («carta de pizzería elegante, tonos cálidos») y el editor libre le añada una plantilla con textos, formas, colores y letras ya colocados. Tiene que servir al **público general**, así que la clave de la IA vive en el servidor y nadie necesita cuenta propia.

## Objetivos
- Sección «IA» en el raíl: cuadro de petición (máx. 500 caracteres), casilla «Usar el nombre y las secciones de mi menú» y botón generar.
- La plantilla se **añade como página nueva** (no pisa lo que hay). El fondo es un rectángulo bloqueado a hoja completa para que cada página tenga el suyo.
- Funciona siempre: si la IA falla, no hay clave, se agota el límite o responde mal, se aplica una plantilla estándar sin IA y se avisa.
- Es de **proveedor intercambiable**: un solo adaptador compatible con OpenAI (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`). Ahora Gemini gratis; después, con las mismas variables, Vercel AI Gateway u otro de pago con tope de gasto.

## No objetivos
- Generar imágenes; que la IA invente platos o precios; guardar peticiones.

## Decisiones (mías)
- **La IA no dibuja coordenadas.** Devuelve una especificación corta (maquetación entre 4, color de hoja y degradado, tinta y acento, dos letras de las 7, titular, subtítulo, decoraciones). El código del cliente la coloca. Así sale bien aunque el modelo sea pequeño.
- Los platos y precios salen del menú importado, nunca de la IA. Sin menú, ejemplos marcados como tales. A la IA solo se le envía (si el usuario lo marca) el nombre y los títulos de las secciones.
- Todo lo que devuelve el modelo se valida (`parseSpec`): colores `#rrggbb`, valores de listas cerradas, textos recortados; lo inválido toma el valor por defecto. La tinta se corrige por contraste con la hoja.
- Protección (la ruta es pública): límite por IP en memoria, tope diario por instancia, petición recortada, `max_tokens` bajo, tiempo máximo de 25 s. En producción, además, tope de gasto en la clave del proveedor.
- Los textos del modelo se pintan en el lienzo (no HTML): sin XSS. El prompt del sistema ordena ignorar instrucciones del usuario que pidan cambiar el formato; la validación hace el resto.

## Lo que queda al builder
Detalle de las 4 maquetaciones, textos de ejemplo y mensajes de error.
