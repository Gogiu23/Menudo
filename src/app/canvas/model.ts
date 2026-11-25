/* Modelo del editor libre: papel, elementos y paleta. Todas las medidas están en mm. */

export type Paper = "A2" | "A3" | "A4" | "A5";
export const PAPERS: Record<Paper, { w: number; h: number }> = {
  A2: { w: 420, h: 594 },
  A3: { w: 297, h: 420 },
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
};

// Misma paleta y tipografías que el editor principal (ver globals.css y layout.tsx)
export const INK = "#173033";
// La hoja «blanca» (valor por defecto) se ve en blanco roto en el modo oscuro, para que no deslumbre sobre la mesa oscura.
// Al exportar o imprimir sale siempre blanco puro. LEGACY_WHITE: el blanco roto que se guardó en una versión intermedia.
export const PAPER_WHITE = "#ffffff";
export const DARK_PAPER = "#e8e6df";
export const LEGACY_WHITE = "#f9f8f4";
export const PALETTE = [
  { name: "Inchiostro", hex: INK },
  { name: "Mare", hex: "#68A7AD" },
  { name: "Laguna", hex: "#99C4C8" },
  { name: "Sabbia", hex: "#E5CB9F" },
  { name: "Limone", hex: "#EEE4AB" },
  { name: "Bianco", hex: "#FFFFFF" },
];
export const FONTS = [
  { label: "Titillium", key: "sans", cssVar: "--font-titillium", fallback: "system-ui, sans-serif" },
  { label: "Bodoni", key: "display", cssVar: "--font-bodoni", fallback: "Georgia, serif" },
  { label: "Playfair", key: "playfair", cssVar: "--font-playfair", fallback: "Georgia, serif" },
  { label: "Lora", key: "lora", cssVar: "--font-lora", fallback: "Georgia, serif" },
  { label: "Montserrat", key: "montserrat", cssVar: "--font-montserrat", fallback: "system-ui, sans-serif" },
  { label: "Great Vibes", key: "greatvibes", cssVar: "--font-greatvibes", fallback: "cursive" },
  { label: "Dancing Script", key: "dancing", cssVar: "--font-dancing", fallback: "cursive" },
] as const;
export type FontKey = (typeof FONTS)[number]["key"];

// Canvas no entiende var(): se lee el nombre real de la fuente que next/font define en <html>
export function fontFamily(key: FontKey) {
  const f = FONTS.find((x) => x.key === key)!;
  const v = getComputedStyle(document.documentElement).getPropertyValue(f.cssVar).trim();
  return v ? `${v}, ${f.fallback}` : f.fallback;
}

