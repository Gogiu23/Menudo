# Diseño libre en el editor normal

## Qué y por qué
El usuario crea o retoca una carta en el editor libre (`/canvas`) y quiere abrirla **idéntica** en el editor normal (el sencillo,
`/`), verla en la página principal (lista de cartas, miniaturas) y modificarla allí con los formularios de siempre; y lo mismo al revés.

## Enfoques considerados
1. **Contenido + aspecto aproximado** (letra/color/tamaño como «looks», formas como pegatinas): no queda idéntico. Descartado.
2. **Solo contenido** («Convertir en carta», ya hecho): no conserva el diseño. Descartado como respuesta completa.
3. **El diseño viaja entero y el editor normal lo dibuja** (elegido): la carta guarda el documento del lienzo y el editor normal lo
   pinta tal cual; sus formularios cambian el texto de los elementos enlazados.

## Decisiones
- `Menu.free?: FreeDoc` con `FreeDoc = { docId, paper, pages, bg, bgGrad?, at }` (las páginas del lienzo, con sus enlaces).
- El editor normal dibuja `free` con **SVG** (`canvas/FreeSvg.tsx`): nítido con zoom, en impresión y en miniaturas. Los renglones
  del texto los calcula Konva (`Konva.Text.textArr`) para partir igual que en el lienzo.
- Lo que se ve en el normal = `pullLinks(free.pages, menu)`: los cambios de los formularios aparecen al instante.
- El lienzo tiene un `docId`. Se **enlaza** a la carta al «Enviar al editor normal» (Convertir en carta) y al «Importar el menú
  actual». Mientras `menu.free.docId === docId`, el guardado del lienzo actualiza `menu.free`.
- Si la carta trae un diseño de otro documento, el lienzo ofrece abrirlo (aviso con botón), no lo sustituye solo.
- En el normal: «Usar la plantilla del editor normal» quita `free` y vuelve a la maquetación automática.
- Página principal: las miniaturas de cartas con `free` muestran su primera página del diseño.

## Pasos
1. Dibujar el diseño en el editor normal (vista previa, impresión, miniaturas) y el enlace lienzo ↔ carta. ← este
2. Editar textos y precios desde los formularios (con el paso 1 ya se ve; falta ocultar opciones de plantilla que no aplican).
3. Añadir y borrar platos desde el normal (copiar la fila del plato anterior; ids en los platos).

## Límites aceptados
- shortcut: `free` se guarda también en `localStorage` (borrador de la carta): con muchas imágenes puede llenar los ~5 MB
  (ya existe el aviso de «sin espacio»). Mejora: guardar `free` solo en IndexedDB.
- Platos por posición hasta el paso 3.
