# Plantilla con IA — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline).

**Goal:** Sección «IA» del editor libre que genera una plantilla desde una petición, con Gemini gratis y respaldo sin IA.
**Spec:** `docs/superpowers/specs/2026-11-24-plantilla-ia-design.md`

## Global Constraints
Paleta intacta; textos it/es vía `tr`; sin dependencias nuevas (se usa `fetch`); `Editor.tsx` no se toca; la clave nunca llega al navegador; lo guardado sigue siendo compatible.

## Review Focus
- Sin `AI_BASE_URL`/`AI_MODEL`: la sección avisa y aun así aplica la plantilla estándar.
- Salida del modelo corrupta (JSON roto, colores raros, listas fuera de valores): no rompe nada.
- Texto/colores de la IA con poco contraste: la tinta se corrige.
- Muchos platos: la plantilla no se sale de la hoja.
- Abuso: 6.ª petición en la ventana de tiempo → 429 y se usa la plantilla estándar.
- Páginas con bg propio: el rectángulo de fondo no estorba al seleccionar.

## Tasks
- [ ] **T1** `src/app/canvas/templateSpec.ts`: tipo `Spec`, `parseSpec`, `defaultSpec`, contraste.
- [ ] **T2** `src/app/canvas/templateBuild.ts`: `buildTemplate(spec, paper, menu, lang)` con 4 maquetaciones.
- [ ] **T3** `src/app/api/template/route.ts`: POST con límites, llamada al proveedor y validación.
- [ ] **T4** UI: sección «IA» en el raíl, estados, textos it/es, página nueva.
- [ ] **T5** Verificación: tsc, eslint, build; ruta con proveedor simulado (JSON bueno, malo, sin clave, límite); navegador; revisor.
