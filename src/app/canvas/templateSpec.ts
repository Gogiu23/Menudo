import { FONTS, type FontKey } from "./model";

/* Especificación de una plantilla: lo que decide la IA (o la plantilla estándar). No lleva coordenadas: las pone templateBuild.ts.
   parseSpec valida TODO lo que llega de fuera (el modelo puede devolver cualquier cosa): lo inválido toma el valor por defecto. */

export const LAYOUTS = ["center", "band", "columns", "frame"] as const;
export const DECORS = ["divider", "stars", "corners", "circles"] as const;
export const ICON_KINDS = ["coffee", "wine", "utensils", "leaf", "flame"] as const;
export type Layout = (typeof LAYOUTS)[number];
export type Decor = (typeof DECORS)[number];
export type IconKind = (typeof ICON_KINDS)[number];

export type Spec = {
  layout: Layout;
  bg: string; // color de la hoja
  bgTo?: string; // si existe, la hoja lleva degradado de bg a bgTo
  bgAngle: number;
  ink: string; // color de los textos (se corrige por contraste con la hoja)
  accent: string; // decoraciones y títulos de sección
  titleFont: FontKey;
  bodyFont: FontKey;
  title: string;
  subtitle: string;
  decor: Decor[];
  icon: IconKind | null;
};

const HEX = /^#[0-9a-f]{6}$/i;
const FONT_KEYS = FONTS.map((f) => f.key) as FontKey[];
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : d);
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const clip = (v: unknown, max: number, d: string) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : d);

// Contraste WCAG entre dos colores #rrggbb
function lum(h: string) {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
// Tinta legible sobre la hoja (y sobre el segundo color si hay degradado): si la elegida no llega a 4,5:1 se usa oscura o clara
function legibleInk(ink: string, bg: string, bgTo?: string) {
  const bgs = bgTo ? [bg, bgTo] : [bg];
  const ok = (c: string) => bgs.every((b) => contrast(c, b) >= 4.5);
  if (ok(ink)) return ink;
  for (const c of ["#173033", "#ffffff", "#000000"]) if (ok(c)) return c;
  return lum(bg) > 0.4 ? "#000000" : "#ffffff";
}

export function parseSpec(raw: unknown): Spec {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bg = hex(o.bg, "#fdf6e3");
  const bgTo = typeof o.bgTo === "string" && HEX.test(o.bgTo.trim()) ? o.bgTo.trim().toLowerCase() : undefined;
  const decor = Array.isArray(o.decor) ? [...new Set(o.decor.filter((d): d is Decor => (DECORS as readonly unknown[]).includes(d)))].slice(0, 3) : [];
  const angle = typeof o.bgAngle === "number" && Number.isFinite(o.bgAngle) ? ((Math.round(o.bgAngle) % 360) + 360) % 360 : 90;
  return {
    layout: pick(o.layout, LAYOUTS, "center"),
    bg,
    bgTo,
    bgAngle: angle,
    ink: legibleInk(hex(o.ink, "#173033"), bg, bgTo),
    accent: hex(o.accent, "#68a7ad"),
    titleFont: pick(o.titleFont, FONT_KEYS, "display"),
    bodyFont: pick(o.bodyFont, FONT_KEYS, "sans"),
    title: clip(o.title, 40, "Menù"),
    subtitle: clip(o.subtitle, 80, ""),
    decor,
    icon: o.icon == null ? null : pick(o.icon, ICON_KINDS, "utensils"),
  };
}

// Plantillas estándar (sin IA): se elige una según el texto de la petición, así peticiones distintas no dan siempre lo mismo
const PRESETS: Partial<Spec>[] = [
  { layout: "center", bg: "#fdf6e3", ink: "#173033", accent: "#68a7ad", titleFont: "display", bodyFont: "sans", decor: ["divider", "corners"], icon: "utensils" },
  { layout: "band", bg: "#ffffff", ink: "#173033", accent: "#2f6bff", titleFont: "playfair", bodyFont: "montserrat", decor: ["divider"], icon: "wine" },
  { layout: "frame", bg: "#173033", bgTo: "#0e1a2b", bgAngle: 90, ink: "#fdf6e3", accent: "#e5cb9f", titleFont: "greatvibes", bodyFont: "lora", decor: ["stars"], icon: "coffee" },
  { layout: "columns", bg: "#eee4ab", bgTo: "#e5cb9f", bgAngle: 135, ink: "#173033", accent: "#68a7ad", titleFont: "lora", bodyFont: "sans", decor: ["circles", "divider"], icon: "leaf" },
];
export function defaultSpec(seed: string, title = "Menù", subtitle = ""): Spec {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return parseSpec({ ...PRESETS[h % PRESETS.length], title, subtitle });
}
