import { common, INK, newText, PAPERS, uid, type El, type FontKey, type Paper } from "./model";

/* Importar un PDF (parte pura, sin DOM ni pdfjs: se puede probar en Node).
   Cada página se convierte en: imagen de fondo bloqueada + un parche bloqueado por apartado (tapa el texto original de la imagen)
   + un texto editable por apartado. Las coordenadas de entrada están en puntos PDF con el origen arriba a la izquierda. */

// Un trozo de texto tal como lo da pdfjs: x a la izquierda, y = línea base, w = ancho, size = cuerpo de letra (todo en pt)
export type PdfText = { str: string; x: number; y: number; w: number; size: number; font: string };
// Píxeles del render de la página (como ImageData)
export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

type Seg = { text: string; x0: number; x1: number; y: number; size: number; font: string; price: boolean; row: boolean };
export type Block = { lines: Seg[]; align: "left" | "center" | "right" };

export function mapFont(name: string): { font: FontKey; bold: boolean; italic: boolean } {
  const n = name.replace(/^[A-Z]{6}\+/, ""); // prefijo de subconjunto (ABCDEF+Lora-Bold)
  const bold = /bold|black|heavy|semibold|demi/i.test(n);
  const italic = /italic|oblique/i.test(n);
  const font: FontKey = /dancing/i.test(n) ? "dancing"
    : /vibes|script|brush|allura|pacifico|parisienne|tangerine|cursive/i.test(n) ? "greatvibes"
    : /playfair/i.test(n) ? "playfair"
    : /bodoni|didot|didone/i.test(n) ? "display"
    : /montserrat/i.test(n) ? "montserrat"
    : /lora|georgia|times|garamond|minion|baskerville|palatino|cambria/i.test(n) || (/serif/i.test(n) && !/sans/i.test(n)) ? "lora"
    : "sans";
  return { font, bold, italic };
}

// El papel A más parecido al tamaño real de la página (todas las A tienen la misma proporción)
export function nearestPaper(wPt: number, hPt: number): Paper {
  const mm = (Math.min(wPt, hPt) * 25.4) / 72;
  return (Object.keys(PAPERS) as Paper[]).reduce((a, b) => (Math.abs(Math.log(PAPERS[b].w / mm)) < Math.abs(Math.log(PAPERS[a].w / mm)) ? b : a));
}

// Escala (mm por pt) y desplazamiento para que la página quepa entera y centrada en el papel, sin deformarse
export function placement(wPt: number, hPt: number, paper: Paper) {
  const { w, h } = PAPERS[paper];
  const k = Math.min(w / wPt, h / hPt);
  return { k, ox: (w - wPt * k) / 2, oy: (h - hPt * k) / 2 };
}

const LEADER = /^[\s.·…_-]+$/; // puntos guía entre plato y precio: se quedan en el fondo

