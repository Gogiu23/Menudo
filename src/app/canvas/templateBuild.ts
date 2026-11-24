import { formatPrice } from "../price";
import { common, El, FontKey, newText, PAPERS, Paper, uid, type ShapeKind } from "./model";
import { contrast, type Spec } from "./templateSpec";

/* Convierte una Spec en los elementos de una página. Se calcula en A4 (210 × 297 mm) y se escala al papel (todas las hojas A
   tienen la misma proporción). Los platos vienen del menú importado (o de un ejemplo): la IA nunca los inventa.
   Si hay demasiado contenido, se reduce el tamaño y, en último caso, se recortan platos: nunca se sale de la hoja. */

export type MenuLike = { name?: string; sections: { title: string; items: { name: string; desc?: string; price: string }[] }[] };

export function sampleMenu(lang: "it" | "es"): MenuLike {
  return lang === "es"
    ? { sections: [
        { title: "Entrantes", items: [{ name: "Plato de ejemplo uno", desc: "Descripción de ejemplo", price: "8,50" }, { name: "Plato de ejemplo dos", price: "9" }, { name: "Plato de ejemplo tres", price: "7,50" }] },
        { title: "Principales", items: [{ name: "Plato de ejemplo cuatro", desc: "Descripción de ejemplo", price: "14" }, { name: "Plato de ejemplo cinco", price: "16,50" }, { name: "Plato de ejemplo seis", price: "12" }] },
        { title: "Postres", items: [{ name: "Postre de ejemplo", price: "6" }, { name: "Otro postre de ejemplo", price: "6,50" }] },
      ] }
    : { sections: [
        { title: "Antipasti", items: [{ name: "Piatto di esempio uno", desc: "Descrizione di esempio", price: "8,50" }, { name: "Piatto di esempio due", price: "9" }, { name: "Piatto di esempio tre", price: "7,50" }] },
        { title: "Primi e secondi", items: [{ name: "Piatto di esempio quattro", desc: "Descrizione di esempio", price: "14" }, { name: "Piatto di esempio cinque", price: "16,50" }, { name: "Piatto di esempio sei", price: "12" }] },
        { title: "Dolci", items: [{ name: "Dolce di esempio", price: "6" }, { name: "Altro dolce di esempio", price: "6,50" }] },
      ] };
}

