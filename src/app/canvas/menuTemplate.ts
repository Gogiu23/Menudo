import Konva from "konva";
import type { Menu } from "../Editor";
import { formatPrice } from "../price";
import { common, El, FONTS, FontKey, fontFamily, fontStyleOf, INK, PAPERS, Paper, uid } from "./model";

/* Convierte la carta del editor principal (ContentPage) en elementos del lienzo.
   Se calcula en A4 (210 × 297 mm), con las mismas medidas que el CSS original, y al final se escala al papel. */

const W = 210;
const H = 297;
const PAD = 20;
const INNER = W - 2 * PAD;
const PX = 1 / 3.7795; // 1 px CSS en mm

const DEFAULTS: Menu = {
  name: "", subtitle: "", logo: "", coverOn: false, tiles: true, priceMode: "dish", align: "center",
  textSize: 1, titleSize: 1, noteSize: 1, dishSize: 1, tableBox: true, tableNumbers: [], totalLabel: "",
  totalPrice: "", totalNote: "", cover: "", accent: "#68A7AD", sections: [], address: "", phone: "", email: "", web: "",
};

/** Lee la carta que el editor principal tiene guardada, o null si no hay ninguna. */
export function readSavedMenu(): Menu | null {
  try {
    const raw = localStorage.getItem("menudo:menu");
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

type T = { font?: FontKey; bold?: boolean; italic?: boolean; size: number; lh: number; align?: "left" | "center" | "right"; fill?: string; opacity?: number };

// Se mide a 10× porque los canvas redondean mal las fuentes de pocos píxeles
function measure(text: string, o: T, width?: number) {
  const k = 10;
  const t = new Konva.Text({
    text,
    fontSize: o.size * k,
    fontFamily: fontFamily(o.font ?? "sans"),
    fontStyle: fontStyleOf({ bold: !!o.bold, italic: !!o.italic }),
    lineHeight: o.lh,
    width: width === undefined ? undefined : width * k,
  });
  return { w: t.getTextWidth() / k, h: t.height() / k };
}

function logoSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((done) => {
    const i = new window.Image();
    i.onload = () => done({ w: i.width * PX, h: i.height * PX });
    i.onerror = () => done({ w: 0, h: 0 });
    i.src = src;
  });
}

export async function menuToElements(m: Menu, paper: Paper): Promise<El[]> {
  // Las fuentes web deben estar cargadas antes de medir
  // allSettled: si una fuente no baja (sin red), se mide con la de reserva en vez de fallar
  await Promise.allSettled(
    FONTS.flatMap((f) => ["400", "700", "italic 400", "italic 700"].map((s) => document.fonts.load(`${s} 16px ${fontFamily(f.key)}`))),
  );
  const logo = m.logo ? await logoSize(m.logo) : { w: 0, h: 0 };

  const out: El[] = [];
  const base = (x: number, y: number, width: number, height: number) => ({ id: uid(), x, y, width, height, ...common });

  const text = (t: string, x: number, y: number, width: number, o: T) => {
    const { h } = measure(t, o, width);
    out.push({
      ...base(x, y, width, h + 0.5), type: "text", text: t, fontSize: o.size, fill: o.fill ?? INK, fontFamily: o.font ?? "sans",
      bold: !!o.bold, italic: !!o.italic, align: o.align ?? "left", lineHeight: o.lh, opacity: o.opacity ?? 1,
    });
    return h;
  };
  const bar = (x: number, y: number, w: number, h: number, fill: string) => out.push({ ...base(x, y, w, h), type: "rect", fill, radius: h / 2 });

  const z = m.textSize;
  const total = m.priceMode === "total";
  const center = m.align === "center";
  const white = m.accent.toLowerCase() === "#ffffff";
  const barColor = white ? "#B9C0C1" : m.accent; // ink al 25 % sobre blanco

  /* Baldosas arriba y abajo */
  if (m.tiles) {
    out.push({ ...base(0, 0, W, 10), type: "tiles", fill: m.accent, k: 1 });
    out.push({ ...base(0, H - 6, W, 6), type: "tiles", fill: m.accent, k: 0.6 });
  }
  const top = m.tiles ? 10 : 0;
  const bottom = m.tiles ? H - 6 : H;

  /* Recuadro de «Tavolo n.:» */
  if (m.tableBox) {
    const by = top + 2;
    out.push({ ...base(W - 10 - 32, by, 32, 13), type: "rect", fill: "#ffffff", radius: 1, stroke: INK, strokeW: 0.5 });
    const label = "Tavolo n.:";
    const o: T = { bold: true, size: 4.6, lh: 1.5 };
    const lw = measure(label, o).w;
    text(label, W - 10 - 32 - 3 - lw, by + (13 - 4.6 * 1.5) / 2, lw + 0.5, o);
  }

  /* Cabecera */
  let y = top + (m.tableBox ? 18 : 11);
  if (logo.w > 0) {
    const k = Math.min(1, 60 / logo.w, 24 / logo.h);
    const lw = logo.w * k;
    const lh = logo.h * k;
    out.push({ ...base((W - lw) / 2, y, lw, lh), type: "image", src: m.logo });
    y += lh + 4;
  }
  y += text(m.name, PAD, y, INNER, { font: "display", bold: true, size: 11 * m.titleSize, lh: 1.05, align: "center" });
  if (m.subtitle) {
    y += 2;
    y += text(m.subtitle, PAD, y, INNER, { font: "display", italic: true, size: 5.5, lh: 1.5, align: "center" });
  }
  y += 9;

  /* Pie: dirección y contactos, pegados al fondo */
  const contacts = [m.phone, m.email, m.web].filter(Boolean);
  const fo: T = { size: 3.7, lh: 1.625, align: "center" };
  const footerH = (m.address ? 3.7 * 1.625 : 0) + (contacts.length ? 3.7 * 1.625 : 0);
  const footerTop = bottom - 8 - footerH;
  {
    let fy = footerTop;
    if (m.address) fy += text(m.address, PAD, fy, INNER, { ...fo, bold: true });
    if (contacts.length) {
      const widths = contacts.map((c) => measure(c, fo).w + 0.5);
      let fx = (W - (widths.reduce((a, b) => a + b, 0) + 6 * (contacts.length - 1))) / 2;
      if (fx < PAD) {
        text(contacts.join("   ·   "), PAD, fy, INNER, fo);
      } else {
        contacts.forEach((c, i) => {
          text(c, fx, fy, widths[i], fo);
          fx += widths[i] + 6;
        });
      }
    }
  }

  /* Precio total (modo «a persona») encima del pie */
  let sectionsBottom = footerTop;
  if (total && m.totalPrice) {
    const lab = m.totalLabel ? 5.5 * 1.5 * z : 0;
    const note = m.totalNote ? (0.5 + 3.7 * 1.5 * m.noteSize) * z : 0;
    const blockH = (0.9 + 4) * z + lab + 11 * 1.25 * z + note;
    let ty = footerTop - 7 * z - blockH;
    sectionsBottom = ty;
    bar(W / 2 - 7 * z, ty, 14 * z, 0.9 * z, barColor);
    ty += (0.9 + 4) * z;
    if (m.totalLabel) ty += text(m.totalLabel, PAD, ty, INNER, { font: "display", italic: true, size: 5.5 * z, lh: 1.5, align: "center" });
    ty += text(formatPrice(m.totalPrice), PAD, ty, INNER, { font: "display", bold: true, size: 11 * z, lh: 1.25, align: "center" });
    if (m.totalNote) text(m.totalNote, PAD, ty + 0.5 * z, INNER, { italic: true, size: 3.7 * m.noteSize * z, lh: 1.5, align: "center", fill: "#000000" });
  }

  /* Secciones: se reparten solas por el alto disponible, como justify-evenly del original */
  type Row = { name: string; price: string; desc: string; s: number; h: number };
  const sections = m.sections.map((s) => {
    const rows: Row[] = s.items.map((it) => {
      const k = z * m.dishSize;
      const nameH = 4.4 * 1.5 * k;
      const descH = it.desc ? 0.5 * k + measure(it.desc, { italic: true, size: 3.7 * k, lh: 1.5 }, INNER).h : 0;
      return { name: it.name, price: total ? "" : formatPrice(it.price), desc: it.desc, s: k, h: nameH + descH };
    });
    const head = (7.5 * 1.5 + 1.5 + 0.9 + 5) * z;
    const items = rows.reduce((a, r, i) => a + r.h + (i < rows.length - 1 ? 3.5 * r.s : 0), 0);
    return { title: s.title, rows, h: head + items };
  });
  const gap = 6 * z;
  const used = sections.reduce((a, s) => a + s.h, 0) + gap * Math.max(0, sections.length - 1);
  const free = sectionsBottom - y - used;
  const space = free > 0 ? free / (sections.length + 1) : 0;
  y += space;

  for (const s of sections) {
    let sy = y;
    sy += text(s.title, PAD, sy, INNER, { font: "display", italic: true, size: 7.5 * z, lh: 1.5, align: center ? "center" : "left" });
    sy += 1.5 * z;
    bar(center ? W / 2 - 7 * z : PAD, sy, 14 * z, 0.9 * z, barColor);
    sy += (0.9 + 5) * z;
    s.rows.forEach((r, i) => {
      const o: T = { bold: true, size: 4.4 * r.s, lh: 1.5 };
      const pw = r.price ? measure(r.price, o).w + 0.5 : 0;
      const maxName = INNER - pw - 8 * r.s;
      const nw = Math.min(measure(r.name, o).w + 0.5, maxName);
      const nh = text(r.name, PAD, sy, nw, o);
      if (r.price) text(r.price, PAD + INNER - pw, sy, pw, { ...o, align: "right" });
      // Línea punteada entre el nombre y el precio, a la altura de la base del texto
      const lx = PAD + nw + 2 * r.s;
      const lw = PAD + INNER - (pw ? pw + 2 * r.s : 0) - lx;
      if (lw > 2) out.push({ ...base(lx, sy + o.size * (o.lh / 2 + 0.35) - 0.8 * r.s, lw, 0), type: "line", fill: INK, thickness: 0.6 * r.s, dash: true, opacity: 0.55 });
      sy += nh;
      if (r.desc) {
        sy += 0.5 * r.s;
        sy += text(r.desc, PAD, sy, INNER, { italic: true, size: 3.7 * r.s, lh: 1.5, opacity: 0.75 });
      }
      if (i < s.rows.length - 1) sy += 3.5 * r.s;
    });
    y += s.h + gap + space;
  }

  /* Escala al papel elegido */
  const sc = PAPERS[paper].w / W;
  return out.map((e) => {
    const s = { ...e, x: e.x * sc, y: e.y * sc, width: e.width * sc, height: e.height * sc };
    if (s.type === "text") s.fontSize *= sc;
    if (s.type === "rect") {
      s.radius *= sc;
      if (s.strokeW) s.strokeW *= sc;
    }
    if (s.type === "line") s.thickness *= sc;
    if (s.type === "tiles") s.k *= sc;
    return s;
  });
}
