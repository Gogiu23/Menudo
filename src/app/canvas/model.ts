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
] as const;
export type FontKey = (typeof FONTS)[number]["key"];

// Canvas no entiende var(): se lee el nombre real de la fuente que next/font define en <html>
export function fontFamily(key: FontKey) {
  const f = FONTS.find((x) => x.key === key)!;
  const v = getComputedStyle(document.documentElement).getPropertyValue(f.cssVar).trim();
  return v ? `${v}, ${f.fallback}` : f.fallback;
}

export type Base = { id: string; x: number; y: number; width: number; height: number; rotation: number; opacity: number; visible: boolean; locked: boolean };
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
};
export type RectEl = Base & { type: "rect"; fill: string; radius: number; stroke?: string; strokeW?: number };
export type ImageEl = Base & { type: "image"; src: string };
// Baldosa de mayólica del editor principal: `fill` es el color, `k` el tamaño de la baldosa
export type TilesEl = Base & { type: "tiles"; fill: string; k: number };
// Línea horizontal de `width` mm; `fill` es su color. Con dash sale punteada (guías de precio)
export type LineEl = Base & { type: "line"; fill: string; thickness: number; dash: boolean };
export type El = TextEl | RectEl | ImageEl | TilesEl | LineEl;

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
