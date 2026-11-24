# Editor libre `/canvas` más cercano a Canva — diseño

**Aprobado por el usuario el 2026-11-24.**

## Intención
El editor libre es difícil de entender: secciones largas y mezcladas, el texto solo se edita en un campo del panel, no es obvio cómo volver a la página principal y «Aggiungi» son tres botones con texto.

## Objetivos
- Volver a `/` con un botón visible «← Menù».
- Carril de iconos a la izquierda (Testo, Forme, Immagini, Pagine, Foglio, Livelli, Archivio) con tooltip al pasar el ratón (nombre + frase). Al pulsar, se abre solo esa sección.
- Texto editable directamente sobre la hoja (doble clic, o al añadir uno nuevo). Esc o clic fuera lo cierra.
- Panel derecho en secciones etiquetadas (Posizione, Testo, Colore, Ordine), un campo por fila.
- Más formas: rectángulo, círculo, línea, punteada.

## No objetivos
- Cambiar la paleta (`--color-*`, `bg-brand`).
- Tocar el editor principal `Editor.tsx`.
- Nuevas dependencias.
- Rediseñar la navegación móvil (pestañas actuales).

## Restricciones
- Textos en italiano (los del editor libre ya lo están).
- Objetivos táctiles ≥44 px en táctil.
- Sin ejecutor de tests: verificación manual en navegador, más `tsc`, `lint` y `build`.

## Enfoques
1. **Carril + panel contextual (elegido):** lo más parecido a Canva; reutiliza `Group`/`Num` y el modelo de elementos. Coste: reorganizar el aside izquierdo.
2. Barra flotante sobre la hoja: menos cambio, pero no cabe Pagine/Foglio/Archivio.
3. Solo retocar el panel actual: no cumple «reinventar el añadir».

## Decisiones del builder (mías)
- Edición en la hoja: `<textarea>` HTML posicionado sobre el nodo Konva (coordenadas del `getClientRect` del nodo × zoom), con el texto Konva oculto mientras se edita.
- Círculo = `rect` con `radius` igual a la mitad del lado (sin tipo nuevo), para no tocar el modelo guardado.
- Móvil: el carril se oculta; se mantiene la pestaña «Strumenti» con las secciones actuales.
