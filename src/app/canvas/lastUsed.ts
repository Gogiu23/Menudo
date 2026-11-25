import { FONTS, SHAPES, TRANSPARENT, type El, type FontKey, type Grad } from "./model";

/* Recuerda el último color o ajuste usado en cada tipo de elemento («el último texto», «la última forma»…) y lo aplica a los nuevos.
   Se guarda en localStorage. Solo estilo (color, letra, borde…): nunca posición ni tamaño. */

const KEY = "menudo:canvas:last";
export type LastGroup = "text" | "shape" | "object" | "line" | "image";
export type Last = {
  text?: { fill?: string; fontFamily?: FontKey };
  shape?: { fill?: string; grad?: Grad | null; hollow?: boolean; borderW?: number }; // rectángulos, círculos y formas rellenas
  object?: { fill?: string }; // iconos de línea (café, vino…)
  line?: { fill?: string; thickness?: number };
  image?: { radius?: number };
};

export function groupOf(e: El): LastGroup | null {
  if (e.type === "text") return "text";
  if (e.type === "rect") return "shape";
  if (e.type === "shape") return SHAPES[e.kind]?.stroke ? "object" : "shape";
  if (e.type === "line") return "line";
  if (e.type === "image") return "image";
  return null;
}

// Qué campos de cada grupo se recuerdan
const FIELDS: Record<LastGroup, string[]> = {
  text: ["fill", "fontFamily"],
  shape: ["fill", "grad", "hollow", "borderW"],
  object: ["fill"],
  line: ["fill", "thickness"],
  image: ["radius"],
};

const HEX = /^#[0-9a-f]{6}$/i;
const FONT_KEYS = FONTS.map((f) => f.key) as string[];
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
const hex = (v: unknown) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : undefined);
const grad = (v: unknown): Grad | null | undefined => {
  if (v === null) return null;
  const g = v as { to?: unknown; angle?: unknown; from?: unknown } | undefined;
  const to = g?.to === TRANSPARENT ? TRANSPARENT : hex(g?.to);
  return g && to && typeof g.angle === "number" && Number.isFinite(g.angle) ? { to, angle: g.angle, ...(typeof g.from === "number" && g.from > 0 && g.from <= 0.95 ? { from: g.from } : {}) } : undefined;
};

// Lo guardado puede estar dañado o ser de otra versión: se queda solo con lo que tiene la forma esperada
export function loadLast(): Last {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? "null") as Record<string, Record<string, unknown> | undefined> | null;
    if (!r || typeof r !== "object") return {};
    const out: Last = {};
    if (r.text) out.text = { fill: hex(r.text.fill), fontFamily: FONT_KEYS.includes(r.text.fontFamily as string) ? (r.text.fontFamily as FontKey) : undefined };
    if (r.shape) out.shape = { fill: hex(r.shape.fill), grad: grad(r.shape.grad), hollow: typeof r.shape.hollow === "boolean" ? r.shape.hollow : undefined, borderW: num(r.shape.borderW) };
    if (r.object) out.object = { fill: hex(r.object.fill) };
    if (r.line) out.line = { fill: hex(r.line.fill), thickness: num(r.line.thickness) };
    if (r.image) out.image = { radius: num(r.image.radius) };
    return out;
  } catch {
    return {};
  }
}
export function saveLast(l: Last) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {}
}

// Anota lo que el usuario acaba de cambiar en un elemento (p = el cambio). Devuelve el mismo objeto si no había nada que recordar
export function remember(last: Last, e: El, p: Partial<El>): Last {
  const g = groupOf(e);
  if (!g) return last;
  const keys = FIELDS[g].filter((k) => k in p);
  if (!keys.length) return last;
  const next = { ...(last[g] as Record<string, unknown> | undefined) };
  for (const k of keys) next[k] = (p as Record<string, unknown>)[k] === undefined ? null : (p as Record<string, unknown>)[k]; // un degradado quitado (undefined) se recuerda como «sin degradado»
  return { ...last, [g]: next };
}

// Aplica a un elemento nuevo lo último que se usó en su tipo. Solo estilo; para el texto de plantillas (Titolo, Corpo…) el tamaño y la negrita los pone la plantilla
export function applyLast(last: Last, e: El): El {
  const g = groupOf(e);
  const mem = g && (last[g] as Record<string, unknown> | undefined);
  if (!g || !mem) return e;
  const patch: Record<string, unknown> = {};
  for (const k of FIELDS[g]) {
    const v = mem[k];
    if (v === undefined) continue;
    patch[k] = k === "grad" && v === null ? undefined : v; // null = sin degradado
  }
  return { ...e, ...patch } as El;
}
