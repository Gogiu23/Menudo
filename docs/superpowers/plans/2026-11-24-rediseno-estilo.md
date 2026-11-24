# Rediseño de estilo (Canva × Figma) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a la interfaz del editor principal y de `/canvas` un estilo mezcla de Figma (chrome compacto y preciso, panel de propiedades a la derecha) y Canva (esquinas más redondeadas, acción principal muy visible), sin cambiar ningún color.

**Architecture:** Los cambios de forma y tipografía se hacen una sola vez en los tokens (`@theme` de `globals.css`) y en los componentes compartidos `Group`/`Num`/`input`. En `/canvas` el bloque «Elemento» (X/Y/L/A, texto, color) se mueve de la columna izquierda a una columna derecha nueva, sin extraerlo a otro archivo: se define una vez como variable JSX y se pinta en el panel derecho (escritorio) y en la pestaña «Strumenti» (móvil).

**Tech Stack:** Next 16.4.6 (App Router; AGENTS.md avisa de cambios incompatibles: consultar `node_modules/next/dist/docs/` antes de tocar cualquier API de Next, aquí solo se toca CSS/JSX), React 19.3, Tailwind v4 (`@theme`), react-konva.

**Spec:** Conversación del 2026-11-24 (decisiones: alcance «Estilo + panel derecho»; «mantén la misma paleta de colores»). No hay documento de spec aparte.

## Global Constraints

- **Paleta intacta**: no se cambia ningún valor de `--color-ink`, `--color-mare`, `--color-laguna`, `--color-sabbia`, `--color-limone`, `--color-surface`, `--canvas`, `--canvas-dot`, ni sus versiones de `:root[data-theme="dark"]`. Tampoco el degradado `bg-brand`.
- Textos de la interfaz en italiano (it) y, donde ya exista, en es vía `i18n.ts`; no se añaden textos nuevos al editor principal.
- Sin dependencias nuevas.
- Objetivos táctiles: en punteros gruesos los controles mantienen ≥44 px; la versión compacta solo aplica desde `md:` (patrón ya usado: `size-11 … md:size-9`).
- Contraste de texto ≥4.5:1 en claro y oscuro; no bajar de `text-ink/70` para texto secundario nuevo.
- Foco visible (`focus`) y `print:hidden` del contenedor raíz se conservan.
- El editor principal (`Editor.tsx`) solo recibe cambios de estilo; su modelo de posiciones (desplazamientos por bloque, no mm absolutos) no se toca.

## Review Focus

Sin ejecutor de tests en el repo (solo `build` y `lint`), cada línea se comprueba a mano en el navegador en la Task 4.

- Sin selección en `/canvas`: el panel derecho muestra un texto de ayuda, no queda vacío.
- Selección múltiple (`sels.length > 1`): `cur` es nulo; el panel muestra alinear/agrupar/duplicar/eliminar y ningún campo X/Y.
- Móvil (<768 px): las propiedades siguen accesibles en la pestaña «Strumenti» tras el traslado.
- Tema oscuro: el texto secundario más pequeño sigue legible.
- Pantalla de 768–1024 px: columnas 280 + 280 px dejan hoja visible (el `main` tiene `min-w-0`, la hoja se ajusta al ancho).

---

### Task 1: Tokens de forma y tipografía compartidos

**Files:**
- Modify: `src/app/globals.css` (bloque `@theme`)
- Modify: `src/app/canvas/ui.tsx` (`input`, `Group`, `Num`)
- Modify: `src/app/Editor.tsx` (su propio `Group` y constantes de botones; localizar con `grep -n "function Group\|const input\|const secondary\|const primary" src/app/Editor.tsx`)

**Interfaces:**
- Produces: radio de `rounded-lg` = 10 px y `rounded-xl` = 14 px en toda la app; `Group` compacto (cabecera 13 px, icono 28 px); `Num` con campo de 80 px.

- [ ] **Step 1: Añadir al `@theme` de `globals.css`** `--radius-lg: 0.625rem;` y `--radius-xl: 0.875rem;` (sin tocar ningún `--color-*`).
- [ ] **Step 2: En `ui.tsx` `Group`**: icono `size-9` → `size-7`, título `text-[17px]` → `text-[13px]`, `px-5` → `px-4`, contenedor `space-y-4 px-5 pb-6` → `space-y-3 px-4 pb-4`. En móvil la fila conserva `min-h-11` para el objetivo táctil.
- [ ] **Step 3: En `ui.tsx` `Num`**: etiqueta `text-sm` → `text-xs md:text-[13px]`, campo `w-24` → `w-20`, `py-1.5` → `py-1` solo desde `md:`.
- [ ] **Step 4: Repetir los ajustes equivalentes en `Group` y constantes de `Editor.tsx`**, con los mismos valores, para que ambos editores queden iguales (`ui.tsx` es una réplica declarada de esas piezas).
- [ ] **Step 5: Verificar**: `npx tsc --noEmit && npm run lint`. Esperado: sin errores nuevos.
- [ ] **Step 6: Commit** — `git add src/app && git commit -m "Estilo: radios 10/14 px y paneles compactos estilo Figma, misma paleta"`

