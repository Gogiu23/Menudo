# Editor libre: letras, color de hoja, zoom, formas y búsqueda de imágenes — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (se ejecuta inline en esta sesión).

**Goal:** Más tipografías, color de hoja elegible, zoom que se adapta a la ventana y recuerda el último valor, más formas y objetos, y búsqueda de imágenes web (Pixabay) en `/canvas`. **La IA queda fuera** (se aborda después).

**Spec:** conversación del 2026-11-24 («nos falta mas tipos de letras, poder decidir el color de la hoja… haz los otros cambios luego abordamos lo de la IA»). Continúa `2026-11-24-canvas-estilo-canva.md`.

## Decisiones (mías, para corregir)
- **Letras:** se añaden a `FONTS` las que `layout.tsx` ya carga (Playfair, Lora, Montserrat, Great Vibes, Dancing Script). El selector pasa a lista donde cada nombre se ve con su letra.
- **Color de hoja:** estado `bg` (por defecto `#ffffff`), guardado en `localStorage` y en el archivo de diseños (`Doc.bg` opcional). Se valida como `#rrggbb`.
- **Zoom:** `fit` = el menor entre ajuste al ancho y al alto (la hoja entera cabe; solo desde `md`, en móvil sigue por ancho). `mul` se guarda en `localStorage` (`menudo:canvas:zoom`) y **no** se reinicia al cambiar de papel ni al abrir un diseño; el botón del porcentaje sí lo reinicia.
- **Formas y objetos:** un tipo nuevo `shape` con `kind` (relleno en caja 100×100, o línea en caja 24×24 para objetos). Se dibuja con `Path2D` en un `Shape` de Konva con width/height, así el transformador y `commit` funcionan sin cambios. Rect/círculo siguen siendo `rect`.
- **Imágenes web:** componente `ImageSearch.tsx` sobre la ruta existente `/api/images`; el elegido pasa por `addImage` (reduce y guarda como el resto).

## Global Constraints
Paleta intacta; textos en italiano; sin dependencias nuevas; `Editor.tsx` y `/api/images` no se tocan; compatibilidad con lo guardado (campos nuevos opcionales).

## Review Focus
- Diseño o autosave antiguos sin `bg` o sin `shape` se abren sin error.
- Un `shape` se mueve, redimensiona, rota, duplica, oculta y exporta (PNG/PDF) igual que los demás.
- Zoom guardado mayor que el máximo del papel nuevo se recorta, no rompe.
- Sin `PIXABAY_KEY` el buscador muestra un aviso claro, no queda en blanco.
- Fuente nueva visible en el lienzo tras cargar (se repinta al llegar).

## Tasks
- [ ] **T1 Letras + color de hoja + zoom** (`model.ts`, `archive.ts`, `CanvasEditor.tsx`): FONTS, lista de letras en «Testo», `bg` + selector en «Foglio», `fit` por alto y `mul` persistente.
- [ ] **T2 Formas y objetos** (`model.ts` `ShapeEl` + `SHAPES`, `ui.tsx` `ShapeIcon`, `CanvasEditor.tsx` render, sección «Forme» ampliada y «Oggetti» nueva en el carril).
- [ ] **T3 Imágenes web** (`ImageSearch.tsx`, sección «Immagini»).
- [ ] **T4 Verificación:** `tsc`, `eslint src/app/canvas`, `npm run build`, navegador (1280/375, claro/oscuro), revisor final.
