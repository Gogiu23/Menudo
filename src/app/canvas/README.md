# Editor libre (`/canvas`)

Editor tipo Canva basado en `react-konva`, junto al editor principal. Todas las medidas del modelo están en **mm**; el `Stage` se escala para mostrarlas.

| Archivo | Qué hace |
|---|---|
| `page.tsx` | Carga el editor solo en cliente (Konva necesita el DOM). |
| `Gate.tsx` | Exige la sesión del editor principal (`menudo:session`); sin ella enlaza a «/». |
| `CanvasEditor.tsx` | Interfaz: lienzo, panel, capas, historial, guardado, exportación. |
| `ui.tsx` | Estilo: réplica de las piezas visuales de `Editor.tsx` (botones, iconos, secciones plegables, marca). Si cambia el estilo del editor, cambia aquí también. |
| `model.ts` | Papel (A2–A5), tipos de elemento, paleta, fuentes, copias por hoja. |
| `menuTemplate.ts` | Convierte la carta del editor principal (`menudo:menu`) en páginas de elementos. |

- **Guardado:** `localStorage` clave `menudo:canvas:v1` (`{ paper, copies, pages }`; lee también el formato antiguo `{ els }`).
- **Exportar:** PNG/PDF a ~300 ppp con tope de 16 M píxeles. El PDF lleva la hoja como imagen, no como texto vectorial.
- **Cuidado con los nombres:** no llames `template.ts` a un archivo de esta carpeta, es un nombre reservado del App Router.
- Las pruebas se hicieron con Playwright a mano; no hay suite automática.

- **Estilo y tema:** usa los tokens de `globals.css` (`bg-surface`, `ink`, `mare`, `laguna`, `bg-brand`, `canvas`) y la misma clave de tema (`menudo:theme`) que el editor principal.
- **Textos:** el editor libre solo está en italiano; el editor principal tiene it/es (`i18n.ts`).
- **Impresión:** `@page` usa medidas en mm (`297mm 420mm`), no nombres: CSS no conoce A2.