### Task 2: Panel de propiedades a la derecha en `/canvas`

**Files:**
- Modify: `src/app/canvas/CanvasEditor.tsx` (bloque «Elemento» líneas ~851-926; `<aside>` izquierda línea ~761; cierre de `<main>`)

**Interfaces:**
- Consumes: `Group`, `Num`, `ICONS` de `ui.tsx` (Task 1); variables ya existentes en `CanvasEditor`: `sels`, `cur`, `selEls`, `patch`, `align`, `group`, `ungroup`, `duplicateSel`, `removeSel`.
- Produces: `const properties: React.ReactNode` (el `Group` «Elemento» actual) usado en dos sitios.

- [ ] **Step 1: Convertir el bloque `{sels.length > 0 && (<Group …>…</Group>)}` en `const properties = sels.length > 0 && (…)`** declarada antes del `return`, sin cambiar su contenido.
- [ ] **Step 2: En la `<aside>` izquierda**, sustituir el bloque por `<div className="md:hidden">{properties}</div>` y reducir su ancho de escritorio de `md:w-[320px]` a `md:w-[280px]`.
- [ ] **Step 3: Añadir tras `</main>` una `<aside aria-label="Proprietà" className="hidden w-[280px] shrink-0 overflow-y-auto border-l border-laguna/60 bg-surface md:block">`** que pinta `{properties}` y, si `sels.length === 0`, un `<p className="p-4 text-sm text-ink/70">` con el texto de ayuda que hoy está en «Livelli» (línea ~929), que se elimina de allí para no duplicarlo.
- [ ] **Step 4: Comprobar que el `Group` del panel derecho arranca abierto** (`open` ya está en el bloque).
- [ ] **Step 5: Verificar**: `npx tsc --noEmit && npm run lint`. Esperado: sin errores.
- [ ] **Step 6: Commit** — `git commit -am "Editor libre: panel de propiedades a la derecha (X/Y/L/A, texto, color)"`

### Task 3: Acción principal visible y cabecera

**Files:**
- Modify: `src/app/canvas/CanvasEditor.tsx` (botón «Stampa», líneas ~751-756)
- Modify: `src/app/Editor.tsx` (botón de imprimir de la barra superior; localizar con `grep -n "Stampa\|Imprimir" src/app/Editor.tsx`)

- [ ] **Step 1: En `CanvasEditor.tsx`** cambiar el botón icono-solo «Stampa» (`size-9`) por un botón con texto: `inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white …` conservando `aria-label`, `disabled={busy}`, `onClick={print}`, `hidden … md:inline-flex`.
- [ ] **Step 2: Hacer lo mismo en el botón de imprimir de `Editor.tsx`**, reutilizando su texto traducido existente (sin textos nuevos).
- [ ] **Step 3: Verificar**: `npx tsc --noEmit && npm run lint`. Esperado: sin errores.
- [ ] **Step 4: Commit** — `git commit -am "Botón Stampa con texto: acción principal visible"`

### Task 4: Verificación visual y de compilación

**Files:** ninguno (solo comprobación).

- [ ] **Step 1: `npm run build`**. Esperado: genera las 12 rutas, incluida `/canvas`. (Si el build para por el aviso de seguridad de Next, reintentarlo; es el comportamiento ya visto.)
- [ ] **Step 2: `npm run dev`** y abrir `/` y `/canvas` (esta exige la sesión del editor principal: `menudo:session`).
- [ ] **Step 3: Recorrer la lista de Review Focus** en claro y oscuro, a 1280, 900 y 375 px: sin selección, un elemento, varios elementos, borrar con Supr, y comprobar que los colores son idénticos a los de antes del cambio.
- [ ] **Step 4: Captura de cada caso** (chrome-devtools) y confirmar que no hay desbordamiento horizontal.
- [ ] **Step 5: Corregir lo que falle** y volver a pasar `tsc`, `lint` y `build`; commit `fix:` por cada corrección.

---

## Fuera de alcance (decidido)

Barra flotante inferior de zoom/páginas, carril con miniaturas de diseños y panel de propiedades con X/Y/mm en el editor principal (su modelo es de desplazamientos). Quedan para una segunda fase si se quiere.