const ROW = 7.2; // alto de un plato (mm A4)
const DESC = 4.4; // alto extra de su descripción
const HEAD = 10; // alto del título de sección
const GAP = 5; // espacio tras cada sección
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1)).trimEnd()}…` : s);

export function buildTemplate(spec: Spec, paper: Paper, menu: MenuLike | null, lang: "it" | "es"): El[] {
  const k = PAPERS[paper].w / 210;
  const out: El[] = [];
  let data: MenuLike = menu && menu.sections.some((s) => s.items.length) ? menu : sampleMenu(lang);
  data = { ...data, sections: data.sections.filter((s) => s.items.length).slice(0, 8).map((s) => ({ ...s, items: s.items.slice(0, 40) })) };

  const body = spec.bodyFont;
  const onAccent = contrast(spec.accent, "#ffffff") >= contrast(spec.accent, spec.ink) ? "#ffffff" : spec.ink;
  const sectionInk = contrast(spec.accent, spec.bg) >= 3 && (!spec.bgTo || contrast(spec.accent, spec.bgTo) >= 3) ? spec.accent : spec.ink;

  // --- piezas básicas (todo en mm de A4; se escala aquí)
  const text = (t: string, x: number, y: number, w: number, o: { size: number; font: FontKey; bold?: boolean; italic?: boolean; align?: "left" | "center" | "right"; fill?: string; opacity?: number }) =>
    out.push({ ...newText({ x: x * k, y: y * k, width: w * k, height: o.size * k * 1.25, text: t, fontSize: o.size * k, fontFamily: o.font, bold: !!o.bold, italic: !!o.italic, align: o.align ?? "left", fill: o.fill ?? spec.ink, lineHeight: 1.2 }), opacity: o.opacity ?? 1 } as El);
  const rect = (x: number, y: number, w: number, h: number, o: { fill: string; radius?: number; stroke?: string; strokeW?: number; opacity?: number; locked?: boolean; grad?: { to: string; angle: number } }) =>
    out.push({ id: uid(), type: "rect", x: x * k, y: y * k, width: w * k, height: h * k, ...common, opacity: o.opacity ?? 1, locked: !!o.locked, fill: o.fill, grad: o.grad, radius: (o.radius ?? 0) * k, stroke: o.stroke, strokeW: o.strokeW ? o.strokeW * k : undefined });
  const shape = (kind: ShapeKind, x: number, y: number, size: number, fill: string, opacity = 1) =>
    out.push({ id: uid(), type: "shape", kind, x: x * k, y: y * k, width: size * k, height: size * k, ...common, opacity, fill });
  const line = (x: number, y: number, w: number, fill: string, thickness: number, dash = false) =>
    out.push({ id: uid(), type: "line", x: x * k, y: y * k, width: w * k, height: 1, ...common, fill, thickness: thickness * k, dash });

  // --- fondo: un rectángulo bloqueado a hoja completa (así la página lleva su propio color sin tocar el de las demás)
  rect(0, 0, 210, 297, { fill: spec.bg, grad: spec.bgTo ? { to: spec.bgTo, angle: spec.bgAngle } : undefined, locked: true });
  if (spec.decor.includes("circles")) {
    rect(-35, -35, 120, 120, { fill: spec.accent, radius: 60, opacity: 0.16 });
    rect(130, 215, 130, 130, { fill: spec.accent, radius: 65, opacity: 0.16 });
  }
  if (spec.layout === "band") rect(0, 0, 210, 78, { fill: spec.accent });
  if (spec.layout === "frame") {
    rect(10, 10, 190, 277, { fill: "transparent", radius: 3, stroke: spec.accent, strokeW: 0.8 });
    rect(14, 14, 182, 269, { fill: "transparent", radius: 2, stroke: spec.accent, strokeW: 0.3 });
  }
  if (spec.decor.includes("corners")) for (const [x, y] of [[9, 9], [195, 9], [9, 282], [195, 282]]) shape("diamond", x, y, 6, spec.accent);

  // --- cabecera
  const align = spec.layout === "band" ? "left" : "center";
  const hx = 20;
  const hw = 170;
  const titleY = spec.layout === "band" ? 20 : spec.layout === "columns" ? 22 : 32;
  const titleSize = Math.max(10, Math.min(spec.layout === "columns" ? 17 : 22, hw / (Math.max(spec.title.length, 1) * 0.56)));
  const titleInk = spec.layout === "band" ? onAccent : spec.ink;
  const script = spec.titleFont === "greatvibes" || spec.titleFont === "dancing"; // las letras de firma no llevan negrita
  if (spec.decor.includes("stars")) for (let i = 0; i < 3; i++) shape("star", 105 - 12 + i * 12 - 3.5, titleY - 13, 7, spec.accent);
  text(spec.title, hx, titleY, hw, { size: titleSize, font: spec.titleFont, bold: !script, align, fill: titleInk });
  const subY = titleY + titleSize * 1.25 + 3;
  if (spec.subtitle) text(spec.subtitle, hx, subY, hw, { size: 6, font: body, italic: true, align, fill: titleInk, opacity: 0.85 });
  const headEnd = spec.layout === "band" ? 84 : subY + (spec.subtitle ? 11 : 4);
  if (spec.decor.includes("divider")) {
    if (spec.layout === "band") line(20, 90, 50, spec.accent, 0.6);
    else line(105 - 25, headEnd, 50, spec.accent, 0.6);
  }

  // --- contenido: secciones con sus platos
  type Sec = MenuLike["sections"][number];
  const secH = (sec: Sec, s: number) => (HEAD + sec.items.reduce((a, it) => a + ROW + (it.desc ? DESC : 0), 0) + GAP) * s;
  const total = (secs: Sec[]) => secs.reduce((a, sec) => a + secH(sec, 1), 0);
  const fit = (secs: Sec[], avail: number, max = 1.3) => {
    const s0 = secs.map((x) => ({ ...x, items: [...x.items] }));
    // recorta lo mínimo para que, a la escala mínima (0,55), todo quepa
    while (total(s0) * 0.55 > avail && s0.length) {
      const big = s0.reduce((a, b) => (b.items.length > a.items.length ? b : a));
      if (big.items.length > 1) big.items.pop();
      else s0.pop();
    }
    const s = Math.min(max, avail / Math.max(total(s0), 1));
    return { secs: s0, s, v: Math.max(1, Math.min(1.7, avail / Math.max(total(s0) * s, 1))) };
  };
  const place = (sec: Sec, x0: number, y0: number, w: number, s: number, v: number, al: "left" | "center") => {
    let y = y0;
    text(sec.title, x0, y, w, { size: 7.5 * s, font: spec.titleFont, bold: !script, align: al, fill: sectionInk });
    y += HEAD * s * v;
    const priceW = 21 * s;
    const nameW = w - priceW - 2;
    const chars = Math.max(8, Math.floor(nameW / (5 * s * (body === "montserrat" ? 0.66 : 0.58))));
    for (const it of sec.items) {
      text(clip(it.name, chars), x0, y, nameW, { size: 5 * s, font: body });
      const price = formatPrice(it.price);
      if (price) text(price, x0 + w - priceW, y, priceW, { size: 5 * s, font: body, bold: true, align: "right" });
      y += ROW * s * v;
      if (it.desc) {
        text(clip(it.desc, chars + 8), x0, y - 1.4 * s, nameW, { size: 3.4 * s, font: body, italic: true, opacity: 0.75 });
        y += DESC * s * v;
      }
    }
    return y + GAP * s * v;
  };

  const foot = spec.icon ? 262 : 275; // el icono final ocupa el pie
  if (spec.layout === "columns") {
    const top = headEnd + 8;
    // reparto en dos columnas con alturas parecidas
    const colL: Sec[] = [];
    const colR: Sec[] = [];
    for (const sec of data.sections) (total(colL) <= total(colR) ? colL : colR).push(sec);
    const avail = foot - top;
    const fl = fit(colL, avail, 1);
    const fr = fit(colR, avail, 1); // columnas estrechas: no se agranda
    const s = Math.min(fl.s, fr.s);
    const v = Math.min(fl.v, fr.v);
    let yl = top;
    let yr = top;
    for (const sec of fl.secs) yl = place(sec, 20, yl, 80, s, v, "left");
    for (const sec of fr.secs) yr = place(sec, 110, yr, 80, s, v, "left");
  } else {
    const top = headEnd + (spec.layout === "band" ? 10 : 8);
    const { secs, s, v } = fit(data.sections, foot - top);
    let y = top;
    const band = spec.layout === "band";
    const cw = band ? 170 : spec.layout === "frame" ? 130 : 150;
    const cx = band ? 20 : (210 - cw) / 2;
    for (const sec of secs) y = place(sec, cx, y, cw, s, v, band ? "left" : "center");
  }

  if (spec.icon) shape(spec.icon, 105 - 6, 270, 12, spec.accent);
  return out;
}
