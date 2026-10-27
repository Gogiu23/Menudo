"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { formatPrice } from "./price";
import { LangCtx, T, useT, type Dict, type Lang } from "./i18n";

type Item = { name: string; desc: string; price: string };
type Section = { title: string; items: Item[] };
type Frame = "none" | "line" | "double";
// Desplazamiento (mm), letra y color propios de un texto retocado en escritorio
type Look = { dx?: number; dy?: number; font?: string; color?: string };
// PNG decorativo: posición y ancho en mm sobre la hoja
type Sticker = { src: string; x: number; y: number; w: number };
type Menu = {
  name: string;
  subtitle: string;
  logo: string;
  coverOn: boolean;
  tiles: boolean;
  frame: Frame;
  font: string;
  bodyFont: string;
  ink: string;
  indent: number;
  priceMode: "dish" | "total";
  align: "center" | "left";
  textSize: number;
  titleSize: number;
  noteSize: number;
  tableBox: boolean;
  tableNumbers: string[];
  totalLabel: string;
  totalPrice: string;
  totalNote: string;
  cover: string;
  accent: string;
  sections: Section[];
  stickers: Sticker[];
  looks: Record<string, Look>;
  address: string;
  phone: string;
  email: string;
  web: string;
};
type Layout = "1" | "2" | "4" | "6";

const INK = "#173033";
const PALETTE = ["#68A7AD", "#99C4C8", "#E5CB9F", "#EEE4AB", "#FFFFFF"];

const isWhite = (c: string) => c.toLowerCase() === "#ffffff";

// Variables CSS definidas en layout.tsx
const FONTS: [string, string][] = [
  ["bodoni", "Bodoni"],
  ["titillium", "Titillium"],
  ["playfair", "Playfair"],
  ["lora", "Lora"],
  ["montserrat", "Montserrat"],
  ["greatvibes", "Great Vibes"],
  ["dancing", "Dancing Script"],
];
const fontVar = (f: string) => `var(--font-${f}), serif`;

const STORAGE_KEY = "menudo:menu";
const LANG_KEY = "menudo:lang";

const EMPTY: Menu = {
  name: "Il Mio Ristorante",
  subtitle: "Menù",
  logo: "",
  coverOn: false,
  tiles: true,
  frame: "none",
  font: "bodoni",
  bodyFont: "titillium",
  ink: INK,
  indent: 0,
  priceMode: "dish",
  align: "center",
  textSize: 1,
  titleSize: 1,
  noteSize: 1,
  tableBox: true,
  tableNumbers: [],
  totalLabel: "Prezzo a persona",
  totalPrice: "",
  totalNote: "",
  cover: "",
  accent: "#68A7AD",
  sections: [
    {
      title: "Antipasti",
      items: [{ name: "Bruschetta al pomodoro", desc: "Pane casereccio, pomodoro, basilico", price: "6,50" }],
    },
  ],
  stickers: [],
  looks: {},
  address: "Via Roma 1, Milano",
  phone: "+39 02 0000 0000",
  email: "",
  web: "",
};

// Diseños aplicables: solo tocan el estilo, nunca el contenido
const DESIGNS: Record<keyof Dict["designs"], Partial<Menu>> = {
  amalfi: { tiles: true, frame: "none", font: "bodoni", bodyFont: "titillium", accent: "#68A7AD", ink: INK, align: "center" },
  elegante: { tiles: false, frame: "double", font: "playfair", bodyFont: "lora", accent: "#B08D57", ink: "#2B2118", align: "center" },
  moderno: { tiles: false, frame: "none", font: "montserrat", bodyFont: "montserrat", accent: "#173033", ink: "#111111", align: "left" },
  trattoria: { tiles: false, frame: "line", font: "greatvibes", bodyFont: "lora", accent: "#8C2F2F", ink: "#5A1E1E", align: "center" },
};

// Hoja A4 en mm y tamaño de cada hueco según cuántas copias caben
// pw/ph: tamaño en mm con el que se maqueta cada copia antes de escalarla (por defecto A4)
const SHEETS: Record<Layout, { w: number; h: number; cols: number; scale: number; orient: string; pw?: number; ph?: number }> = {
  "1": { w: 210, h: 297, cols: 1, scale: 1, orient: "portrait" },
  "2": { w: 297, h: 210, cols: 2, scale: 148.5 / 210, orient: "landscape" },
  "4": { w: 210, h: 297, cols: 2, scale: 0.5, orient: "portrait" },
  // Tarjetas de plato: 3×2 en vertical, 70×148,5 mm cada una (estrechas). Maquetadas a 100 mm de ancho
  // para escalarlas al 70 % y no al 33 %: el texto sigue siendo legible
  "6": { w: 210, h: 297, cols: 3, scale: 0.7, orient: "portrait", pw: 100, ph: 148.5 / 0.7 },
};

function load(): Menu {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function loadLang(): Lang {
  try {
    const l = localStorage.getItem(LANG_KEY);
    if (l === "it" || l === "es") return l;
  } catch {}
  return navigator.language.startsWith("es") ? "es" : "it";
}

// Reduce la imagen: las fotos del iPhone pesan varios MB y no caben en localStorage
async function readImage(file: Blob | undefined, maxPx: number, type: "image/jpeg" | "image/png", done: (url: string) => void) {
  if (!file) return;
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  done(canvas.toDataURL(type, 0.85));
}

/* ---------- Archivo: cada carta se guarda sola y se borra 30 días después de su último cambio ---------- */
/* IndexedDB y no localStorage: con logo y foto, localStorage (~5 MB) se llena con pocas cartas */

type Saved = { id: string; savedAt: number; menu: Menu };
const TTL = 30 * 24 * 60 * 60 * 1000;
const CURRENT_KEY = "menudo:current";

// id sin crypto.randomUUID: no existe en http (p. ej. iPhone en la red local)
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function loadCurrentId() {
  try {
    return localStorage.getItem(CURRENT_KEY) ?? newId();
  } catch {
    return newId();
  }
}

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("menudo", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("archive", { keyPath: "id" });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction("archive", mode).objectStore("archive"));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    };
  });
}

const archive = {
  // Devuelve las cartas de los últimos 30 días (más recientes primero) y borra las caducadas
  async list(): Promise<Saved[]> {
    const all = await idb<Saved[]>("readonly", (s) => s.getAll());
    const expired = all.filter((a) => Date.now() - a.savedAt > TTL);
    await Promise.all(expired.map((a) => idb("readwrite", (s) => s.delete(a.id))));
    return all.filter((a) => !expired.includes(a)).sort((a, b) => b.savedAt - a.savedAt);
  },
  save: (id: string, menu: Menu) => idb("readwrite", (s) => s.put({ id, savedAt: Date.now(), menu } satisfies Saved)),
  remove: (id: string) => idb("readwrite", (s) => s.delete(id)),
};

const fmtDate = (t: number, locale: string) => new Date(t).toLocaleDateString(locale, { day: "numeric", month: "long" });
const fmtTime = (t: number, locale: string) => new Date(t).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

function move<T>(arr: T[], i: number, d: number) {
  const j = i + d;
  if (j >= 0 && j < arr.length) [arr[i], arr[j]] = [arr[j], arr[i]];
  return arr;
}

/* ---------- Edición directa sobre la vista previa (solo escritorio) ---------- */

type Edit = { sel: string | null; pick: (k: string | null) => void; drop: (k: string, dx: number, dy: number) => void };
const EditCtx = createContext<Edit | null>(null);

const halfMm = (v: number) => Math.round(v * 2) / 2;

