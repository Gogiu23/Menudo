import type { El, Link } from "./model";

/* Textos del lienzo enlazados a la carta del editor normal (clave «menudo:menu»).
   Cada enlace guarda en `v` el último valor sincronizado: así se sabe qué lado cambió.
   - pull (al abrir el lienzo): si la carta cambió (valor ≠ v), el texto toma el valor de la carta. Gana la carta.
   - push (al guardar el lienzo): si el texto cambió (texto ≠ v), se escribe en la carta.
   shortcut: los platos se señalan por posición (sección s, plato i); si se reordenan en el editor normal los enlaces se
   cruzan. Arreglo de verdad: dar un id a cada plato en el editor normal. */

type Fmt = (raw: string) => string; // formatPrice: la carta guarda «6,5» y el lienzo muestra «6,50 €»
type MenuData = Record<string, unknown> & { sections?: { title?: unknown; items?: Record<string, unknown>[] }[] };
type Linked = Extract<El, { type: "text" }> & { link: Link };

const TOP: Partial<Record<Link["f"], string>> = { name: "name", subtitle: "subtitle", address: "address", phone: "phone", email: "email", web: "web", totalLabel: "totalLabel", totalPrice: "totalPrice", totalNote: "totalNote" };
const ITEM: Partial<Record<Link["f"], string>> = { item: "name", desc: "desc", price: "price" };
const isPrice = (f: Link["f"]) => f === "price" || f === "totalPrice";

// Valor del campo tal y como se ve en el lienzo, o undefined si la carta ya no lo tiene
export function readValue(m: MenuData, l: Link, fmt: Fmt): string | undefined {
  let raw: unknown;
  if (TOP[l.f]) raw = m[TOP[l.f]!];
  else if (l.f === "sec") raw = m.sections?.[l.s ?? -1]?.title;
  else if (ITEM[l.f]) raw = m.sections?.[l.s ?? -1]?.items?.[l.i ?? -1]?.[ITEM[l.f]!];
  if (typeof raw !== "string") return undefined;
  return isPrice(l.f) ? fmt(raw) : raw;
}

// Escribe el texto en la carta (que ya es una copia). false si el campo ya no existe
function writeValue(m: MenuData, l: Link, text: string): boolean {
  if (TOP[l.f]) {
    m[TOP[l.f]!] = text;
    return true;
  }
  const sec = m.sections?.[l.s ?? -1];
  if (!sec) return false;
  if (l.f === "sec") {
    sec.title = text;
    return true;
  }
  const it = sec.items?.[l.i ?? -1];
  if (!it || !ITEM[l.f]) return false;
  it[ITEM[l.f]!] = text;
  return true;
}

const mapLinked = (pages: El[][], fn: (e: Linked) => El) => {
  let changed = false;
  const next = pages.map((p) =>
    p.map((e) => {
      if (e.type !== "text" || !e.link) return e;
      const r = fn(e as Linked);
      if (r !== e) changed = true;
      return r;
    }),
  );
  return changed ? next : pages;
};

/** Trae al lienzo lo que cambió en la carta. Devuelve las mismas páginas si no hay nada nuevo. */
export function pullLinks(pages: El[][], menu: MenuData | null, fmt: Fmt): El[][] {
  if (!menu) return pages;
  return mapLinked(pages, (e) => {
    const cur = readValue(menu, e.link, fmt);
    return cur === undefined || cur === e.link.v ? e : { ...e, text: cur, link: { ...e.link, v: cur } };
  });
}

/** Lleva a la carta lo que cambió en el lienzo. null si no hay nada que escribir. */
export function pushLinks(pages: El[][], menu: MenuData | null): { menu: MenuData; pages: El[][] } | null {
  if (!menu) return null;
  const m = structuredClone(menu);
  let wrote = false;
  const next = mapLinked(pages, (e) => {
    if (e.text === e.link.v || !writeValue(m, e.link, e.text)) return e;
    wrote = true;
    return { ...e, link: { ...e.link, v: e.text } };
  });
  return wrote ? { menu: m, pages: next } : null;
}

// Validación al leer lo guardado: un enlace dañado se descarta
const FIELDS: Link["f"][] = ["name", "subtitle", "address", "phone", "email", "web", "totalLabel", "totalPrice", "totalNote", "sec", "item", "desc", "price"];
export function okLink(v: unknown): Link | undefined {
  const l = v as Partial<Link> | null | undefined;
  if (!l || !FIELDS.includes(l.f as Link["f"]) || typeof l.v !== "string") return undefined;
  const f = l.f as Link["f"];
  const int = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
  if (f === "sec" && !int(l.s)) return undefined;
  if (ITEM[f] && (!int(l.s) || !int(l.i))) return undefined;
  return { f, v: l.v, ...(int(l.s) ? { s: l.s } : {}), ...(int(l.i) ? { i: l.i } : {}) };
}