// Degradado lineal del color del elemento (`fill`) hasta `to`; angle en grados: 0 = de izquierda a derecha, 90 = de arriba abajo
export type Grad = { to: string; angle: number };
// hollow: formas huecas (solo borde, del color del elemento y de grosor borderW en mm)
export type Base = { hollow?: boolean; borderW?: number; grad?: Grad; id: string; x: number; y: number; width: number; height: number; rotation: number; opacity: number; visible: boolean; locked: boolean; group?: string };
export type TextEl = Base & {
  type: "text";
  text: string;
  fontSize: number;
  fill: string;
  fontFamily: FontKey;
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  lineHeight?: number;
  // Número de mesa: al exportar, su texto se sustituye por el de cada copia (o queda vacío); en pantalla es solo un aviso
  table?: boolean;
};
export type RectEl = Base & { type: "rect"; fill: string; radius: number; stroke?: string; strokeW?: number };
export type ImageEl = Base & { type: "image"; src: string; radius?: number }; // radius: esquinas redondeadas, en mm
// Baldosa de mayólica del editor principal: `fill` es el color, `k` el tamaño de la baldosa
export type TilesEl = Base & { type: "tiles"; fill: string; k: number };
// Línea horizontal de `width` mm; `fill` es su color. Con dash sale punteada (guías de precio)
export type LineEl = Base & { type: "line"; fill: string; thickness: number; dash: boolean };
// Formas y objetos vectoriales. Las rellenas usan una caja de 100×100; los objetos (stroke) son iconos de línea en una de 24×24.
// El color del elemento (`fill`) es el relleno o el trazo.
export type ShapeKind = "triangle" | "diamond" | "hexagon" | "star" | "heart" | "arrow" | "bubble" | "cross" | "ring" | "coffee" | "wine" | "utensils" | "leaf" | "flame";
export const SHAPES: Record<ShapeKind, { label: string; hint: string; d: string; vb: number; stroke: boolean }> = {
  triangle: { label: "Triangolo", hint: "Punta verso l'alto", vb: 100, stroke: false, d: "M50 8 L94 88 H6 Z" },
  diamond: { label: "Rombo", hint: "Per separatori e decorazioni", vb: 100, stroke: false, d: "M50 4 L96 50 L50 96 L4 50 Z" },
  hexagon: { label: "Esagono", hint: "Per etichette e prezzi", vb: 100, stroke: false, d: "M27 8 H73 L97 50 L73 92 H27 L3 50 Z" },
  star: { label: "Stella", hint: "Per i piatti consigliati", vb: 100, stroke: false, d: "M50 5 L61.8 36.8 L95.6 38.2 L69 59.2 L78.2 91.8 L50 73 L21.8 91.8 L31 59.2 L4.4 38.2 L38.2 36.8 Z" },
  heart: { label: "Cuore", hint: "I preferiti della casa", vb: 100, stroke: false, d: "M50 90 C10 58 4 36 4 26 C4 12 15 4 27 4 C37 4 45 9 50 18 C55 9 63 4 73 4 C85 4 96 12 96 26 C96 36 90 58 50 90 Z" },
  arrow: { label: "Freccia", hint: "Indica una sezione", vb: 100, stroke: false, d: "M4 38 H58 V14 L96 50 L58 86 V62 H4 Z" },
  bubble: { label: "Nuvoletta", hint: "Per note e avvisi", vb: 100, stroke: false, d: "M12 8 H88 A8 8 0 0 1 96 16 V62 A8 8 0 0 1 88 70 H44 L22 92 V70 H12 A8 8 0 0 1 4 62 V16 A8 8 0 0 1 12 8 Z" },
  cross: { label: "Croce", hint: "Un segno più", vb: 100, stroke: false, d: "M36 4 H64 V36 H96 V64 H64 V96 H36 V64 H4 V36 H36 Z" },
  ring: { label: "Anello", hint: "Un cerchio vuoto", vb: 100, stroke: false, d: "M50 4 A46 46 0 1 1 49.99 4 Z M50 26 A24 24 0 1 0 50.01 26 Z" },
  coffee: { label: "Caffè", hint: "Tazza fumante", vb: 24, stroke: true, d: "M10 2v2 M14 2v2 M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1 M6 2v2" },
  wine: { label: "Vino", hint: "Calice", vb: 24, stroke: true, d: "M8 22h8 M7 10h10 M12 15v7 M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z" },
  utensils: { label: "Posate", hint: "Forchetta e coltello", vb: 24, stroke: true, d: "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M7 2v20 M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" },
  leaf: { label: "Foglia", hint: "Piatti vegetariani", vb: 24, stroke: true, d: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" },
  flame: { label: "Piccante", hint: "Fiamma", vb: 24, stroke: true, d: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" },
};
export type ShapeEl = Base & { type: "shape"; kind: ShapeKind; fill: string };
export type El = TextEl | RectEl | ImageEl | TilesEl | LineEl | ShapeEl;

// Puntos de inicio y fin de un degradado lineal que cubre una caja w×h con ese ángulo
export function gradPoints(w: number, h: number, angle: number) {
  const a = (angle * Math.PI) / 180;
  const [dx, dy] = [Math.cos(a), Math.sin(a)];
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const [cx, cy] = [w / 2, h / 2];
  return { start: { x: cx - dx * half, y: cy - dy * half }, end: { x: cx + dx * half, y: cy + dy * half } };
}
// Propiedades de relleno de Konva: color liso o degradado
export function fillGrad(fill: string, g: Grad | undefined, w: number, h: number) {
  if (!g) return { fill };
  const { start, end } = gradPoints(w, h, g.angle);
  return { fillLinearGradientStartPoint: start, fillLinearGradientEndPoint: end, fillLinearGradientColorStops: [0, fill, 1, g.to] };
}
// oy: la línea se dibuja centrada en y=0, así que la caja del degradado empieza en -grosor/2
export function strokeGrad(stroke: string, g: Grad | undefined, w: number, h: number, oy = 0) {
  if (!g) return { stroke };
  const { start, end } = gradPoints(w, h, g.angle);
  return { strokeLinearGradientStartPoint: { x: start.x, y: start.y + oy }, strokeLinearGradientEndPoint: { x: end.x, y: end.y + oy }, strokeLinearGradientColorStops: [0, stroke, 1, g.to] };
}

export const uid = () => Math.random().toString(36).slice(2, 9);
export const common = { rotation: 0, opacity: 1, visible: true, locked: false };

export const newText = (o: Partial<TextEl> = {}): El => ({
  id: uid(), type: "text", x: 20, y: 40, width: 100, height: 10, ...common,
  text: "Testo", fontSize: 8, fill: INK, fontFamily: "sans", bold: false, italic: false, align: "left", ...o,
});

export const fontStyleOf = (e: { bold: boolean; italic: boolean }) => `${e.italic ? "italic " : ""}${e.bold ? "bold" : "normal"}`;

// Tamaño de la baldosa SVG original: 38 px CSS por unidad, 1 px CSS = 1/3.7795 mm
const TILE_UNIT = 38;
const TILE_RES = 4; // píxeles de canvas por unidad: nitidez al exportar a 300 ppp
export const MM_PER_TILE_PX = 1 / 3.7795;

const patterns = new Map<string, HTMLCanvasElement>();
export function tilePattern(color: string) {
  let c = patterns.get(color);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = TILE_UNIT * TILE_RES;
  const g = c.getContext("2d")!;
  g.scale(TILE_RES, TILE_RES);
  const white = color.toLowerCase() === "#ffffff";
  const corners = [[0, 0], [TILE_UNIT, 0], [0, TILE_UNIT], [TILE_UNIT, TILE_UNIT]];
  g.fillStyle = color;
  g.fillRect(0, 0, TILE_UNIT, TILE_UNIT);
  g.fillStyle = white ? "rgba(23,48,51,0.12)" : "#fff";
  for (const [x, y] of corners) {
    g.beginPath();
    g.arc(x, y, 9, 0, Math.PI * 2);
    g.fill();
  }
  for (const [cx, cy, rx, ry] of [[19, 10, 3.6, 6.5], [19, 28, 3.6, 6.5], [10, 19, 6.5, 3.6], [28, 19, 6.5, 3.6]]) {
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = INK;
  g.beginPath();
  g.arc(19, 19, 2.6, 0, Math.PI * 2);
  g.fill();
  for (const [x, y] of corners) {
    g.beginPath();
    g.arc(x, y, 2.2, 0, Math.PI * 2);
    g.fill();
  }
  patterns.set(color, c);
  return c;
}
export const tileScale = (k: number) => (TILE_UNIT * k * MM_PER_TILE_PX) / (TILE_UNIT * TILE_RES);

/* Copias por hoja: la carta (papel P) se repite en un folio mayor que las contiene exactas, sin escalar.
   2 copias → folio un tamaño mayor en horizontal (2 × A4 = A3); 4 copias → dos tamaños mayor (4 × A5 = A3). */
export type Copies = 1 | 2 | 4;
export const COPIES: Copies[] = [1, 2, 4];
const SIZES: Paper[] = ["A5", "A4", "A3", "A2"];

export function sheetFor(paper: Paper, copies: Copies) {
  const j = SIZES.indexOf(paper) + (copies === 1 ? 0 : copies === 2 ? 1 : 2);
  if (j >= SIZES.length) return null; // no existe un folio mayor (A1…) en la lista
  const name = SIZES[j];
  const landscape = copies === 2;
  const { w, h } = PAPERS[name];
  return { name, landscape, w: landscape ? h : w, h: landscape ? w : h, cols: copies === 1 ? 1 : 2, rows: copies === 4 ? 2 : 1 };
}

// Posición de cada copia en el folio, en el orden en que se rellenan (como en el editor principal)
export const COPY_NAMES: Record<Copies, string[]> = {
  1: ["Tavolo"],
  2: ["A sinistra", "A destra"],
  4: ["In alto a sinistra", "In alto a destra", "In basso a sinistra", "In basso a destra"],
};