// Texto o imagen que se coloca con un desplazamiento en mm. Con EditCtx (vista previa de escritorio) además se arrastra y se selecciona.
function Movable(props: { k: string; look?: Look; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const { k, look, className = "", style, children } = props;
  const edit = useContext(EditCtx);
  const [live, setLive] = useState<[number, number] | null>(null);
  const [dx, dy] = live ?? [look?.dx ?? 0, look?.dy ?? 0];

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!edit || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    edit.pick(k);
    const el = e.currentTarget;
    // px de pantalla por mm de hoja, sea cual sea el zoom de la vista previa o la escala de la copia
    const page = el.closest<HTMLElement>("[data-page]")!;
    const pxPerMm = page.getBoundingClientRect().width / (parseFloat(getComputedStyle(page).getPropertyValue("--page-w")) || 210);
    const [x0, y0] = [e.clientX, e.clientY];
    let pos: [number, number] = [dx, dy];
    el.setPointerCapture(e.pointerId);
    el.onpointermove = (ev) => setLive((pos = [halfMm(dx + (ev.clientX - x0) / pxPerMm), halfMm(dy + (ev.clientY - y0) / pxPerMm)]));
    el.onpointerup = el.onpointercancel = () => {
      el.onpointermove = el.onpointerup = el.onpointercancel = null;
      setLive(null);
      if (pos[0] !== dx || pos[1] !== dy) edit.drop(k, ...pos);
    };
  };

  const ring = !edit ? "" : edit.sel === k ? "outline-2 outline-dashed outline-mare" : "hover:outline-1 hover:outline-dashed hover:outline-mare/70";
  return (
    <div
      data-k={k}
      onPointerDown={onPointerDown}
      className={`${className} ${edit ? "cursor-move touch-none select-none" : ""} ${ring}`}
      style={
        {
          ...style,
          translate: dx || dy ? `${dx}mm ${dy}mm` : undefined,
          ...(look?.font && { fontFamily: fontVar(look.font), "--font-display": fontVar(look.font), "--font-sans": fontVar(look.font) }),
          ...(look?.color && { color: look.color, "--color-ink": look.color }),
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

/* ---------- Carta impresa ---------- */

// Baldosa de mayólica (costa amalfitana) en el color elegido; k escala el tamaño de la baldosa
function Tile({ color, k = 1, className = "", style }: { color: string; k?: number; className?: string; style?: React.CSSProperties }) {
  const id = `tile-${color.slice(1)}-${Math.round(k * 10)}`;
  return (
    <svg aria-hidden className={`block w-full shrink-0 ${className}`} style={style}>
      <defs>
        <pattern id={id} width="38" height="38" patternUnits="userSpaceOnUse" patternTransform={`scale(${k})`}>
          <rect width="38" height="38" fill={color} />
          <g fill={isWhite(color) ? INK : "#fff"} fillOpacity={isWhite(color) ? 0.12 : 1}>
            {[[0, 0], [38, 0], [0, 38], [38, 38]].map(([x, y]) => (
              <circle key={`${x}${y}`} cx={x} cy={y} r="9" />
            ))}
            <ellipse cx="19" cy="10" rx="3.6" ry="6.5" />
            <ellipse cx="19" cy="28" rx="3.6" ry="6.5" />
            <ellipse cx="10" cy="19" rx="6.5" ry="3.6" />
            <ellipse cx="28" cy="19" rx="6.5" ry="3.6" />
          </g>
          <g fill={INK}>
            <circle cx="19" cy="19" r="2.6" />
            {[[0, 0], [38, 0], [0, 38], [38, 38]].map(([x, y]) => (
              <circle key={`${x}${y}`} cx={x} cy={y} r="2.2" />
            ))}
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

// Letras y color de toda la hoja: se redefinen las variables que usan font-display, font-sans y text-ink
const pageVars = (m: Menu) =>
  ({ "--font-display": fontVar(m.font), "--font-sans": fontVar(m.bodyFont), "--color-ink": m.ink }) as React.CSSProperties;

const decoColor = (m: Menu) => (isWhite(m.accent) ? "rgb(23 48 51 / 0.25)" : m.accent);
const frameBorder = (m: Menu) => (m.frame === "double" ? `1.6mm double ${decoColor(m)}` : `0.5mm solid ${decoColor(m)}`);

// p: prefijo de las claves, para que portada y página interior se muevan por separado
function Masthead({ m, size, p = "" }: { m: Menu; size: "cover" | "page"; p?: string }) {
  const cover = size === "cover";
  const mv = (k: string) => ({ k: p + k, look: m.looks[p + k] });
  return (
    <div className="text-center">
      {m.logo && (
        <Movable {...mv("logo")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.logo} alt="" draggable={false} className={`mx-auto object-contain ${cover ? "mb-[6mm] max-h-[38mm] max-w-[80mm]" : "mb-[4mm] max-h-[24mm] max-w-[60mm]"}`} />
        </Movable>
      )}
      <Movable {...mv("name")}>
        <h1 className={`font-display leading-[1.05] font-semibold text-balance ${cover ? "text-[15mm]" : "text-[11mm]"}`} style={{ zoom: m.titleSize }}>
          {m.name}
        </h1>
      </Movable>
      {m.subtitle && (
        <Movable {...mv("subtitle")}>
          <p className={`mt-[2mm] font-display italic ${cover ? "text-[7mm]" : "text-[5.5mm]"}`}>{m.subtitle}</p>
        </Movable>
      )}
    </div>
  );
}

function CoverPage({ m }: { m: Menu }) {
  return (
    <div data-page className="relative grid h-[var(--page-h,297mm)] w-[var(--page-w,210mm)] place-items-center overflow-hidden bg-white font-sans text-ink" style={pageVars(m)}>
      {m.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        m.tiles && <Tile color={m.accent} k={1.6} className="absolute inset-0 h-full" />
      )}
      <div className="relative w-[150mm] bg-white">
        {m.tiles && <Tile color={m.accent} style={{ height: "8mm" }} k={0.8} />}
        <div className="px-[14mm] py-[14mm]" style={m.frame === "none" || m.tiles ? undefined : { border: frameBorder(m) }}>
          <Masthead m={m} size="cover" p="cover-" />
        </div>
      </div>
    </div>
  );
}

function ContentPage({ m, table = "" }: { m: Menu; table?: string }) {
  const t = useT();
  const contacts = [m.phone, m.email, m.web].filter(Boolean);
  const total = m.priceMode === "total";
  const center = m.align === "center";
  const bar = decoColor(m);
  const mv = (k: string) => ({ k, look: m.looks[k] });
  const framed = m.frame !== "none";
  return (
    <div data-page className="relative flex h-[var(--page-h,297mm)] w-[var(--page-w,210mm)] flex-col overflow-hidden bg-white font-sans text-ink" style={pageVars(m)}>
      {m.tiles && <Tile color={m.accent} style={{ height: "10mm" }} />}
      {framed && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[7mm]"
          style={{ top: m.tiles ? "13mm" : "7mm", bottom: m.tiles ? "9mm" : "7mm", border: frameBorder(m) }}
        />
      )}
      {/* Con marco, la mesa y el contenido se apartan para no pisar la línea */}
      <div className={`relative flex flex-1 flex-col overflow-hidden px-[20mm] pb-[8mm] ${m.tableBox ? (framed ? "pt-[26mm]" : "pt-[18mm]") : framed ? "pt-[15mm]" : "pt-[11mm]"}`}>
        {/* Recuadro vacío para escribir a boli el número de mesa (hasta 4 cifras) */}
        {m.tableBox && (
          <Movable
            {...mv("table")}
            className={`absolute flex items-center gap-[2mm] text-[4.6mm] font-semibold ${framed ? "top-[10mm] right-[13mm]" : "top-[2mm] right-[10mm]"}`}
          >
            <span className="mr-[1mm]">{t.tableLabel}</span>
            <span className="grid h-[13mm] w-[32mm] place-items-center rounded-[1mm] border-[0.5mm] border-ink font-display text-[8mm] leading-none">
              {table}
            </span>
          </Movable>
        )}
        <Masthead m={m} size="page" />

        {/* justify-evenly: las secciones se reparten solas por todo el alto disponible */}
        <div
          data-sections
          className="mt-[9mm] flex flex-1 flex-col justify-evenly gap-[6mm] overflow-hidden"
          style={{ zoom: m.textSize }}
        >
          {m.sections.map((s, i) => (
            // ponytail: la clave es la posición; al reordenar secciones, el retoque se queda en el hueco. Ids por sección si molesta.
            <Movable key={i} {...mv(`s${i}`)} className="break-inside-avoid">
              <h2 className={`font-display text-[7.5mm] italic ${center ? "text-center" : ""}`}>{s.title}</h2>
              <div className={`mt-[1.5mm] mb-[5mm] h-[0.9mm] w-[14mm] rounded-full ${center ? "mx-auto" : ""}`} style={{ background: bar }} />
              {s.items.map((it, j) => (
                <div key={j} className="mb-[3.5mm] last:mb-0" style={{ paddingLeft: `${m.indent}mm` }}>
                  <div className="flex items-baseline gap-[2mm] text-[4.4mm] font-semibold">
                    <span>{it.name}</span>
                    <span className="flex-1 translate-y-[-0.8mm] border-b-[0.6mm] border-dotted border-ink/55" />
                    {!total && <span className="tabular-nums">{formatPrice(it.price)}</span>}
                  </div>
                  {it.desc && <p className="mt-[0.5mm] text-[3.7mm] font-light italic text-ink/75">{it.desc}</p>}
                </div>
              ))}
            </Movable>
          ))}
        </div>

        {total && m.totalPrice && (
          <Movable {...mv("total")} className="mb-[7mm] text-center" style={{ zoom: m.textSize }}>
            <div className="mx-auto mb-[4mm] h-[0.9mm] w-[14mm] rounded-full" style={{ background: bar }} />
            {m.totalLabel && <p className="font-display text-[5.5mm] italic">{m.totalLabel}</p>}
            <p className="font-display text-[11mm] leading-tight font-semibold tabular-nums">{formatPrice(m.totalPrice)}</p>
            {m.totalNote && (
              <p className="mt-[0.5mm] text-[3.7mm] text-black italic" style={{ zoom: m.noteSize }}>
                {m.totalNote}
              </p>
            )}
          </Movable>
        )}

        <Movable {...mv("footer")} className="text-center text-[3.7mm] leading-relaxed">
          <footer>
            {m.address && <p className="font-semibold">{m.address}</p>}
            {contacts.length > 0 && (
              <p className="flex flex-wrap justify-center gap-x-[6mm]">
                {contacts.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </p>
            )}
          </footer>
        </Movable>
      </div>
      {m.tiles && <Tile color={m.accent} style={{ height: "6mm" }} k={0.6} />}

      {/* PNG decorativos, encima de todo */}
      {m.stickers.map((s, i) => (
        <Movable key={i} k={`img${i}`} look={{ dx: s.x, dy: s.y }} className="absolute top-0 left-0 z-10" style={{ width: `${s.w}mm` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.src} alt="" draggable={false} className="block w-full" />
        </Movable>
      ))}
    </div>
  );
}

// Variables CSS que fijan el tamaño de la página (ContentPage y CoverPage las leen)
const pageSize = (layout: Layout) => {
  const s = SHEETS[layout];
  return { "--page-w": `${s.pw ?? 210}mm`, "--page-h": `${s.ph ?? 297}mm` } as React.CSSProperties;
};

function Sheet({ layout, page }: { layout: Layout; page: (copy: number) => React.ReactNode }) {
  const s = SHEETS[layout];
  return (
    <div
      className="grid overflow-hidden bg-white"
      style={{ width: `${s.w}mm`, height: `${s.h}mm`, gridTemplateColumns: `repeat(${s.cols}, 1fr)` }}
    >
      {Array.from({ length: Number(layout) }, (_, i) => (
        <div key={i} className="flex items-center justify-center overflow-hidden outline-1 outline-laguna outline-dashed print:outline-none">
          <div style={{ width: `${(s.pw ?? 210) * s.scale}mm`, height: `${(s.ph ?? 297) * s.scale}mm` }}>
            <div style={{ ...pageSize(layout), transform: `scale(${s.scale})`, transformOrigin: "top left" }}>{page(i)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Escala la hoja para que quepa en el ancho disponible (móvil incluido)
// scale: zoom elegido por el usuario sobre el ajuste a la pantalla (1 = ajustada)
function Preview({ layout, scale, children }: { layout: Layout; scale: number; children: React.ReactNode }) {
  const [fit, setFit] = useState(0.6);
  const ref = useRef<HTMLDivElement>(null);
  const sheetPx = SHEETS[layout].w * 3.7795; // mm → px CSS
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(([e]) => setFit(Math.min(0.75, e.contentRect.width / sheetPx)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [sheetPx]);
  return (
    // justify-center-safe: con zoom, la hoja se desplaza en vez de cortarse por la izquierda
    <div ref={ref} className="flex w-full justify-center-safe overflow-x-auto">
      <div className="w-fit shadow-[0_18px_40px_-18px_rgb(23_48_51/0.45)]" style={{ zoom: fit * scale }}>
        {children}
      </div>
    </div>
  );
}

function Thumbnail({ m, k = 0.12 }: { m: Menu; k?: number }) {
  return (
    <div className="shrink-0 overflow-hidden rounded-sm bg-white shadow ring-1 ring-ink/10" style={{ width: `${210 * k}mm`, height: `${297 * k}mm` }}>
      <div style={{ transform: `scale(${k})`, transformOrigin: "top left" }}>
        <ContentPage m={m} />
      </div>
    </div>
  );
}

/* ---------- Interfaz del editor ---------- */

const ICONS = {
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  print: "M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5a.5.5 0 1 0 0-1",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  archive: "M3 4h18v4H3zM5 8v12h14V8M10 12h4",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  share: "M12 3v12M8 7l4-4 4 4M7 11H5v10h14V11h-2",
  close: "M6 6l12 12M18 6L6 18",
};

function Icon({ d, className = "size-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const input = `w-full rounded-lg border border-laguna bg-white px-3 py-2.5 text-base placeholder:text-ink/40 md:py-2 md:text-[15px] focus:border-mare focus:outline-2 focus:outline-offset-0 focus:outline-mare/40`;
const primary = `inline-flex items-center justify-center gap-2 rounded-lg bg-mare px-5 py-2.5 font-semibold text-ink transition-colors hover:bg-laguna ${focus}`;
// relative: contiene el input sr-only (absolute) del botón de subir imagen
const secondary = `relative inline-flex cursor-pointer items-center gap-2 rounded-lg border border-mare bg-white px-3 py-2 text-sm font-semibold transition-colors hover:bg-laguna/25 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink`;
const iconBtn = `grid size-11 shrink-0 place-items-center rounded-lg text-ink/70 transition-colors hover:bg-laguna/30 hover:text-ink disabled:pointer-events-none disabled:opacity-25 md:size-9 ${focus}`;
const colorSwatch =
  "size-11 cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0 ring-1 ring-ink/15 ring-offset-2 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0";

const TEXT_SIZES = [0.85, 1, 1.15, 1.3, 1.5, 1.75];

const sizeName = (t: Dict, v: number) => t.sizes[TEXT_SIZES.indexOf(v)];

// Seis «A» de tamaño creciente
function SizePicker({ name, value, onChange }: { name: string; value: number; onChange: (v: number) => void }) {
  const t = useT();
  return (
    <Segmented
      name={name}
      value={String(value)}
      options={TEXT_SIZES.map((v, i) => [
        String(v),
        <span key={v} className="font-display leading-none font-semibold" style={{ fontSize: 13 + i * 3.5 }} title={t.sizes[i]}>
          A<span className="sr-only"> {t.sizes[i]}</span>
        </span>,
      ])}
      onChange={(v) => onChange(Number(v))}
    />
  );
}

function OverflowWarning() {
  const t = useT();
  return (
    <p role="status" className="mx-auto w-full max-w-md rounded-lg bg-sabbia px-3 py-2 text-sm font-semibold">
      {t.overflow}
    </p>
  );
}

function Segmented<T extends string>(props: { name: string; value: T; options: [T, React.ReactNode][]; onChange: (v: T) => void }) {
  const { name, value, options, onChange } = props;
  return (
    <div className="grid gap-1 rounded-lg bg-laguna/30 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(([v, label]) => (
        <label
          key={v}
          className={`relative grid cursor-pointer place-items-center rounded-md py-2 text-center text-sm transition-colors focus-within:outline-2 focus-within:outline-ink ${
            value === v ? "bg-white font-semibold shadow-sm" : "text-ink/70"
          }`}
        >
          <input type="radio" name={name} className="sr-only" checked={value === v} onChange={() => onChange(v)} />
          {label}
        </label>
      ))}
    </div>
  );
}

function FontSelect({ value, onChange, className = input }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {FONTS.map(([id, label]) => (
        <option key={id} value={id} style={{ fontFamily: fontVar(id) }}>
          {label}
        </option>
      ))}
    </select>
  );
}

// Precio sin escribir el €: el símbolo se ve fijo en el campo y se añade al imprimir (formatPrice)
function PriceInput(props: { value: string; onChange: (v: string) => void; label?: string; placeholder?: string; className?: string }) {
  const { value, onChange, label, placeholder = "0,00", className = "" } = props;
  return (
    <div className={`relative ${className}`}>
      <input
        className={`${input} pr-7 text-right tabular-nums`}
        aria-label={label}
        placeholder={placeholder}
        inputMode="decimal"
        value={value.replace(/\s*€\s*/g, "")}
        onChange={(e) => onChange(e.target.value.replace(/€/g, ""))}
      />
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink/60">
        €
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-laguna/50 px-5 py-6 first:border-t-0">
      <div>
        <h2 className="font-display text-[22px] leading-tight font-semibold">{title}</h2>
        {hint && <p className="mt-1 text-sm text-ink/65">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function ImagePicker(props: { label: string; value: string; maxPx: number; type: "image/jpeg" | "image/png"; onChange: (url: string) => void }) {
  const { label, value, maxPx, type, onChange } = props;
  const t = useT();
  return (
    <div className="flex items-center gap-4">
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-mare bg-laguna/15 text-mare">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value ? <img src={value} alt="" className="h-full w-full object-contain" /> : <Icon d={ICONS.image} className="size-7" />}
      </div>
      <div className="flex flex-col items-start gap-1">
        <label className={secondary}>
          {value ? t.changeImage : label}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              readImage(e.target.files?.[0], maxPx, type, onChange);
              e.target.value = ""; // permite volver a elegir el mismo archivo
            }}
          />
        </label>
        {value && (
          <button className={`rounded px-1 py-2 text-sm text-ink/70 underline underline-offset-2 hover:text-ink ${focus}`} onClick={() => onChange("")}>
            {t.remove}
          </button>
        )}
      </div>
    </div>
  );
}

// Busca PNG transparentes en Pixabay (vía /api/images) y añade el elegido como imagen del menú
function ImageSearch({ onPick }: { onPick: (img: Blob) => void }) {
  const t = useT();
  const lang = useContext(LangCtx);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: number; thumb: string; src: string }[]>([]);
  const [status, setStatus] = useState<"" | "searching" | "noResults" | "searchError" | "searchNoKey">("");
  const [adding, setAdding] = useState<number | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setStatus("searching");
    try {
      const r = await fetch(`/api/images?lang=${lang}&q=${encodeURIComponent(q)}`);
      const data = await r.json();
      if (!r.ok) return setStatus(data.error === "nokey" ? "searchNoKey" : "searchError");
      setHits(data);
      setStatus(data.length ? "" : "noResults");
    } catch {
      setStatus("searchError");
    }
  };

  const pick = async (h: (typeof hits)[number]) => {
    setAdding(h.id);
    try {
      const r = await fetch(`/api/images?img=${encodeURIComponent(h.src)}`);
      if (!r.ok) throw new Error();
      onPick(await r.blob());
    } catch {
      setStatus("searchError");
    }
    setAdding(null);
  };

  return (
    <div className="space-y-3">
      <form role="search" className="flex gap-2" onSubmit={search}>
        <input className={input} type="search" aria-label={t.searchImages} placeholder={t.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={`${primary} px-4`} disabled={status === "searching"}>
          {t.search}
        </button>
      </form>
      <p className="text-sm text-ink/65" aria-live="polite">
        {status && t[status]}
      </p>
      {hits.length > 0 && (
        <>
          <div className="grid grid-cols-4 gap-2">
            {hits.map((h) => (
              <button
                key={h.id}
                className={`aspect-square rounded-lg bg-[repeating-conic-gradient(#e5eef0_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-1 ring-1 ring-laguna transition hover:ring-2 hover:ring-mare disabled:opacity-40 ${focus}`}
                aria-label={t.addImage}
                disabled={adding !== null}
                onClick={() => pick(h)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={h.thumb} alt="" loading="lazy" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
          {/* Pixabay exige indicar el origen junto a los resultados */}
          <a href="https://pixabay.com/" target="_blank" rel="noreferrer" className="text-sm text-ink/65 underline underline-offset-2">
            {t.fromPixabay}
          </a>
        </>
      )}
    </div>
  );
}

/* ---------- Acceso (modo desarrollador) ---------- */
// ponytail: cuentas solo en este navegador y el código de verificación se muestra en pantalla en vez de enviarse por email.
// Para producción: cuentas en servidor (base de datos + envío de email) y sesión con cookie.
type Account = { hash: string; code: string | null }; // code null = email verificado
const USERS_KEY = "menudo:users";
const SESSION_KEY = "menudo:session";

function loadAccounts(): Record<string, Account> {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function loadSession() {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

async function hashPassword(email: string, pw: string) {
  // crypto.subtle no existe en http (p. ej. iPhone en la red local): en ese caso, sin hash (solo desarrollo)
  if (!crypto.subtle) return pw;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${email}\n${pw}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  const t = T[lang];
  return (
    <div role="group" aria-label={t.lang} className="flex shrink-0 gap-1 rounded-lg bg-laguna/30 p-1 text-sm">
      {(["it", "es"] as const).map((l) => (
        <button
          key={l}
          aria-pressed={lang === l}
          className={`rounded-md px-2.5 py-1.5 uppercase ${focus} ${lang === l ? "bg-white font-semibold shadow-sm" : "text-ink/70"}`}
          onClick={() => onChange(l)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Login({ onLogin, lang, onLang }: { onLogin: (email: string) => void; lang: Lang; onLang: (l: Lang) => void }) {
  const t = T[lang];
  const [mode, setMode] = useState<"login" | "signup" | "verify">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<"" | "badLogin" | "accountExists" | "badCode">("");

  const save = (accounts: Record<string, Account>) => localStorage.setItem(USERS_KEY, JSON.stringify(accounts));
  const enter = (e: string) => {
    localStorage.setItem(SESSION_KEY, e);
    onLogin(e);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError("");
    const e = email.trim().toLowerCase();
    const accounts = loadAccounts();
    if (mode === "verify") {
      if (code.trim() !== accounts[e]?.code) return setError("badCode");
      save({ ...accounts, [e]: { ...accounts[e], code: null } });
      return enter(e);
    }
    const hash = await hashPassword(e, pw);
    if (mode === "signup") {
      if (accounts[e]) return setError("accountExists");
      save({ ...accounts, [e]: { hash, code: String(100000 + Math.floor(Math.random() * 900000)) } });
      return setMode("verify");
    }
    if (accounts[e]?.hash !== hash) return setError("badLogin");
    if (accounts[e].code) return setMode("verify");
    enter(e);
  };

  const devCode = mode === "verify" ? loadAccounts()[email.trim().toLowerCase()]?.code : null;
  const title = { login: t.login, signup: t.signup, verify: t.verifyTitle }[mode];

  return (
    <LangCtx value={lang}>
      <div className="flex min-h-dvh flex-col bg-laguna/35">
        <header className="bg-white pt-[env(safe-area-inset-top)]">
          <Tile color="#68A7AD" k={0.42} style={{ height: 16 }} />
          <div className="flex items-center justify-between border-b border-laguna/60 px-5 py-3">
            <p className="font-display text-[28px] leading-none font-semibold">Menudo</p>
            <LangToggle lang={lang} onChange={onLang} />
          </div>
        </header>
        <main className="grid flex-1 place-items-center px-4 py-8">
          <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-laguna/60">
            <h1 className="font-display text-[28px] leading-tight font-semibold">{title}</h1>
            {mode === "verify" ? (
              <>
                <p className="text-ink/70">{t.verifyIntro(email.trim())}</p>
                <p role="status" className="rounded-lg bg-sabbia px-3 py-2 text-sm font-semibold">
                  {t.devCode(devCode ?? "")}
                </p>
                <Field label={t.code}>
                  <input className={input} required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" value={code} onChange={(e) => setCode(e.target.value)} />
                </Field>
              </>
            ) : (
              <>
                <Field label={t.email}>
                  <input className={input} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label={t.password}>
                  <input
                    className={input}
                    type="password"
                    required
                    minLength={mode === "signup" ? 8 : undefined}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                  />
                </Field>
                {mode === "signup" && <p className="-mt-2 text-sm text-ink/65">{t.passwordHint}</p>}
              </>
            )}
            {error && (
              <p role="alert" className="text-sm font-semibold text-red-700">
                {t[error]}
              </p>
            )}
            <button className={`${primary} w-full`}>{mode === "verify" ? t.verify : title}</button>
            <button
              type="button"
              className={`w-full rounded py-2 text-sm text-ink/70 underline underline-offset-2 hover:text-ink ${focus}`}
              onClick={() => {
                setError("");
                setMode(mode === "login" ? "signup" : "login");
              }}
            >
              {mode === "login" ? t.noAccount : t.haveAccount}
            </button>
          </form>
        </main>
      </div>
    </LangCtx>
  );
}

// Selector de formato con un dibujo de cómo queda la hoja
const ZOOMS = [1, 1.5, 2, 3, 4];

function ZoomControl({ value, onChange }: { value: number; onChange: (z: number) => void }) {
  const t = useT();
  const i = ZOOMS.indexOf(value);
  return (
    <div role="group" aria-label={t.zoom} className="mx-auto flex items-center gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-laguna/60">
      <button className={iconBtn} aria-label={t.zoomOut} disabled={i === 0} onClick={() => onChange(ZOOMS[i - 1])}>
        <Icon d={ICONS.minus} />
      </button>
      <button className={`min-w-16 rounded-md px-2 py-1.5 text-sm font-semibold tabular-nums hover:bg-laguna/30 ${focus}`} title={t.zoomFit} onClick={() => onChange(1)}>
        {value * 100}%
      </button>
      <button className={iconBtn} aria-label={t.zoomIn} disabled={i === ZOOMS.length - 1} onClick={() => onChange(ZOOMS[i + 1])}>
        <Icon d={ICONS.plus} />
      </button>
    </div>
  );
}

function LayoutPicker({ value, onChange }: { value: Layout; onChange: (l: Layout) => void }) {
  const t = useT();
  return (
    <fieldset className="relative flex justify-center gap-2">
      <legend className="sr-only">{t.formatLegend}</legend>
      {(Object.keys(SHEETS) as Layout[]).map((l) => {
        const s = SHEETS[l];
        const on = value === l;
        return (
          <label
            key={l}
            className={`relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition-colors focus-within:outline-2 focus-within:outline-ink ${
              on ? "bg-white font-semibold shadow-sm ring-2 ring-mare" : "hover:bg-white/60"
            }`}
          >
            <input type="radio" name="layout" className="sr-only" checked={on} onChange={() => onChange(l)} />
            <span className="grid h-10 place-items-center">
            <span
              className="grid gap-[2px] rounded-[3px] border border-ink/50 bg-white p-[2px]"
              style={{ width: s.w / 8, height: s.h / 8, gridTemplateColumns: `repeat(${s.cols}, 1fr)` }}
            >
              {Array.from({ length: Number(l) }, (_, i) => (
                <span key={i} className={`rounded-[1px] ${on ? "bg-mare" : "bg-laguna/70"}`} />
              ))}
            </span>
            </span>
            {t.layouts[l]}
          </label>
        );
      })}
    </fieldset>
  );
}

/* ---------- Instalación como app (PWA) ---------- */

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const INSTALL_KEY = "menudo:install-dismissed";

function isDismissed() {
  try {
    return !!localStorage.getItem(INSTALL_KEY);
  } catch {
    return false;
  }
}

// Android/Chrome/Edge: botón que abre el instalador. iPhone: Safari no tiene API de instalación, así que explicamos los pasos.
function InstallPrompt() {
  const t = useT();
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [iosHelp, setIosHelp] = useState(() => {
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return ios && !standalone && !isDismissed();
  });

  useEffect(() => {
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
    const onPrompt = (e: Event) => {
      e.preventDefault(); // sustituimos el aviso del navegador por el nuestro
      if (!isDismissed()) setEvent(e as InstallEvent);
    };
    const onInstalled = () => setEvent(null);
    addEventListener("beforeinstallprompt", onPrompt);
    addEventListener("appinstalled", onInstalled);
    return () => {
      removeEventListener("beforeinstallprompt", onPrompt);
      removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(INSTALL_KEY, "1");
    } catch {}
    setEvent(null);
    setIosHelp(false);
  };

  const install = async () => {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    setEvent(null);
  };

  if (!event && !iosHelp) return null;
  return (
    <aside
      aria-label={t.install}
      className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex items-start gap-3 rounded-2xl bg-white p-4 shadow-[0_18px_40px_-12px_rgb(23_48_51/0.45)] ring-1 ring-laguna md:inset-x-auto md:right-6 md:bottom-6 md:w-96 print:hidden"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" className="size-12 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t.install}</p>
        {event ? (
          <>
            <p className="text-sm text-ink/70">{t.installHint}</p>
            <button className={`${primary} mt-3 py-2`} onClick={install}>
              {t.installBtn}
            </button>
          </>
        ) : (
          <p className="text-sm text-ink/70">
            {t.iosTap} <Icon d={ICONS.share} className="inline size-4 -translate-y-0.5" /> <b>{t.iosShare}</b>
            {t.iosThen}
          </p>
        )}
      </div>
      <button className={`${iconBtn} -mt-2 -mr-2`} aria-label={t.close} onClick={dismiss}>
        <Icon d={ICONS.close} />
      </button>
    </aside>
  );
}

export default function Editor() {
  const [m, setM] = useState<Menu>(load);
  const [lang, setLang] = useState<Lang>(loadLang);
  const t = T[lang];
  const [currentId, setCurrentId] = useState(loadCurrentId);
  const [layout, setLayout] = useState<Layout>("1");
  const [saveError, setSaveError] = useState(false);
  const [tab, setTab] = useState<"edit" | "preview" | "archive">("edit");
  const [saved, setSaved] = useState<Saved[]>([]);
  const [pending, setPending] = useState(false);
  const [archiveError, setArchiveError] = useState<"" | "archiveFull" | "archiveUnavailable">("");
  const [query, setQuery] = useState("");
  const [overflow, setOverflow] = useState(false);
  // Arrastrar textos e imágenes solo con ratón y pantalla ancha
  const [desktop] = useState(() => matchMedia("(min-width: 768px) and (pointer: fine)").matches);
  const [sel, setSel] = useState<string | null>(null);
  const [user, setUser] = useState(loadSession);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const changeLang = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {}
  };

  // Posición de desplazamiento de cada pantalla: la ventana (móvil) y los paneles con data-scroll (escritorio)
  const scrollPos = useRef<Record<string, number>>({});
  const go = (next: typeof tab, { top = false } = {}) => {
    const pos = scrollPos.current;
    pos[`window:${tab}`] = window.scrollY;
    document.querySelectorAll<HTMLElement>("[data-scroll]").forEach((el) => (pos[el.dataset.scroll!] = el.scrollTop));
    if (top) scrollPos.current = {}; // otra carta: empezar arriba
    setTab(next);
  };
  useLayoutEffect(() => {
    const pos = scrollPos.current;
    window.scrollTo(0, pos[`window:${tab}`] ?? 0);
    document.querySelectorAll<HTMLElement>("[data-scroll]").forEach((el) => (el.scrollTop = pos[el.dataset.scroll!] ?? 0));
  }, [tab]);
  const measure = useRef<HTMLDivElement>(null);

  // Mide una copia oculta de la carta: si el contenido no cabe en la hoja, avisamos (si no, se cortaría al imprimir)
  useEffect(() => {
    const check = () => {
      const el = measure.current?.querySelector<HTMLElement>("[data-sections]");
      if (el) setOverflow(el.scrollHeight > el.clientHeight + 2);
    };
    const id = requestAnimationFrame(check);
    document.fonts.ready.then(check);
    return () => cancelAnimationFrame(id);
  });
  const timer = useRef<number>(undefined);

  useEffect(() => {
    archive.list().then(setSaved, () => setArchiveError("archiveUnavailable"));
  }, []);

  // Borrador al instante en localStorage; en el archivo, 800 ms después del último cambio
  const update = (next: Menu, id = currentId) => {
    setM(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      localStorage.setItem(CURRENT_KEY, id);
      setSaveError(false);
    } catch {
      setSaveError(true); // normalmente imágenes demasiado grandes para localStorage (~5 MB)
    }
    setPending(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        await archive.save(id, next);
        setSaved(await archive.list());
        setArchiveError("");
      } catch {
        setArchiveError("archiveFull");
      }
      setPending(false);
    }, 800);
  };

  const set = <K extends keyof Menu>(k: K, v: Menu[K]) => update({ ...m, [k]: v });
  const setSections = (fn: (s: Section[]) => Section[]) => update({ ...m, sections: fn(structuredClone(m.sections)) });
  const setLook = (k: string, patch: Look | null) => {
    const looks = { ...m.looks };
    if (patch) looks[k] = { ...looks[k], ...patch };
    else delete looks[k];
    set("looks", looks);
  };
  const setSticker = (i: number, patch: Partial<Sticker>) => set("stickers", m.stickers.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const addSticker = (src: string) => set("stickers", [...m.stickers, { src, x: 80, y: 120, w: 50 }]);
  const removeSticker = (i: number) => {
    setSel(null);
    set("stickers", m.stickers.filter((_, j) => j !== i));
  };

  const edit: Edit | null = desktop
    ? {
        sel,
        pick: setSel,
        drop: (k, dx, dy) => (k.startsWith("img") ? setSticker(Number(k.slice(3)), { x: dx, y: dy }) : setLook(k, { dx, dy })),
      }
    : null;

  // Nombre legible del elemento seleccionado en la vista previa
  const elName = (k: string) => {
    const b = k.replace(/^cover-/, "");
    if (b.startsWith("img")) return t.imageN(Number(b.slice(3)) + 1);
    if (/^s\d+$/.test(b)) return t.el.section(Number(b.slice(1)) + 1);
    return String(t.el[b as Exclude<keyof Dict["el"], "section">] ?? b);
  };
  const selSticker = sel?.startsWith("img") ? Number(sel.slice(3)) : -1;
  const selLook = (sel && m.looks[sel]) || {};

  // Abre una carta del archivo sin cambiar su fecha (solo se actualiza al editarla)
  const openSaved = (a: Saved, thenPrint = false) => {
    const menu = { ...EMPTY, ...a.menu };
    flushSync(() => {
      setM(menu);
      setCurrentId(a.id);
      setSel(null);
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(menu));
      localStorage.setItem(CURRENT_KEY, a.id);
    } catch {
      setSaveError(true);
    }
    if (thenPrint) window.print();
    else go("edit", { top: true });
  };

  // Nueva carta a partir de la actual: conserva logo, contactos y estilo
  const newMenu = () => {
    const id = newId();
    setCurrentId(id);
    update({ ...m }, id);
    go("edit", { top: true });
  };

  const removeSaved = async (id: string) => {
    await archive.remove(id);
    setSaved(await archive.list());
  };

  const current = saved.find((a) => a.id === currentId);
  const status = pending ? t.saving : current ? t.savedAt(fmtTime(current.savedAt, t.locale)) : t.autosave;

  const q = query.trim().toLowerCase();
  const found = q
    ? saved.filter((a) =>
        [a.menu.name, a.menu.subtitle, fmtDate(a.savedAt, t.locale), ...a.menu.sections.map((s) => s.title)].join(" ").toLowerCase().includes(q),
      )
    : saved;

  const content = (copy: number) => <ContentPage m={m} table={m.tableNumbers[copy]} />;
  const pages = m.coverOn ? [() => <CoverPage m={m} />, content] : [content];

  const tabs = [
    { id: "edit", label: t.edit, icon: ICONS.edit },
    { id: "preview", label: t.preview, icon: ICONS.eye },
    { id: "archive", label: t.archive, icon: ICONS.archive },
  ] as const;

  if (!user) return <Login onLogin={setUser} lang={lang} onLang={changeLang} />;

  const logout = () => {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {}
    setUser(null);
  };

  return (
    <LangCtx value={lang}>
      <style>{`@page { size: A4 ${SHEETS[layout].orient}; margin: 0; }`}</style>

      <div className="flex min-h-dvh flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:h-dvh md:pb-0 print:hidden">
        <header className="shrink-0 bg-white pt-[env(safe-area-inset-top)]">
          <Tile color="#68A7AD" k={0.42} style={{ height: 16 }} />
          <div className="flex items-center gap-4 border-b border-laguna/60 px-5 py-3 md:gap-6">
            <div className="min-w-0 flex-1 md:flex-none">
              <p className="font-display text-[28px] leading-none font-semibold">Menudo</p>
              <p className="mt-1 truncate text-sm text-ink/65" aria-live="polite">
                {status}
              </p>
            </div>

            {/* Pestañas de escritorio */}
            <nav className="hidden flex-1 gap-1 md:flex" aria-label={t.sections}>
              {(
                [
                  { label: t.menu, target: "edit", on: tab !== "archive" },
                  { label: t.archive, target: "archive", on: tab === "archive" },
                ] as const
              ).map((x) => (
                <button
                  key={x.target}
                  aria-current={x.on ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 transition-colors ${focus} ${x.on ? "bg-laguna/40 font-semibold" : "text-ink/70 hover:bg-laguna/20"}`}
                  onClick={() => go(x.target)}
                >
                  {x.label}
                  {x.target === "archive" && saved.length > 0 && (
                    <span className="rounded-full bg-white px-2 text-xs font-semibold ring-1 ring-laguna">{saved.length}</span>
                  )}
                </button>
              ))}
            </nav>

            <LangToggle lang={lang} onChange={changeLang} />
            <button className={`shrink-0 rounded px-1 py-2 text-sm text-ink/70 underline underline-offset-2 hover:text-ink ${focus}`} title={user} onClick={logout}>
              {t.logout}
            </button>

            <div className="hidden md:block">
              <button className={primary} onClick={() => window.print()}>
                <Icon d={ICONS.print} />
                {t.print}
              </button>
            </div>
          </div>
          {(saveError || archiveError) && (
            <p role="alert" className="bg-sabbia px-5 py-2 text-sm font-semibold">
              {archiveError ? t[archiveError] : t.imgTooBig}
            </p>
          )}
        </header>

        {tab === "archive" ? (
          <main data-scroll="archive" className="flex-1 bg-laguna/35 px-4 py-6 md:overflow-auto md:px-8">
            <div className="mx-auto max-w-5xl space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-[32px] leading-tight font-semibold">{t.archive}</h1>
                  <p className="mt-1 max-w-prose text-ink/70">{t.archiveIntro}</p>
                </div>
                <button className={primary} onClick={newMenu}>
                  <Icon d={ICONS.plus} />
                  {t.newMenu}
                </button>
              </div>

              <label className="relative block max-w-md">
                <span className="sr-only">{t.searchLabel}</span>
                <Icon d={ICONS.search} className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink/50" />
                <input className={`${input} pl-10`} type="search" placeholder={t.searchPh} value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>

              {saved.length === 0 ? (
                <p className="rounded-xl bg-white p-6 text-ink/70">{t.emptyArchive}</p>
              ) : found.length === 0 ? (
                <p className="rounded-xl bg-white p-6 text-ink/70">{t.notFound(query)}</p>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {found.map((a) => {
                    const inUse = a.id === currentId;
                    const am = { ...EMPTY, ...a.menu };
                    return (
                      <li key={a.id} className={`flex gap-4 rounded-xl bg-white p-3 shadow-sm ${inUse ? "ring-2 ring-mare" : "ring-1 ring-laguna/60"}`}>
                        <button className={`rounded-sm ${focus}`} aria-label={t.openA(am.name)} onClick={() => openSaved(a)}>
                          <Thumbnail m={am} />
                        </button>
                        <div className="flex min-w-0 flex-1 flex-col">
                          {inUse && <span className="mb-1 w-fit rounded-full bg-mare/25 px-2 text-xs font-semibold">{t.openNow}</span>}
                          <p className="truncate font-display text-lg leading-tight font-semibold">{am.name}</p>
                          {am.subtitle && <p className="truncate text-sm text-ink/70">{am.subtitle}</p>}
                          <p className="mt-2 text-sm text-ink/70">{t.modified(fmtDate(a.savedAt, t.locale), fmtTime(a.savedAt, t.locale))}</p>
                          <p className="text-sm text-ink/70">{t.deletesOn(fmtDate(a.savedAt + TTL, t.locale))}</p>
                          <div className="mt-auto flex items-center gap-1 pt-3">
                            <button className={`${secondary} py-1.5`} onClick={() => openSaved(a)}>
                              {t.open}
                            </button>
                            <button className={iconBtn} aria-label={t.printA(am.name)} onClick={() => openSaved(a, true)}>
                              <Icon d={ICONS.print} />
                            </button>
                            {!inUse && (
                              <button className={iconBtn} aria-label={t.deleteA(am.name, fmtDate(a.savedAt, t.locale))} onClick={() => removeSaved(a.id)}>
                                <Icon d={ICONS.trash} />
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </main>
        ) : (
          <div className="flex flex-1 flex-col md:min-h-0 md:flex-row">
            <aside data-scroll="edit" className={`${tab === "edit" ? "block" : "hidden"} bg-white md:block md:w-[420px] md:shrink-0 md:overflow-y-auto md:border-r md:border-laguna/60`}>
            <Group title={t.venue} hint={t.venueHint}>
              <Field label={t.name}>
                <input className={input} value={m.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-semibold">{t.nameSize}</legend>
                <SizePicker name="titleSize" value={m.titleSize} onChange={(v) => set("titleSize", v)} />
                <p className="text-sm text-ink/65">{sizeName(t, m.titleSize)}.</p>
              </fieldset>
              <Field label={t.subtitle}>
                <input className={input} value={m.subtitle} placeholder={t.subtitlePh} onChange={(e) => set("subtitle", e.target.value)} />
              </Field>
              <ImagePicker label={t.uploadLogo} value={m.logo} maxPx={600} type="image/png" onChange={(u) => set("logo", u)} />
            </Group>

            <Group title={t.cover} hint={t.coverHint}>
              <label className="flex cursor-pointer items-center gap-3">
                <input type="checkbox" className="size-5 accent-mare" checked={m.coverOn} onChange={(e) => set("coverOn", e.target.checked)} />
                <span className="font-semibold">{t.printCover}</span>
              </label>
              {m.coverOn && (
                <ImagePicker label={t.addPhoto} value={m.cover} maxPx={1600} type="image/jpeg" onChange={(u) => set("cover", u)} />
              )}
            </Group>

            <Group title={t.dishes} hint={t.dishesHint}>
              {m.sections.map((s, i) => (
                <div key={i} className="space-y-3 rounded-xl border border-sabbia bg-sabbia/15 p-3">
                  <div className="flex items-center gap-1">
                    <input
                      className={`${input} font-display text-lg font-semibold md:text-lg`}
                      aria-label={t.sectionName}
                      value={s.title}
                      onChange={(e) => setSections((ss) => ((ss[i].title = e.target.value), ss))}
                    />
                    <button className={iconBtn} aria-label={t.moveUp} disabled={i === 0} onClick={() => setSections((ss) => move(ss, i, -1))}>
                      <Icon d={ICONS.up} />
                    </button>
                    <button className={iconBtn} aria-label={t.moveDown} disabled={i === m.sections.length - 1} onClick={() => setSections((ss) => move(ss, i, 1))}>
                      <Icon d={ICONS.down} />
                    </button>
                    <button className={iconBtn} aria-label={t.deleteSection(s.title)} onClick={() => setSections((ss) => ss.filter((_, k) => k !== i))}>
                      <Icon d={ICONS.trash} />
                    </button>
                  </div>

                  {s.items.length === 0 && <p className="px-1 text-sm text-ink/65">{t.noDishes}</p>}

                  {s.items.map((it, j) => (
                    <div key={j} className="space-y-2 rounded-lg bg-white p-2 ring-1 ring-laguna/60">
                      <div className="flex gap-2">
                        <input
                          className={`${input} min-w-0 flex-1 font-semibold`}
                          aria-label={t.dishName}
                          placeholder={t.dishName}
                          value={it.name}
                          onChange={(e) => setSections((ss) => ((ss[i].items[j].name = e.target.value), ss))}
                        />
                        {m.priceMode === "dish" && (
                          <PriceInput
                            className="w-24 shrink-0"
                            label={t.price}
                            value={it.price}
                            onChange={(v) => setSections((ss) => ((ss[i].items[j].price = v), ss))}
                          />
                        )}
                      </div>
                      <div className="flex gap-1">
                        <input
                          className={`${input} min-w-0 flex-1`}
                          aria-label={t.desc}
                          placeholder={t.descPh}
                          value={it.desc}
                          onChange={(e) => setSections((ss) => ((ss[i].items[j].desc = e.target.value), ss))}
                        />
                        <button
                          className={iconBtn}
                          aria-label={t.deleteDish(it.name)}
                          onClick={() => setSections((ss) => (ss[i].items.splice(j, 1), ss))}
                        >
                          <Icon d={ICONS.trash} />
                        </button>
                      </div>
                    </div>
                  ))}

                  <button className={secondary} onClick={() => setSections((ss) => (ss[i].items.push({ name: "", desc: "", price: "" }), ss))}>
                    <Icon d={ICONS.plus} className="size-4" />
                    {t.addDish}
                  </button>
                </div>
              ))}
              <button
                className={`${secondary} w-full justify-center border-dashed py-3`}
                onClick={() => setSections((ss) => [...ss, { title: t.newSection, items: [{ name: "", desc: "", price: "" }] }])}
              >
                <Icon d={ICONS.plus} className="size-4" />
                {t.addSection}
              </button>

              <fieldset className="space-y-3 rounded-xl border border-laguna p-3">
                <legend className="px-1 font-semibold">{t.price}</legend>
                <Segmented
                  name="priceMode"
                  value={m.priceMode}
                  options={[
                    ["dish", t.perDish],
                    ["total", t.single],
                  ]}
                  onChange={(v) => set("priceMode", v)}
                />
                {m.priceMode === "total" && (
                  <>
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <Field label={t.text}>
                          <input className={input} value={m.totalLabel} placeholder={t.totalLabelPh} onChange={(e) => set("totalLabel", e.target.value)} />
                        </Field>
                      </div>
                      <div className="w-28 shrink-0">
                        <Field label={t.price}>
                          <PriceInput placeholder="25,00" value={m.totalPrice} onChange={(v) => set("totalPrice", v)} />
                        </Field>
                      </div>
                    </div>
                    <Field label={t.note}>
                      <input className={input} value={m.totalNote} placeholder={t.notePh} onChange={(e) => set("totalNote", e.target.value)} />
                    </Field>
                    <fieldset className="space-y-2">
                      <legend className="mb-1 text-sm font-semibold">{t.noteSize}</legend>
                      <SizePicker name="noteSize" value={m.noteSize} onChange={(v) => set("noteSize", v)} />
                      <p className="text-sm text-ink/65">{sizeName(t, m.noteSize)}.</p>
                    </fieldset>
                    <p className="text-sm text-ink/65">{t.totalHint}</p>
                  </>
                )}
              </fieldset>
            </Group>

            <Group title={t.contacts} hint={t.contactsHint}>
              <Field label={t.address}>
                <input className={input} value={m.address} autoComplete="street-address" onChange={(e) => set("address", e.target.value)} />
              </Field>
              <Field label={t.phone}>
                <input className={input} type="tel" value={m.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label={t.email}>
                <input className={input} type="email" value={m.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label={t.web}>
                <input className={input} inputMode="url" value={m.web} placeholder="@ristorante" onChange={(e) => set("web", e.target.value)} />
              </Field>
            </Group>

            <Group title={t.table} hint={t.tableHint}>
              <label className="flex cursor-pointer items-center gap-3">
                <input type="checkbox" className="size-5 accent-mare" checked={m.tableBox} onChange={(e) => set("tableBox", e.target.checked)} />
                <span className="font-semibold">{t.showTable}</span>
              </label>
              {m.tableBox && (
                <fieldset className="space-y-3">
                  <legend className="mb-1 text-sm font-semibold">{t.tableNumber}</legend>
                  <p className="text-sm text-ink/65">{t.tableCopies(t.layouts[layout])}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {t.copies[layout].map((where, c) => (
                      <Field key={c} label={where}>
                        <input
                          className={`${input} text-center font-display text-lg`}
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="—"
                          value={m.tableNumbers[c] ?? ""}
                          onChange={(e) => {
                            const nums = [...m.tableNumbers];
                            nums[c] = e.target.value;
                            set("tableNumbers", nums);
                          }}
                        />
                      </Field>
                    ))}
                  </div>
                </fieldset>
              )}
            </Group>

            <Group title={t.design} hint={t.designHint}>
              <div className="grid grid-cols-4 gap-1">
                {(Object.keys(DESIGNS) as (keyof typeof DESIGNS)[]).map((d) => (
                  <button
                    key={d}
                    className={`flex flex-col items-center gap-1.5 rounded-lg p-1.5 text-sm transition-colors hover:bg-laguna/25 ${focus}`}
                    onClick={() => update({ ...m, ...DESIGNS[d] })}
                  >
                    <Thumbnail m={{ ...m, ...DESIGNS[d] }} k={0.075} />
                    {t.designs[d]}
                  </button>
                ))}
              </div>
            </Group>

            <Group title={t.style} hint={t.styleHint}>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-semibold">{t.align}</legend>
                <Segmented
                  name="align"
                  value={m.align}
                  options={[
                    ["center", t.center],
                    ["left", t.left],
                  ]}
                  onChange={(v) => set("align", v)}
                />
              </fieldset>
              <Field label={`${t.indent}: ${m.indent} mm`}>
                <input type="range" className="w-full accent-mare" min={0} max={30} value={m.indent} onChange={(e) => set("indent", Number(e.target.value))} />
              </Field>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-semibold">{t.textSize}</legend>
                <SizePicker name="textSize" value={m.textSize} onChange={(v) => set("textSize", v)} />
                <p className="text-sm text-ink/65">{t.textSizeHint(sizeName(t, m.textSize))}</p>
                {overflow && <OverflowWarning />}
              </fieldset>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t.titleFont}>
                  <FontSelect value={m.font} onChange={(v) => set("font", v)} />
                </Field>
                <Field label={t.bodyFont}>
                  <FontSelect value={m.bodyFont} onChange={(v) => set("bodyFont", v)} />
                </Field>
              </div>
              <label className="flex cursor-pointer items-center gap-3">
                <input type="color" className={colorSwatch} value={m.ink} onChange={(e) => set("ink", e.target.value)} />
                <span className="font-semibold">{t.inkColor}</span>
              </label>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-semibold">{t.frame}</legend>
                <Segmented
                  name="frame"
                  value={m.frame}
                  options={(["none", "line", "double"] as const).map((f) => [f, t.frames[f]])}
                  onChange={(v) => set("frame", v)}
                />
              </fieldset>
              <label className="flex cursor-pointer items-center gap-3">
                <input type="checkbox" className="size-5 accent-mare" checked={m.tiles} onChange={(e) => set("tiles", e.target.checked)} />
                <span className="font-semibold">{t.tiles}</span>
              </label>
              <fieldset>
                <legend className="mb-1 text-sm font-semibold">{t.accent}</legend>
                <div className="flex flex-wrap items-start gap-1">
                  {PALETTE.map((hex, i) => {
                    const on = m.accent.toLowerCase() === hex.toLowerCase();
                    return (
                      <button key={hex} className={`flex flex-col items-center gap-1 rounded-lg p-1 text-sm ${focus}`} aria-pressed={on} onClick={() => set("accent", hex)}>
                        <span className={`block size-11 rounded-full ring-offset-2 ${on ? "ring-2 ring-ink" : "ring-1 ring-ink/15"}`} style={{ background: hex }} />
                        <span className={on ? "font-semibold" : ""}>{t.palette[i]}</span>
                      </button>
                    );
                  })}
                  <label className="flex cursor-pointer flex-col items-center gap-1 p-1 text-sm">
                    <input type="color" className={colorSwatch} value={m.accent} onChange={(e) => set("accent", e.target.value)} />
                    {t.other}
                  </label>
                </div>
              </fieldset>
            </Group>

            <Group title={t.images} hint={t.imagesHint}>
              {m.stickers.map((s, i) => (
                <div key={i} className="flex gap-3 rounded-xl border border-laguna p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.src} alt="" className="size-16 shrink-0 rounded-lg bg-laguna/15 object-contain" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{t.imageN(i + 1)}</span>
                      <button className={iconBtn} aria-label={`${t.remove} ${t.imageN(i + 1)}`} onClick={() => removeSticker(i)}>
                        <Icon d={ICONS.trash} />
                      </button>
                    </div>
                    {(
                      [
                        ["w", t.size, 10, 150],
                        ["x", t.posX, -20, 200],
                        ["y", t.posY, -20, 290],
                      ] as const
                    ).map(([f, label, min, max]) => (
                      <label key={f} className="flex items-center gap-2 text-sm">
                        <span className="w-24 shrink-0">{label}</span>
                        <input type="range" className="min-w-0 flex-1 accent-mare" min={min} max={max} value={s[f]} onChange={(e) => setSticker(i, { [f]: Number(e.target.value) })} />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <label className={secondary}>
                <Icon d={ICONS.plus} className="size-4" />
                {t.addImage}
                <input
                  type="file"
                  accept="image/png,image/webp,image/svg+xml"
                  className="sr-only"
                  onChange={(e) => {
                    // PNG: conserva la transparencia
                    readImage(e.target.files?.[0], 800, "image/png", addSticker);
                    e.target.value = "";
                  }}
                />
              </label>
              <ImageSearch onPick={(img) => readImage(img, 800, "image/png", addSticker)} />
            </Group>
            </aside>

            <main
              data-scroll="preview"
              className={`${tab === "preview" ? "flex" : "hidden"} flex-1 flex-col gap-6 bg-laguna/35 px-4 py-5 md:flex md:overflow-auto md:px-8`}
              onPointerDown={(e) => desktop && !(e.target as Element).closest("[data-k],[data-toolbar]") && setSel(null)}
            >
              <LayoutPicker value={layout} onChange={setLayout} />
              <ZoomControl value={zoom} onChange={setZoom} />
              {overflow && <OverflowWarning />}

              {/* Barra de retoque del elemento seleccionado (escritorio) */}
              {desktop && (
                <div data-toolbar className="sticky top-0 z-10 mx-auto flex min-h-14 w-full max-w-3xl flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-2 shadow-sm ring-1 ring-laguna/60">
                  {!sel || (sel.startsWith("img") && !m.stickers[selSticker]) ? (
                    <p className="text-sm text-ink/70">{t.dragHint}</p>
                  ) : (
                    <>
                      <span className="font-semibold">{elName(sel)}</span>
                      {selSticker >= 0 ? (
                        <>
                          <label className="flex items-center gap-2 text-sm">
                            {t.size}
                            <input
                              type="range"
                              className="accent-mare"
                              min={10}
                              max={150}
                              value={m.stickers[selSticker].w}
                              onChange={(e) => setSticker(selSticker, { w: Number(e.target.value) })}
                            />
                          </label>
                          <button className={secondary} onClick={() => removeSticker(selSticker)}>
                            <Icon d={ICONS.trash} className="size-4" />
                            {t.remove}
                          </button>
                        </>
                      ) : (
                        <>
                          <label className="flex items-center gap-2 text-sm">
                            {t.font}
                            <FontSelect
                              className="rounded-lg border border-laguna bg-white px-2 py-1.5"
                              value={selLook.font ?? (/(^|-)(name|subtitle|s\d+)$/.test(sel) ? m.font : m.bodyFont)}
                              onChange={(v) => setLook(sel, { font: v })}
                            />
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            {t.color}
                            <input
                              type="color"
                              className="size-8 cursor-pointer rounded border border-laguna bg-white p-0.5"
                              value={selLook.color ?? m.ink}
                              onChange={(e) => setLook(sel, { color: e.target.value })}
                            />
                          </label>
                          <button className={secondary} onClick={() => setLook(sel, null)}>
                            {t.reset}
                          </button>
                        </>
                      )}
                      <button className={`${iconBtn} ml-auto`} aria-label={t.close} onClick={() => setSel(null)}>
                        <Icon d={ICONS.close} />
                      </button>
                    </>
                  )}
                </div>
              )}

              <EditCtx value={edit}>
                {pages.map((p, i) => (
                  <Preview key={i} layout={layout} scale={zoom}>
                    <Sheet layout={layout} page={p} />
                  </Preview>
                ))}
              </EditCtx>
            </main>
          </div>
        )}

        {/* Barra de pestañas en móvil, como en iOS: zona del pulgar y safe area del iPhone */}
        <nav
          aria-label={t.sections}
          className="fixed inset-x-0 bottom-0 grid grid-cols-4 border-t border-laguna/60 bg-white/95 px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
        >
          {tabs.map((x) => (
            <button
              key={x.id}
              aria-current={tab === x.id ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-xs ${focus} ${tab === x.id ? "font-semibold" : "text-ink/65"}`}
              onClick={() => go(x.id)}
            >
              <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${tab === x.id ? "bg-laguna/50" : ""}`}>
                <Icon d={x.icon} />
              </span>
              {x.label}
            </button>
          ))}
          <button className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-xs font-semibold ${focus}`} onClick={() => window.print()}>
            <span className="grid h-7 w-12 place-items-center rounded-full bg-mare">
              <Icon d={ICONS.print} />
            </span>
            {t.print}
          </button>
        </nav>
      </div>

      <InstallPrompt />

      <div ref={measure} aria-hidden className="pointer-events-none invisible fixed top-0 left-[-10000px] print:hidden" style={pageSize(layout)}>
        <ContentPage m={m} />
      </div>

      <div className="hidden [print-color-adjust:exact] print:block">
        {pages.map((p, i) => (
          <div key={i} className="break-after-page">
            <Sheet layout={layout} page={p} />
          </div>
        ))}
      </div>
    </LangCtx>
  );
}
