# Editor libre (`/canvas`)

Editor tipo Canva basado en `react-konva`, junto al editor principal. Todas las medidas del modelo están en **mm**; el `Stage` se escala para mostrarlas.

| Archivo | Qué hace |
|---|---|
| `page.tsx` | Carga el editor solo en cliente (Konva necesita el DOM). |
| `Gate.tsx` | Exige la sesión del editor principal (`menudo:session`); sin ella enlaza a «/». |
| `CanvasEditor.tsx` | Interfaz: lienzo, panel, capas, historial, guardado, exportación. |
| `model.ts` | Papel (A2–A5), tipos de elemento, paleta, fuentes, copias por hoja. |
| `menuTemplate.ts` | Convierte la carta del editor principal (`menudo:menu`) en páginas de elementos. |

- **Guardado:** `localStorage` clave `menudo:canvas:v1` (`{ paper, copies, pages }`; lee también el formato antiguo `{ els }`).
- **Exportar:** PNG/PDF a ~300 ppp con tope de 16 M píxeles. El PDF lleva la hoja como imagen, no como texto vectorial.
- **Cuidado con los nombres:** no llames `template.ts` a un archivo de esta carpeta, es un nombre reservado del App Router.
- Las pruebas se hicieron con Playwright a mano; no hay suite automática.