// Agrupa los trozos en apartados: líneas → segmentos (separados por huecos grandes) → bloques de líneas parecidas y seguidas
export function groupText(items: PdfText[], pageW: number): Block[] {
  const its = items.filter((i) => i.str.trim() && i.size > 0).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: PdfText[][] = [];
  for (const it of its) {
    const r = rows.find((r) => Math.abs(r[0].y - it.y) < 0.35 * Math.min(r[0].size, it.size));
    if (r) r.push(it);
    else rows.push([it]);
  }
  const segs: Seg[] = [];
  for (const r of rows) {
    r.sort((a, b) => a.x - b.x);
    const parts: { its: PdfText[]; x1: number }[] = [];
    for (const it of r) {
      const p = parts.at(-1);
      const s = Math.max(it.size, p?.its[0].size ?? 0);
      const ratio = p ? it.size / p.its[0].size : 1;
      if (p && it.x - p.x1 < 1.0 * s && ratio < 1.25 && ratio > 0.8) {
        p.its.push(it);
        p.x1 = Math.max(p.x1, it.x + it.w);
      } else parts.push({ its: [it], x1: it.x + it.w });
    }
    const row = parts.filter((p) => !p.its.every((i) => LEADER.test(i.str)));
    row.forEach((p, i) => {
      let text = "";
      let end = -Infinity;
      for (const it of p.its) {
        // pdfjs no siempre da los espacios: se añade uno si hay hueco entre trozos
        if (text && it.x - end > 0.12 * it.size && !text.endsWith(" ") && !it.str.startsWith(" ")) text += " ";
        text += it.str;
        end = it.x + it.w;
      }
      const main = p.its.reduce((a, b) => (b.str.length > a.str.length ? b : a)); // la fuente que más texto lleva
      const price = row.length > 1 && i === row.length - 1 && /\d/.test(text) && text.trim().length <= 14;
      segs.push({ text: text.trim(), x0: p.its[0].x, x1: p.x1, y: p.its[0].y, size: main.size, font: main.font, price, row: row.length > 1 });
    });
  }

  const blocks: (Block & { open: boolean })[] = [];
  for (const s of segs) {
    // Los platos con precio van cada uno por su lado (un apartado por plato); el resto se une si sigue al bloque anterior
    const b = s.row ? undefined : blocks.findLast((b) => b.open && joins(b.lines.at(-1)!, s));
    if (b) b.lines.push(s);
    else blocks.push({ lines: [s], align: "left", open: !s.row });
  }
  return blocks.map(({ lines }) => ({ lines, align: alignOf(lines, pageW) }));
}

function joins(l: Seg, s: Seg) {
  const dy = s.y - l.y;
  const size = Math.max(l.size, s.size);
  return dy > 0.5 * size && dy < 1.6 * size && Math.abs(s.size / l.size - 1) < 0.12 && s.font === l.font
    && (Math.abs(s.x0 - l.x0) < 0.6 * size || Math.abs(s.x1 - l.x1) < 0.6 * size || Math.abs((s.x0 + s.x1) / 2 - (l.x0 + l.x1) / 2) < 0.8 * size);
}

function alignOf(lines: Seg[], pageW: number): Block["align"] {
  if (lines.length > 1) {
    const spread = (f: (s: Seg) => number) => Math.max(...lines.map(f)) - Math.min(...lines.map(f));
    const [l, c, r] = [spread((s) => s.x0), spread((s) => (s.x0 + s.x1) / 2), spread((s) => s.x1)];
    return l <= c + 0.5 && l <= r + 0.5 ? "left" : c <= r ? "center" : "right";
  }
  const s = lines[0];
  if (s.price) return "right";
  return Math.abs((s.x0 + s.x1) / 2 - pageW / 2) < 0.03 * pageW && s.x0 > 0.12 * pageW ? "center" : "left";
}

/* Color: fondo = mediana de los píxeles del contorno de la caja; tinta = mediana de los píxeles de dentro más alejados del fondo */
type Box = { x0: number; y0: number; x1: number; y1: number }; // en px del render
const hex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const median = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[v.length >> 1] : 255);
const clampBox = (b: Box, px: Pixels): Box => ({
  x0: Math.max(0, Math.floor(b.x0)), y0: Math.max(0, Math.floor(b.y0)),
  x1: Math.min(px.width - 1, Math.ceil(b.x1)), y1: Math.min(px.height - 1, Math.ceil(b.y1)),
});
const at = (px: Pixels, x: number, y: number) => {
  const i = (y * px.width + x) * 4;
  return [px.data[i], px.data[i + 1], px.data[i + 2]];
};

export function edgeColor(px: Pixels, box: Box): number[] {
  const b = clampBox(box, px);
  const pts: number[][] = [];
  for (let x = b.x0; x <= b.x1; x++) pts.push(at(px, x, b.y0), at(px, x, b.y1));
  for (let y = b.y0; y <= b.y1; y++) pts.push(at(px, b.x0, y), at(px, b.x1, y));
  return [0, 1, 2].map((c) => median(pts.map((p) => p[c])));
}

