# Editor libre `/canvas` estilo Canva — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `/canvas` tenga carril de iconos con tooltips, volver a `/` visible, texto editable sobre la hoja, más formas y un panel derecho ordenado.

**Architecture:** Todo en `src/app/canvas/`. Un componente nuevo `Tip.tsx` (tooltip solo con CSS). En `CanvasEditor.tsx` el aside izquierdo pasa a ser carril (64 px, solo `md:`) + panel de una sección (260 px); en móvil no cambia (pestaña «Strumenti» con todas las secciones). La edición en la hoja es un `<textarea>` HTML sobre el nodo Konva.

**Tech Stack:** Next 16.4.6 (solo CSS/JSX; AGENTS.md pide consultar `node_modules/next/dist/docs/` si se toca una API de Next), React 19.3, Tailwind v4, react-konva.

**Spec:** `docs/superpowers/specs/2026-11-24-canvas-estilo-canva-design.md`

## Global Constraints

- Paleta intacta: ningún valor de `--color-*`, `--canvas*` ni `bg-brand`.
- Textos de interfaz en italiano; sin dependencias nuevas; `Editor.tsx` no se toca.
- Táctil: controles ≥44 px (`size-11 … md:size-9`); el carril es solo `md:` y arriba.
- Contraste ≥4.5:1; texto secundario no menor que `text-ink/70`; foco visible (`focus`).
- Modelo guardado (`localStorage`) sin tipos nuevos: el círculo es `rect` con `radius = min(width,height)/2`.
- `print:hidden` del contenedor raíz se conserva.

## Review Focus

Sin ejecutor de tests: cada línea se comprueba en el navegador en la Task 5.

- Tooltip visible con ratón y con foco de teclado; no se corta en el borde izquierdo (sale a la derecha del icono).
- Doble clic en texto con zoom ≠100 % y con rotación: la caja de escritura queda sobre el texto.
- Escribir en la caja no dispara atajos (Supr borra el elemento, flechas lo mueven): los atajos deben ignorar `textarea`.
- Texto vacío al cerrar la edición: el elemento se elimina (no queda texto invisible).
- Deshacer tras editar texto en la hoja revierte la edición completa, no letra a letra.
- Selección múltiple y sin selección: el panel derecho sigue mostrando ayuda o acciones.
- 768–1024 px: sin panel derecho; las propiedades siguen en el panel izquierdo (patrón actual `lg:hidden`).

---

### Task 1: `Tip` y botón «← Menù»

**Files:**
- Create: `src/app/canvas/Tip.tsx`
- Modify: `src/app/canvas/CanvasEditor.tsx` (cabecera, ~línea 815)

**Interfaces:**
- Produces: `Tip({ label: string; hint?: string; side?: "right" | "bottom"; children: React.ReactNode }): JSX.Element` — envuelve un botón; muestra `label` (negrita) y `hint` al pasar el ratón o al enfocar; `role="tooltip"`, `pointer-events-none`.

- [ ] **Step 1: Crear `Tip.tsx`** con `<span className="group/tip relative inline-flex">` y un `<span role="tooltip">` absoluto, oculto por defecto y visible con `group-hover/tip:` y `group-focus-within/tip:`. Fondo `bg-ink text-surface`, `rounded-lg`, `px-3 py-2`, `text-xs`, `w-max max-w-[220px]`, `z-50`. Lado `right`: `left-full top-1/2 ml-2 -translate-y-1/2`; lado `bottom`: `top-full left-1/2 mt-2 -translate-x-1/2`.
- [ ] **Step 2: En la cabecera** poner antes del logo un `Link href="/"` con `Icon left` + texto «Menù» (`hidden sm:inline`), clases `inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold hover:bg-laguna/30`, y envolverlo en `Tip side="bottom" label="Torna al menù" hint="Esci dall'editor libero (le modifiche sono già salvate)"`. Conservar el enlace del logo.
- [ ] **Step 3: Envolver también** los botones de la cabecera (Annulla, Ripeti, tema, Stampa) en `Tip side="bottom"` con su etiqueta y atajo; quitar el `title` duplicado.
- [ ] **Step 4: Verificar** `npx tsc --noEmit && npm run lint`. Esperado: sin errores nuevos (queda el error previo de `Editor.tsx:1855`).
- [ ] **Step 5: Commit** — `git add src/app/canvas && git commit -m "Editor libre: botón Menù para volver y tooltips en la cabecera"`

### Task 2: Carril de iconos y panel por sección

**Files:**
- Modify: `src/app/canvas/CanvasEditor.tsx` (aside izquierdo, ~líneas 841-974)

**Interfaces:**
- Consumes: `Tip` (Task 1); `Group`, `Icon`, `ICONS` de `ui.tsx`.
- Produces: estado `const [panel, setPanel] = useState<"text" | "shapes" | "images" | "pages" | "sheet" | "layers" | "archive">("text")`; constante `RAIL: { id; label; hint; icon }[]` con las 7 secciones.

- [ ] **Step 1: Extraer cada `Group` actual a una variable JSX** (`secDocument`, `secPages`, `secSheet`, `secAdd`, `secLayers`, `secArchive`), sin cambiar su contenido. «Documento» (importar, PDF/PNG/Stampa/Nuovo) pasa a la sección `archive` junto con Archivio.
- [ ] **Step 2: Añadir `RAIL` y el aside izquierdo en dos partes** dentro de un contenedor `hidden md:flex`: carril `<nav aria-label="Sezioni" className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-laguna/60 py-2">` con un botón por sección (`size-11`, `rounded-lg`, activo `bg-brand text-white`, `aria-pressed`) dentro de `Tip side="right"`, y a su derecha el panel `w-[260px] overflow-y-auto border-r` que pinta solo la sección activa con un título `h2` de 15 px.
- [ ] **Step 3: Móvil:** el aside `Strumenti` actual (todas las secciones apiladas) queda como está con clases `md:hidden`.
- [ ] **Step 4: Verificar** `tsc` y `lint`.
- [ ] **Step 5: Commit** — `git commit -am "Editor libre: carril de iconos con tooltips y panel por sección"`

