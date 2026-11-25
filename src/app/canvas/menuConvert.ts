import type { Link } from "./model";

/* «Convertir en carta»: deduce, de los textos de una página hecha a mano (o de un PDF), la carta del editor normal.
   Reglas, por orden:
   - contactos: email (@), web (www., http, dominio) y teléfono (7+ cifras) van a su campo
   - título: el texto más grande de la mitad superior; subtítulo: el primero más pequeño justo debajo
   - precio: un texto que es solo un número (con € o sin él), se une al plato de su misma fila
   - sección: un texto bastante más grande que el cuerpo (la letra más habitual)
   - descripción: un texto en cursiva o más pequeño, justo debajo de un plato
   - el resto: platos
   Es una suposición: puede fallar con diseños raros, por eso se pide confirmación antes y los textos quedan enlazados
   para corregir luego en cualquiera de los dos editores. */

export type ConvText = { id: string; text: string; x: number; y: number; width: number; fontSize: number; italic: boolean };
type Item = { name: string; desc: string; price: string };
export type ConvMenu = { name: string; subtitle: string; phone: string; email: string; web: string; sections: { title: string; items: Item[] }[] };

const PRICE = /^\s*(€\s*)?\d{1,4}([.,]\d{1,2})?\s*(€|eur|euro)?\s*$/i;
const EMAIL = /^\S+@\S+\.\S+$/;
const WEB = /^(https?:\/\/|www\.)\S+$|^[\w-]+(\.[\w-]+)+\/?$/i;
const PHONE = /^(tel\.?|tél\.?|telefono|teléfono)?:?\s*\+?[\d\s().-]{7,}$/i;

export function convertToMenu(all: ConvText[], pageH: number): { menu: ConvMenu; links: Map<string, Omit<Link, "v">> } {
  const texts = all.map((t) => ({ ...t, text: t.text.trim() })).filter((t) => t.text).sort((a, b) => a.y - b.y || a.x - b.x);
  const menu: ConvMenu = { name: "", subtitle: "", phone: "", email: "", web: "", sections: [] };
  const links = new Map<string, Omit<Link, "v">>();
  const used = new Set<string>();
  const take = (t: ConvText, l: Omit<Link, "v">) => {
    used.add(t.id);
    links.set(t.id, l);
  };

  // Contactos (una sola línea cada uno)
  for (const t of texts) {
    if (t.text.includes("\n")) continue;
    if (!menu.email && EMAIL.test(t.text)) {
      menu.email = t.text;
      take(t, { f: "email" });
    } else if (!menu.web && WEB.test(t.text) && !PRICE.test(t.text)) {
      menu.web = t.text;
      take(t, { f: "web" });
    } else if (!menu.phone && PHONE.test(t.text) && t.text.replace(/\D/g, "").length >= 7) {
      menu.phone = t.text;
      take(t, { f: "phone" });
    }
  }

  // Título y subtítulo
  const free = () => texts.filter((t) => !used.has(t.id));
  const top = free().filter((t) => t.y < pageH / 2 && !PRICE.test(t.text));
  const title = (top.length ? top : free()).reduce<ConvText | null>((a, t) => (!a || t.fontSize > a.fontSize ? t : a), null);
  if (title) {
    menu.name = title.text;
    take(title, { f: "name" });
    // justo debajo (menos de 2,5 líneas del título) y sin un precio en su fila (eso sería un plato)
    const priced = (t: ConvText) => texts.some((p) => p !== t && PRICE.test(p.text) && Math.abs(p.y - t.y) < Math.max(p.fontSize, t.fontSize));
    const sub = free().find((t) => t.y > title.y && t.y < title.y + title.fontSize * 2.5 && t.fontSize < title.fontSize && !PRICE.test(t.text) && !priced(t));
    if (sub) {
      menu.subtitle = sub.text;
      take(sub, { f: "subtitle" });
    }
  }

  // Cuerpo: la letra más habitual entre lo que queda (sin precios)
  const rest = free();
  const words = rest.filter((t) => !PRICE.test(t.text));
  const size = (t: ConvText) => Math.round(t.fontSize * 2) / 2;
  const count = new Map<number, number>();
  for (const t of words) count.set(size(t), (count.get(size(t)) ?? 0) + 1);
  const body = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;

  // Secciones, platos y descripciones, de arriba abajo
  type Row = { t: ConvText; s: number; i: number };
  const rows: Row[] = [];
  const section = (name: string) => menu.sections.push({ title: name, items: [] }) - 1;
  let last: Row | null = null;
  for (const t of words) {
    if (t.fontSize >= body * 1.25) {
      take(t, { f: "sec", s: section(t.text) });
      last = null;
      continue;
    }
    const under = last && t.y > last.t.y && t.y - last.t.y < last.t.fontSize * 3;
    if (last && under && !menu.sections[last.s].items[last.i].desc && (t.italic || t.fontSize < body * 0.9)) {
      menu.sections[last.s].items[last.i].desc = t.text;
      take(t, { f: "desc", s: last.s, i: last.i });
      continue;
    }
    if (!menu.sections.length) section("");
    const s = menu.sections.length - 1;
    const i = menu.sections[s].items.push({ name: t.text, desc: "", price: "" }) - 1;
    take(t, { f: "item", s, i });
    last = { t, s, i };
    rows.push(last);
  }

  // Precios: al plato de su misma fila (centros a menos de una línea), sin precio aún y a su izquierda
  for (const p of rest.filter((t) => PRICE.test(t.text))) {
    const cy = p.y + p.fontSize / 2;
    const row = rows
      .filter((r) => !menu.sections[r.s].items[r.i].price && r.t.x < p.x && Math.abs(r.t.y + r.t.fontSize / 2 - cy) < Math.max(r.t.fontSize, p.fontSize))
      .sort((a, b) => Math.abs(a.t.y - p.y) - Math.abs(b.t.y - p.y))[0];
    if (!row) continue;
    menu.sections[row.s].items[row.i].price = p.text;
    take(p, { f: "price", s: row.s, i: row.i });
  }
  return { menu, links };
}