export function inkColor(px: Pixels, box: Box, bg: number[]): string {
  const b = clampBox(box, px);
  const far: { d: number; p: number[] }[] = [];
  const step = Math.max(1, Math.floor((b.x1 - b.x0) * (b.y1 - b.y0) / 40000)); // basta una muestra en cajas grandes
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x += step) {
    const p = at(px, x, y);
    far.push({ d: Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]), p });
  }
  const max = Math.max(0, ...far.map((f) => f.d));
  if (max < 60) return INK; // no se distingue el texto del fondo
  const ink = far.filter((f) => f.d > max * 0.75); // los bordes suavizados de las letras mezclan tinta y fondo: se descartan
  return hex([0, 1, 2].map((c) => median(ink.map((f) => f.p[c]))));
}

// Construye los elementos de una página: fondo, parches y textos (en este orden de capas)
export function buildPage(o: { src: string; items: PdfText[]; wPt: number; hPt: number; paper: Paper; px?: Pixels; scale?: number }): El[] {
  const { k, ox, oy } = placement(o.wPt, o.hPt, o.paper);
  const pageW = PAPERS[o.paper].w;
  const bg: El = { id: uid(), type: "image", src: o.src, x: ox, y: oy, width: o.wPt * k, height: o.hPt * k, ...common, locked: true };
  const patches: El[] = [];
  const texts: El[] = [];
  for (const b of groupText(o.items, o.wPt)) {
    const first = b.lines[0];
    const last = b.lines.at(-1)!;
    const s = first.size;
    const x0 = Math.min(...b.lines.map((l) => l.x0));
    const x1 = Math.max(...b.lines.map((l) => l.x1));
    // Caja de las letras originales: de la altura de las mayúsculas a las descendentes
    const box = { x0: x0 - 0.15 * s, y0: first.y - 1.0 * s, x1: x1 + 0.15 * s, y1: last.y + 0.32 * s };
    let fill = INK;
    let patch = "#ffffff";
    if (o.px && o.scale) {
      const sc = o.scale;
      const pxBox = { x0: box.x0 * sc, y0: box.y0 * sc, x1: box.x1 * sc, y1: box.y1 * sc };
      const bgc = edgeColor(o.px, pxBox);
      patch = hex(bgc);
      fill = inkColor(o.px, pxBox, bgc);
    }
    patches.push({ id: uid(), type: "rect", x: ox + box.x0 * k, y: oy + box.y0 * k, width: (box.x1 - box.x0) * k, height: (box.y1 - box.y0) * k, ...common, locked: true, fill: patch, radius: 0 });

    const lh = b.lines.length > 1 ? Math.min(2.5, Math.max(0.8, (last.y - first.y) / (b.lines.length - 1) / s)) : 1.2;
    // Konva coloca la línea base a ~(0,33 + interlineado/2) cuerpos del borde superior de la caja
    const top = first.y - (0.33 + lh / 2) * s;
    // Las fuentes del editor no son las del PDF: se deja margen de ancho para que no salten de línea
    const wPt = Math.min(o.wPt, (x1 - x0) * 1.15 + s);
    const left = b.align === "left" ? x0 : b.align === "right" ? x1 - wPt : (x0 + x1) / 2 - wPt / 2;
    const width = wPt * k;
    const x = Math.min(Math.max(ox + left * k, 0), pageW - width);
    const f = mapFont(first.font);
    texts.push(newText({
      x, y: oy + top * k, width, height: s * k * lh * b.lines.length,
      text: b.lines.map((l) => l.text).join("\n"), fontSize: s * k, fill, fontFamily: f.font, bold: f.bold, italic: f.italic, align: b.align, lineHeight: lh,
    }));
  }
  return [bg, ...patches, ...texts];
}