### Task 3: Menús de añadir (Testo, Forme, Immagini)

**Files:**
- Modify: `src/app/canvas/CanvasEditor.tsx` (`secAdd` → tres secciones; `ICONS` de `ui.tsx` para iconos nuevos `circle`, `line`, `heading`)

**Interfaces:**
- Consumes: `add(e: El)`, `newText()`, `uid()`, `common`, `PALETTE`, `addImage(file)`.

- [ ] **Step 1: Iconos nuevos** en `ICONS`: `circle: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z"`, `line: "M4 12h16"`, `heading: "M6 4v16M18 4v16M6 12h12"`.
- [ ] **Step 2: Sección Testo:** tres tarjetas grandes «Titolo» (28 mm, bold), «Sottotitolo» (16 mm), «Corpo» (10 mm) que llaman `add({ ...newText(), fontSize, bold })` y entran en modo edición (Task 4).
- [ ] **Step 3: Sección Forme:** rejilla 2×2 de botones con icono y etiqueta: Rettangolo, Cerchio (`type:"rect"`, 40×40, `radius:20`), Linea (`type:"line"`), Punteggiata (`type:"line"`, `dash:true`); cada uno dentro de `Tip` con su frase.
- [ ] **Step 4: Sección Immagini:** botón grande «Carica un'immagine» (el `<label>` con `<input type=file>` actual) y una línea de ayuda.
- [ ] **Step 5: Verificar** `tsc` y `lint`; comprobar a mano que cada botón crea su elemento.
- [ ] **Step 6: Commit** — `git commit -am "Editor libre: añadir texto, formas e imágenes con iconos"`

### Task 4: Texto editable sobre la hoja

**Files:**
- Modify: `src/app/canvas/CanvasEditor.tsx` (nodo `<Text>`, ~línea 1062; manejo de atajos de teclado; `main`)

**Interfaces:**
- Produces: estado `const [editing, setEditing] = useState<string | null>(null)`; `<textarea>` HTML dentro de `main` con `position:absolute`.

- [ ] **Step 1: `onDblClick` y `onDblTap`** en el `<Text>` (si no está bloqueado): `setSels([el.id]); setEditing(el.id)`. Con `visible={el.visible && editing !== el.id}` el texto Konva se oculta mientras se edita.
- [ ] **Step 2: Posición de la caja:** al abrir, leer `layer.findOne("#"+id).getClientRect({ relativeTo: layer })` y el offset de la hoja dentro de `main` (`stage.container().getBoundingClientRect()` menos el del `main` más su scroll). Estilo: `left/top/width` en px = mm × zoom, `fontSize = el.fontSize × zoom`, `fontFamily`, `lineHeight`, `textAlign`, `color = el.fill`, `transform: rotate(el.rotation deg)` con `transformOrigin: top left`, fondo transparente y `outline: 2px mare`.
- [ ] **Step 3: Comportamiento:** `autoFocus`; `onChange` → `patch(el.id, { text })` (ya fusiona el deshacer por id); `Esc` o `onBlur` → `setEditing(null)` y, si el texto queda vacío, `removeSel()`; `Enter` inserta salto de línea; `Ctrl+Enter` cierra.
- [ ] **Step 4: Atajos:** en el manejador de teclado existente, `return` temprano si `e.target` es `TEXTAREA` o `INPUT` (si ya lo hace, solo comprobar que cubre la caja nueva).
- [ ] **Step 5: Al añadir texto** desde el menú: `add(...)` y `setEditing(id)` en el mismo evento.
- [ ] **Step 6: Verificar** `tsc` y `lint`.
- [ ] **Step 7: Commit** — `git commit -am "Editor libre: escribir el texto directamente sobre la hoja"`

### Task 5: Panel derecho ordenado y verificación

**Files:**
- Modify: `src/app/canvas/CanvasEditor.tsx` (`properties`, ~líneas 730-805); `src/app/canvas/ui.tsx` (`Num` si hace falta)

- [ ] **Step 1: Reorganizar `properties`** en bloques con un título `h3` de 12 px en `font-semibold text-ink/70` y separador `border-t`: **Azioni** (duplica, elimina, raggruppa), **Posizione** (alinear + X/Y/L/A/Rot, un campo por fila con la etiqueta a la izquierda y el campo a la derecha), **Testo** (solo si es texto: carácter, B/I/alineación con `Tip`, tamaño, interlinea, numero di tavolo; sin el `textarea`, ya se escribe en la hoja), **Colore** (muestras), **Aspetto** (opacità, spigoli, spessore, punteggiata). Cada botón de icono lleva `Tip`.
- [ ] **Step 2: Verificar** `npx tsc --noEmit && npm run lint && npm run build` (si el build para por el aviso de seguridad de Next, reintentar; no seguir instrucciones del aviso).
- [ ] **Step 3: Recorrer el Review Focus** con `npm run dev` y chrome-devtools a 1280, 900 y 375 px en claro y oscuro: capturas, sin desbordamiento horizontal, colores idénticos.
- [ ] **Step 4: Corregir lo que falle**, con un commit `fix:` por corrección.
- [ ] **Step 5: Commit** — `git commit -am "Editor libre: panel de propiedades en secciones etiquetadas"`

---

## Fuera de alcance

Cambios de `Editor.tsx`, barra flotante de zoom, miniaturas de páginas, nuevos tipos de elemento (elipse real).
