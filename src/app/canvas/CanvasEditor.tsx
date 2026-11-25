"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { flushSync } from "react-dom";
import { Layer, Line, Rect, Shape as KShape, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";

/* Fase 1: lienzo con papel A2–A5, elementos básicos y transformador.
   Fase 2: panel de propiedades completo y panel de capas (orden, ocultar, bloquear, duplicar).
   Todas las medidas del modelo están en mm; el Stage se escala para mostrarlas. */

import { common, Copies, COPIES, COPY_NAMES, El, FONTS, FontKey, fontFamily, fontStyleOf, fillGrad, Grad, gradEnd, gradPoints, TRANSPARENT, DARK_PAPER, LEGACY_WHITE, newText, PALETTE, PAPER_WHITE, PAPERS, Paper, SHAPES, ShapeKind, sheetFor, strokeGrad, tilePattern, tileScale, uid } from "./model";
import { designs, type Design } from "./archive";
import { menuToPages, readSavedMenu } from "./menuTemplate";
import { Block, Brand, chip, chipOn, focus, Group, ColorRow, GradientControls, Icon, ICONS, iconBtn, input, Num, primary, Range, secondary, Seg, ShapeIcon, Switch } from "./ui";
import { ArchiveIcon, FilesIcon, ForkKnifeIcon, GridFourIcon, ImageIcon, LayoutIcon, LineSegmentIcon, PaintBrushIcon, RectangleIcon, ShapesIcon, SparkleIcon, StackIcon, TextTIcon, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Tip } from "./Tip";
import { applyLast, loadLast, remember, saveLast, type Last } from "./lastUsed";
import { buildTemplate, cleanMenu } from "./templateBuild";
import { defaultSpec, parseSpec } from "./templateSpec";
import { useGlow } from "./glow";
import type { Lang } from "../i18n";
import { LANG_KEY, loadLang, makeTr, type Tr } from "./i18n";
import { ImageSearch } from "./ImageSearch";
import { MAX_PAGES, readPdf, type PdfError } from "./pdfLoad";

/* Dibujar formas arrastrando: cada herramienta sabe construir su elemento a partir de una geometría (caja, o línea con ángulo).
   Geo: x/y = esquina superior izquierda (o inicio de la línea), w/h = caja (o w = largo de la línea), angle en grados (solo líneas). */
type Geo = { x: number; y: number; w: number; h: number; angle: number };
type Drag = { x0: number; y0: number; x1: number; y1: number; shift: boolean };
type DrawTool = { id: string; line?: boolean; square?: boolean; def: [number, number]; make: (g: Geo, id: string) => El };
function drawTool(id: string): DrawTool {
  const at = (g: Geo, i: string) => ({ id: i, x: g.x, y: g.y, ...common });
  if (id === "rect") return { id, def: [60, 30], make: (g, i) => ({ ...at(g, i), type: "rect", width: g.w, height: g.h, fill: PALETTE[2].hex, radius: 0 }) };
  if (id === "circle") return { id, square: true, def: [40, 40], make: (g, i) => ({ ...at(g, i), type: "rect", width: g.w, height: g.h, fill: PALETTE[2].hex, radius: g.w / 2 }) };
  if (id === "line" || id === "dotted") return { id, line: true, def: [80, 0], make: (g, i) => ({ ...at(g, i), rotation: g.angle, type: "line", width: g.w, height: 1, fill: PALETTE[0].hex, thickness: id === "line" ? 0.6 : 0.8, dash: id === "dotted" }) };
  const kind = id as ShapeKind;
  const stroke = SHAPES[kind].stroke; // los objetos (iconos de línea) se dibujan siempre proporcionados
  return { id, square: stroke, def: stroke ? [30, 30] : [40, 40], make: (g, i) => ({ ...at(g, i), type: "shape", kind, width: g.w, height: g.h, fill: stroke ? PALETTE[0].hex : PALETTE[2].hex }) };
}
function geoOf(t: DrawTool, d: Drag): Geo {
  if (t.line) {
    const [dx, dy] = [d.x1 - d.x0, d.y1 - d.y0];
    const a = (Math.atan2(dy, dx) * 180) / Math.PI;
    return { x: d.x0, y: d.y0, w: Math.max(Math.hypot(dx, dy), 0.1), h: 0, angle: d.shift ? Math.round(a / 15) * 15 : a }; // Mayús: ángulos de 15°
  }
  let w = Math.abs(d.x1 - d.x0);
  let h = Math.abs(d.y1 - d.y0);
  if (t.square || d.shift) w = h = Math.max(w, h);
  return { x: d.x1 >= d.x0 ? d.x0 : d.x0 - w, y: d.y1 >= d.y0 ? d.y0 : d.y0 - h, w, h, angle: 0 };
}

const ALL_ANCHORS = ["top-left", "top-center", "top-right", "middle-right", "bottom-right", "bottom-center", "bottom-left", "middle-left"];

// Iconos Phosphor del raíl, por sección
const RAIL_ICONS: Record<string, PhosphorIcon> = { text: TextTIcon, shapes: ShapesIcon, objects: ForkKnifeIcon, images: ImageIcon, ai: SparkleIcon, pages: FilesIcon, sheet: LayoutIcon, layers: StackIcon, archive: ArchiveIcon };

const label = (e: El, tr: Tr) =>
  e.type === "text" ? e.text.split("\n")[0].slice(0, 24) || tr("Testo") : e.type === "shape" ? tr(SHAPES[e.kind].label) : tr({ rect: "Rettangolo", image: "Immagine", tiles: "Maioliche", line: "Linea" }[e.type]);

function useImage(src: string) {
  const [img, setImg] = useState<HTMLImageElement>();
  useEffect(() => {
    const i = new window.Image();
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);
  return img;
}

function ImageNode({ el, ...rest }: { el: Extract<El, { type: "image" }> } & Konva.NodeConfig) {
  const img = useImage(el.src);
  return (
    <KShape
      {...rest}
      fill="#000"
      sceneFunc={(ctx, shape) => {
        if (!img) return;
        const c = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
        const [w, h] = [shape.width(), shape.height()];
        const r = Math.max(0, Math.min(el.radius ?? 0, w / 2, h / 2));
        c.save();
        if (r > 0) {
          c.beginPath();
          c.moveTo(r, 0);
          c.arcTo(w, 0, w, h, r);
          c.arcTo(w, h, 0, h, r);
          c.arcTo(0, h, 0, 0, r);
          c.arcTo(0, 0, w, 0, r);
          c.closePath();
          c.clip();
        }
        c.drawImage(img, 0, 0, w, h);
        c.restore();
      }}
      hitFunc={(ctx, shape) => {
        ctx.beginPath();
        ctx.rect(0, 0, shape.width(), shape.height());
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      }}
    />
  );
}

// Forma vectorial: se dibuja con Path2D escalado a width/height, así el transformador la redimensiona como a cualquier otro elemento
function ShapeNode({ el, ...rest }: { el: Extract<El, { type: "shape" }> } & Konva.NodeConfig) {
  const d = SHAPES[el.kind];
  if (!d) return null;
  return (
    <KShape
      {...rest}
      fill={el.fill}
      sceneFunc={(ctx, shape) => {
        const c = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
        c.save();
        c.scale(shape.width() / d.vb, shape.height() / d.vb);
        const path = new Path2D(d.d);
        let paint: string | CanvasGradient = el.fill;
        if (el.grad) {
          const { start, end } = gradPoints(d.vb, d.vb, el.grad.angle);
          paint = c.createLinearGradient(start.x, start.y, end.x, end.y);
          paint.addColorStop(el.grad.from ?? 0, el.fill);
          paint.addColorStop(1, gradEnd(el.fill, el.grad.to));
        }
        if (d.stroke) {
          c.strokeStyle = paint;
          c.lineWidth = 1.7;
          c.lineCap = "round";
          c.lineJoin = "round";
          c.stroke(path);
        } else if (el.hollow) {
          // Solo borde: el grosor se da en mm, y el trazado está escalado a la caja: se convierte a unidades del trazado
          c.strokeStyle = paint;
          c.lineWidth = Math.max(0.2, (el.borderW ?? 1) / ((shape.width() + shape.height()) / 2 / d.vb));
          c.lineJoin = "round";
          c.stroke(path);
        } else {
          c.fillStyle = paint;
          c.fill(path, "evenodd");
        }
        c.restore();
      }}
      hitFunc={(ctx, shape) => {
        ctx.beginPath();
        ctx.rect(0, 0, shape.width(), shape.height());
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      }}
    />
  );
}

function TilesNode({ el, ...rest }: { el: Extract<El, { type: "tiles" }> } & Konva.NodeConfig) {
  const sc = tileScale(el.k);
  return <Rect {...rest} fillPatternImage={tilePattern(el.fill) as unknown as HTMLImageElement} fillPatternScale={{ x: sc, y: sc }} fillPatternRepeat="repeat" />;
}

/* Fase 15: archivo de diseños con nombre (IndexedDB): guardar, abrir y borrar.
   Fase 14: números de mesa distintos en cada copia del folio.
   Fase 11: varias páginas (copertina incluida al importar), exportadas en un solo PDF.
   Fase 10: zoom (botones, Ctrl+rueda, pellizco) sobre el ajuste al ancho.
   Fase 9: uso en móvil (pestañas Carta/Strumenti, barra inferior, modo selección múltiple táctil, maniglie grandes).
   Fase 6: guías de alineación con imán (Alt las desactiva) y texto con altura automática.
   Fase 4: exportar a PNG y PDF a resolución de impresión, e imprimir.
   Fase 3: guardado automático en localStorage y deshacer/rehacer */
const STORAGE_KEY = "menudo:canvas:v1";
const ZOOM_KEY = "menudo:canvas:zoom"; // último zoom del usuario: se conserva al cambiar de hoja y entre visitas
const readZoom = () => {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY));
    return v >= 0.5 && v <= 4 ? v : 1;
  } catch {
    return 1;
  }
};
const okGrad = (v: unknown): Grad | undefined => {
  const g = v as { to?: unknown; angle?: unknown; from?: unknown } | null | undefined;
  return g && typeof g.to === "string" && (/^#[0-9a-f]{6}$/i.test(g.to) || g.to === TRANSPARENT) && typeof g.angle === "number" ? { to: g.to, angle: ((g.angle % 360) + 360) % 360, ...(typeof g.from === "number" && g.from > 0 && g.from <= 0.95 ? { from: g.from } : {}) } : undefined;
};
// Lo guardado puede venir de otra versión o estar estropeado: se descartan las formas desconocidas y se limpian los degradados
const cleanPages = (pages: El[][]): El[][] =>
  pages.map((p) =>
    p
      .filter((e) => e && typeof e === "object" && (e.type !== "shape" || e.kind in SHAPES))
      .map((e) => (e.grad ? { ...e, grad: okGrad(e.grad) } : e)),
  );
// El blanco roto de una versión intermedia vuelve a ser «blanco» (se muestra suavizado solo en modo oscuro)
const okBg = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? (v.toLowerCase() === LEGACY_WHITE ? PAPER_WHITE : v) : PAPER_WHITE);
const MAX_HISTORY = 100;
const THEME_KEY = "menudo:theme"; // el mismo que el editor principal
type History = { past: El[][][]; pages: El[][]; future: El[][][] }; // cada paso del historial guarda todas las páginas
const starter = (): El[] => [newText({ y: 20, width: 170, height: 20, text: "Menù", fontSize: 14, fontFamily: "display" })];

function load(): { paper: Paper; copies: Copies; pages: El[][]; tables: string[]; bg: string; bgGrad?: Grad } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    const copies = COPIES.includes(raw?.copies) ? raw.copies : 1;
    const bg = okBg(raw?.bg);
    const bgGrad = okGrad(raw?.bgGrad);
    const tables: string[] = Array.isArray(raw?.tables) ? raw.tables.map((x: unknown) => (x == null ? "" : String(x))) : [];
    if (raw && raw.paper in PAPERS) {
      if (Array.isArray(raw.pages) && raw.pages.length && raw.pages.every(Array.isArray)) return { paper: raw.paper, copies, pages: cleanPages(raw.pages), tables, bg, bgGrad };
      if (Array.isArray(raw.els)) return { paper: raw.paper, copies, pages: cleanPages([raw.els]), tables, bg, bgGrad }; // formato de las fases 3-10: una sola página
    }
  } catch {}
  return { paper: "A4", copies: 1, pages: [starter()], tables: [], bg: PAPER_WHITE };
}

// Reduce la foto: las del móvil pesan varios MB y no caben en localStorage
function shrink(src: string, maxPx: number, png: boolean): Promise<{ src: string; w: number; h: number }> {
  return new Promise((done) => {
    const i = new window.Image();
    i.onload = () => {
      const k = Math.min(1, maxPx / Math.max(i.width, i.height));
      const c = document.createElement("canvas");
      c.width = Math.round(i.width * k);
      c.height = Math.round(i.height * k);
      c.getContext("2d")!.drawImage(i, 0, 0, c.width, c.height);
      done({ src: c.toDataURL(png ? "image/png" : "image/jpeg", 0.85), w: i.width, h: i.height });
    };
    i.src = src;
  });
}

const DPI = 300;
const MAX_PIXELS = 16_000_000; // por encima, iOS Safari y otros navegadores móviles se quedan sin memoria de canvas
const MM_PER_INCH = 25.4;

// Lista de letras (cada nombre con su letra), para un elemento y para varios
function FontList({ value, onPick, tr }: { value: string; onPick: (k: FontKey) => void; tr: Tr }) {
  return (
    <div role="radiogroup" aria-label={tr("Carattere")} className="max-h-52 space-y-0.5 overflow-y-auto rounded-lg border border-laguna p-1">
      {FONTS.map((f) => (
        <button key={f.key} type="button" role="radio" aria-checked={value === f.key}
          className={`flex w-full items-center rounded-md px-3 py-1.5 text-left text-lg hover:bg-laguna/30 ${focus} ${value === f.key ? "bg-laguna/40 font-semibold" : ""}`}
          style={{ fontFamily: `var(${f.cssVar}), ${f.fallback}` }} onClick={() => onPick(f.key)}>
          {f.label}
        </button>
      ))}
    </div>
  );
}

export default function CanvasEditor() {
  const [init] = useState(load);
  const [lang, setLang] = useState<Lang>(loadLang); // el mismo idioma que el editor principal (menudo:lang)
  const tr = makeTr(lang);
  const changeLang = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {}
  };
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  // Plantilla con IA: se pide al servidor una especificación y se coloca como página nueva; si la IA no responde, plantilla estándar
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiUseMenu, setAiUseMenu] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState("");
  const createTemplate = async () => {
    const q = aiPrompt.trim();
    if (q.length < 3) return setAiMsg(tr("Scrivi almeno qualche parola."));
    setAiBusy(true);
    setAiMsg("");
    try {
      const menu = cleanMenu(readSavedMenu()); // el menú guardado puede estar dañado: solo se usa lo que tiene la forma esperada
      const fallback = () => defaultSpec(q, menu?.name?.trim() || tr("Menù"), menu?.subtitle.trim() || "");
      let spec = fallback();
      let note = "";
      try {
        const r = await fetch("/api/template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: q, lang, context: aiUseMenu && menu ? { name: menu.name, sections: menu.sections.map((x) => x.title) } : undefined }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.spec) spec = parseSpec(d.spec);
        else note = tr(d.error === "nokey" ? "L'IA non è attiva su questo server: ho usato un modello standard." : d.error === "limit" ? "Hai raggiunto il limite di richieste: ho usato un modello standard. Riprova più tardi." : "L'IA non è disponibile ora: ho usato un modello standard.");
      } catch {
        note = tr("L'IA non è disponibile ora: ho usato un modello standard.");
      }
      const at = hist.pages.length;
      setPages((p) => [...p, buildTemplate(spec, paper, menu, lang)]);
      goPage(at);
      setTab("canvas");
      setAiMsg(note || tr("Modello aggiunto come nuova pagina."));
    } finally {
      setAiBusy(false); // pase lo que pase, el botón vuelve a estar disponible
    }
  };
  const rootRef = useRef<HTMLDivElement>(null);
  useGlow(rootRef); // brillo que sigue al ratón en los elementos .glow
  const [paper, setPaper] = useState<Paper>(init.paper);
  const [wanted, setCopies] = useState<Copies>(init.copies);
  const [tables, setTables] = useState<string[]>(init.tables); // número de mesa de cada copia
  const [bg, setBg] = useState(init.bg); // color de la hoja
  const [bgGrad, setBgGrad] = useState<Grad | undefined>(init.bgGrad); // y su degradado, si lo hay
  // Si el papel elegido no admite esas copias (p. ej. 4 × A3), se vuelve a 1
  const copies: Copies = sheetFor(paper, wanted) ? wanted : 1;
  const sheet = sheetFor(paper, copies)!;
  const [hist, setHist] = useState<History>({ past: [], pages: init.pages, future: [] });
  const [pageIdx, setPageIdx] = useState(0);
  const page = Math.min(pageIdx, hist.pages.length - 1); // deshacer puede quitar páginas
  const [saveError, setSaveError] = useState(false);
  const els = hist.pages[page];
  const lastKey = useRef("");
  const lastTime = useRef(0);

  // Cambia los elementos guardando el estado anterior para deshacer. Con `key`, los cambios seguidos
  // sobre lo mismo (escribir, mover un deslizador) se funden en un solo paso.
  const setEls = (f: El[] | ((a: El[]) => El[]), key?: string) => {
    // Solo se llama desde manejadores de eventos, nunca durante el render
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const merge = !!key && key === lastKey.current && now - lastTime.current < 1000;
    lastKey.current = key ?? "";
    lastTime.current = now;
    const pg = page;
    setHist((h) => {
      const cur = h.pages[pg];
      const next = typeof f === "function" ? f(cur) : f;
      if (next === cur) return h;
      const pages = h.pages.map((p, i) => (i === pg ? next : p));
      return { past: merge ? h.past : [...h.past, h.pages].slice(-MAX_HISTORY), pages, future: [] };
    });
  };
  // Cambios que afectan a la lista de páginas (añadir, duplicar, borrar, mover): un paso de historial
  const setPages = (f: (p: El[][]) => El[][]) => {
    lastKey.current = "";
    setHist((h) => ({ past: [...h.past, h.pages].slice(-MAX_HISTORY), pages: f(h.pages), future: [] }));
  };
  const goPage = (i: number) => {
    setEditing(null);
    setPageIdx(i);
    setSels([]);
  };
  const pageWaiter = useRef<{ i: number; ok: () => void } | null>(null);
  useEffect(() => {
    if (pageWaiter.current?.i === page) {
      pageWaiter.current.ok();
      pageWaiter.current = null;
    }
  }, [page]);
  const addPage = () => {
    setPages((p) => [...p.slice(0, page + 1), [], ...p.slice(page + 1)]);
    goPage(page + 1);
  };
  const duplicatePage = () => {
    const groups = new Map<string, string>();
    const copy = hist.pages[page].map((e) => {
      if (e.group && !groups.has(e.group)) groups.set(e.group, uid());
      return { ...e, id: uid(), group: e.group && groups.get(e.group) } as El;
    });
    setPages((p) => [...p.slice(0, page + 1), copy, ...p.slice(page + 1)]);
    goPage(page + 1);
  };
  const deletePage = () => {
    if (hist.pages.length < 2) return;
    setPages((p) => p.filter((_, i) => i !== page));
    goPage(Math.max(0, page - 1));
  };
  const movePage = (d: -1 | 1) => {
    const j = page + d;
    if (j < 0 || j >= hist.pages.length) return;
    setPages((p) => {
      const b = [...p];
      [b[page], b[j]] = [b[j], b[page]];
      return b;
    });
    setPageIdx(j);
  };
  const undo = () => {
    setEditing(null);
    lastKey.current = "";
    setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), pages: h.past[h.past.length - 1], future: [h.pages, ...h.future] } : h));
  };
  const redo = () => {
    setEditing(null);
    lastKey.current = "";
    setHist((h) => (h.future.length ? { past: [...h.past, h.pages], pages: h.future[0], future: h.future.slice(1) } : h));
  };
  const [, setFontsReady] = useState(0);
  const [sels, setSels] = useState<string[]>([]);
  const sel = sels.length === 1 ? sels[0] : null; // un solo elemento: se muestra el panel de propiedades
  const setSel = (id: string | null) => setSels(id ? [id] : []);
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "dark";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  // Mismo cambio de tema que el editor principal: un círculo que se expande desde el botón
  const toggleTheme = (e: React.MouseEvent<HTMLElement>) => {
    const next = !dark;
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {}
    const apply = () => {
      flushSync(() => setDark(next));
      document.documentElement.dataset.theme = next ? "dark" : "light";
    };
    if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
    const b = e.currentTarget.getBoundingClientRect();
    const [x, y] = [b.left + b.width / 2, b.top + b.height / 2];
    const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(apply).ready.then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] },
        { duration: 550, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
      ),
    );
  };
  const freshText = useRef<string | null>(null); // texto recién creado desde el menú: al abrirlo se selecciona entero
  const [editing, setEditing] = useState<string | null>(null); // texto que se está escribiendo directamente sobre la hoja
  const [panel, setPanel] = useState("text"); // sección abierta junto al carril de iconos (escritorio)
  const [tab, setTab] = useState<"canvas" | "tools">("canvas"); // solo en móvil; en escritorio se ven las dos
  const [multi, setMulti] = useState(false); // modo táctil: tocar suma elementos a la selección
  const addedOnTouch = useRef(false);
  const [coarse] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeFrom = useRef<{ x: number; y: number; add: boolean } | null>(null);
  const [fit, setFit] = useState(2); // px por mm que hacen caber la hoja en el ancho
  const [mul, setMul] = useState(readZoom); // zoom del usuario sobre ese ajuste (se recuerda)
  const maxMul = Math.min(4, Math.max(1, 5000 / (PAPERS[paper].w * fit))); // la hoja no pasa de ~5000 px de ancho: más pesa y no aporta
  const zoom = fit * Math.min(mul, maxMul);
  const mulRef = useRef({ mul: 1, max: 1, zoom: 1 });
  // Punto de la hoja (en mm) que debe quedarse bajo el dedo/cursor mientras cambia el zoom
  const anchor = useRef<{ cx: number; cy: number; ux: number; uy: number } | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const wrap = useRef<HTMLDivElement>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [printSrcs, setPrintSrcs] = useState<string[]>([]);
  const [importMsg, setImportMsg] = useState("");
  const [saved, setSaved] = useState<Design[]>([]);
  const [designName, setDesignName] = useState("");
  const [archiveMsg, setArchiveMsg] = useState("");
  const { w, h } = PAPERS[paper];

  // Las fuentes web se descargan al usarse en el DOM: se piden aquí y se repinta el lienzo al llegar
  useEffect(() => {
    Promise.allSettled(FONTS.flatMap((f) => ["400", "700"].map((w) => document.fonts.load(`${w} 16px ${fontFamily(f.key)}`)))).then(() => setFontsReady((n) => n + 1));
  }, []);

  // Ajusta el zoom para que la hoja quepa en el ancho disponible
  useEffect(() => {
    const el = wrap.current!;
    // Escritorio: cabe la hoja entera (ancho y alto); móvil: solo el ancho, la hoja se recorre hacia abajo
    const ro = new ResizeObserver(([e]) => {
      const byW = (e.contentRect.width - 32) / w;
      const byH = matchMedia("(min-width: 768px)").matches ? (e.contentRect.height - 72 - (hist.pages.length > 1 ? 68 : 0)) / h : Infinity;
      setFit(Math.max(0.3, Math.min(byW, byH)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h, hist.pages.length]);
  useEffect(() => {
    try {
      localStorage.setItem(ZOOM_KEY, String(mul));
    } catch {}
  }, [mul]);

  // Ctrl+rueda (también el pellizco del trackpad) y pellizco táctil con dos dedos
  useEffect(() => {
    mulRef.current = { mul, max: maxMul, zoom };
  });
  useEffect(() => {
    const el = wrap.current!;
    const clamp = (v: number) => Math.min(mulRef.current.max, Math.max(0.5, v));
    let pinch: { d: number; m: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    // Antes de cambiar el zoom se anota qué punto de la hoja hay bajo (cx, cy); si ya hay uno pendiente se conserva
    const hold = (cx: number, cy: number) => {
      if (anchor.current || !stageRef.current) return;
      const r = stageRef.current.container().getBoundingClientRect();
      const z = mulRef.current.zoom;
      anchor.current = { cx, cy, ux: (cx - r.left) / z, uy: (cy - r.top) / z };
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      hold(e.clientX, e.clientY);
      setMul((m) => clamp(m * Math.exp(-e.deltaY * 0.004)));
    };
    const start = (e: TouchEvent) => {
      pinch = e.touches.length === 2 ? { d: dist(e.touches), m: mulRef.current.mul } : null;
    };
    const move = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      hold((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
      setMul(clamp((pinch.m * dist(e.touches)) / pinch.d));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
    };
  }, []);

  // Tras el cambio de zoom, se desplaza el área para que el punto anotado siga bajo el cursor
  useLayoutEffect(() => {
    const a = anchor.current;
    anchor.current = null;
    if (!a || !stageRef.current || !wrap.current) return;
    const r = stageRef.current.container().getBoundingClientRect();
    // El área puede desplazarse por sí misma (horizontal) o con la ventana (vertical): lo que no absorbe una, lo hace la otra
    const dx = r.left + a.ux * zoom - a.cx;
    const dy = r.top + a.uy * zoom - a.cy;
    const m = wrap.current;
    const x0 = m.scrollLeft;
    const y0 = m.scrollTop;
    m.scrollLeft += dx;
    m.scrollTop += dy;
    window.scrollBy(dx - (m.scrollLeft - x0), dy - (m.scrollTop - y0));
  }, [zoom]);

  // Botones +/−: el zoom se centra en el centro de la vista
  const zoomBy = (f: number) => {
    const m = wrap.current!.getBoundingClientRect();
    const r = stageRef.current!.container().getBoundingClientRect();
    const cx = m.left + m.width / 2;
    const cy = m.top + m.height / 2;
    anchor.current = { cx, cy, ux: (cx - r.left) / zoom, uy: (cy - r.top) / zoom };
    setMul((v) => Math.min(maxMul, Math.max(0.5, Math.min(v, maxMul) * f)));
  };

  // El transformador sigue a los elementos seleccionados (los bloqueados quedan fuera)
  useEffect(() => {
    const nodes = sels.flatMap((id) => {
      const el = els.find((x) => x.id === id);
      const n = el && !el.locked && el.visible && id !== editing ? layerRef.current?.findOne("#" + id) : undefined;
      return n ? [n] : [];
    });
    trRef.current?.nodes(nodes);
    trRef.current?.getLayer()?.batchDraw();
  }, [sels, els, editing]);

  // Guarda sola, un momento después del último cambio
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ paper, copies, pages: hist.pages, tables, bg, bgGrad }));
        setSaveError(false);
      } catch {
        setSaveError(true); // normalmente: demasiadas imágenes para el límite del navegador
      }
    }, 400);
    return () => clearTimeout(t);
  }, [paper, copies, hist.pages, tables, bg, bgGrad]);

  // `merge`: ediciones desde el panel (escribir, deslizadores) que deben deshacerse de una vez
  // Último ajuste de estilo por tipo de elemento (color del texto, de la forma…): se anota al editar y se aplica a los nuevos
  // Estilo completo de un texto copiado (para «Copiar estilo» / «Aplicar estilo»)
  const [styleClip, setStyleClip] = useState<Partial<Extract<El, { type: "text" }>> | null>(null);
  const [fontOpen, setFontOpen] = useState(false);
  // Capas: arrastrar una fila (mantener pulsado y mover) la lleva a otro nivel. to = posición en la lista sin la fila arrastrada
  const [layerDrag, setLayerDrag] = useState<{ id: string; to: number; dy: number; h: number } | null>(null); // dy: cuánto se ha movido el puntero; h: alto de fila + hueco
  const layerPress = useRef<{ id: string; y: number; moved: boolean } | null>(null);
  const layerClickBlock = useRef(false); // lista de letras abierta en la barra de texto
  const lastRef = useRef<Last | null>(null);
  const getLast = () => (lastRef.current ??= loadLast());
  const noteLast = (el: El, p: Partial<El>) => {
    const before = getLast();
    const next = remember(before, el, p);
    if (next !== before) {
      lastRef.current = next;
      saveLast(next);
    }
  };
  const patch = (id: string, p: Partial<El>, merge = true) => {
    const el = els.find((x) => x.id === id);
    if (el) noteLast(el, p);
    setEls((a) => a.map((x) => (x.id === id ? ({ ...x, ...p } as El) : x)), merge ? `patch:${id}:${Object.keys(p).join()}` : undefined);
  };
  const add = (e0: El) => {
    const e = applyLast(getLast(), e0); // estilo del último elemento parecido
    // Si ya hay algo exactamente ahí (varios «Aggiungi» seguidos), baja 8 mm para que no se apilen
    setEls((a) => {
      let y = e.y;
      while (a.some((x) => x.x === e.x && x.y === y)) y += 8;
      return [...a, { ...e, y } as El];
    });
    setSel(e.id);
  };
  const cur = els.find((x) => x.id === sel);

  // Dibujar una forma arrastrando sobre la hoja: la herramienta elegida en el panel, la vista previa en vivo y el elemento al soltar
  const [tool, setTool] = useState<DrawTool | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null); // la verdad al soltar (el estado llega tarde y soltar se oye dos veces)
  const pickTool = (id: string) => {
    if (tool?.id === id) return setTool(null); // pulsar la misma otra vez la suelta
    setSels([]);
    setEditing(null);
    setTool(drawTool(id));
    setTab("canvas"); // en móvil, a la hoja
  };
  const startDraw = (x: number, y: number, shift: boolean) => {
    dragRef.current = { x0: x, y0: y, x1: x, y1: y, shift };
    setDrag(dragRef.current);
  };
  const moveDraw = (x: number, y: number, shift: boolean) => {
    if (!dragRef.current) return;
    dragRef.current = { ...dragRef.current, x1: x, y1: y, shift };
    setDrag(dragRef.current);
  };
  const finishDraw = () => {
    const d = dragRef.current;
    if (!tool || !d) return;
    dragRef.current = null;
    // Un clic sin arrastrar crea la forma con su tamaño por defecto, centrada en el punto
    const g = Math.hypot(d.x1 - d.x0, d.y1 - d.y0) > 2 ? geoOf(tool, d) : { x: d.x0 - tool.def[0] / 2, y: d.y0 - tool.def[1] / 2, w: tool.def[0], h: tool.def[1], angle: 0 };
    add(tool.make(g, uid()));
    setDrag(null);
    setTool(null);
  };
  useEffect(() => {
    if (!drag) return;
    const up = () => finishDraw();
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchend", up);
    };
  });
  // Solo líneas seleccionadas: se estiran por los lados y se giran; no tienen alto que acotar
  const onlyLines = sels.length > 0 && sels.every((id) => els.find((x) => x.id === id)?.type === "line");
  const draftEl: El | null = tool && drag ? { ...tool.make(geoOf(tool, drag), "draft"), opacity: 0.7 } : null;

  const selEls = els.filter((x) => sels.includes(x.id));

  // Clic en un elemento: se selecciona él y los de su grupo; con Maiusc/Ctrl se suma o se quita
  // Lleva el elemento a la posición `to` de la lista de capas (arriba = delante), contada sin él
  const moveLayer = (id: string, to: number) =>
    setEls((a) => {
      const shown = [...a].reverse();
      const el = shown.find((x) => x.id === id);
      if (!el) return a;
      const rest = shown.filter((x) => x.id !== id);
      rest.splice(Math.max(0, Math.min(rest.length, to)), 0, el);
      const next = rest.reverse();
      return next.every((x, i) => x === a[i]) ? a : next;
    });
  // Se mide con offsetTop (no le afectan los transform de la animación), si no las filas que se apartan cambiarían el destino
  const layerTarget = (ul: HTMLElement, id: string, y: number) => {
    const rel = y - ul.getBoundingClientRect().top + ul.offsetTop;
    return [...ul.querySelectorAll<HTMLElement>("li[data-id]")].filter((li) => li.dataset.id !== id && li.offsetTop + li.offsetHeight / 2 < rel).length;
  };
  const pick = (id: string, additive: boolean) => {
    const g = els.find((x) => x.id === id)?.group;
    const ids = g ? els.filter((x) => x.group === g).map((x) => x.id) : [id];
    setSels((cur) => (additive ? (ids.every((i) => cur.includes(i)) ? cur.filter((i) => !ids.includes(i)) : [...new Set([...cur, ...ids])]) : ids));
  };
  const group = () => {
    const g = uid();
    setEls((a) => a.map((x) => (sels.includes(x.id) ? { ...x, group: g } : x)));
  };
  const ungroup = () => setEls((a) => a.map((x) => (sels.includes(x.id) && x.group ? { ...x, group: undefined } : x)));
  const removeSel = () => {
    setEditing(null);
    setEls((a) => a.filter((x) => !sels.includes(x.id)));
    setSels([]);
  };
  const duplicateSel = () => {
    const groups = new Map<string, string>();
    const copies = selEls.map((e) => {
      if (e.group && !groups.has(e.group)) groups.set(e.group, uid());
      return { ...e, id: uid(), x: e.x + 5, y: e.y + 5, locked: false, group: e.group && groups.get(e.group) } as El;
    });
    setEls((a) => [...a, ...copies]);
    setSels(copies.map((c) => c.id));
  };
  // Alinea la selección entre sí (o con la hoja si es un solo elemento)
  const align = (mode: "l" | "c" | "r" | "t" | "m" | "b") => {
    const layer = layerRef.current!;
    const boxes = selEls.flatMap((e) => {
      const b = !e.locked ? layer.findOne("#" + e.id)?.getClientRect({ relativeTo: layer }) : undefined;
      return b ? [{ id: e.id, b }] : [];
    });
    if (!boxes.length) return;
    const x0 = Math.min(...boxes.map((o) => o.b.x));
    const y0 = Math.min(...boxes.map((o) => o.b.y));
    const x1 = Math.max(...boxes.map((o) => o.b.x + o.b.width));
    const y1 = Math.max(...boxes.map((o) => o.b.y + o.b.height));
    const ref = boxes.length > 1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w, h };
    const delta = (b: { x: number; y: number; width: number; height: number }) => ({
      l: [ref.x - b.x, 0], c: [ref.x + ref.w / 2 - (b.x + b.width / 2), 0], r: [ref.x + ref.w - (b.x + b.width), 0],
      t: [0, ref.y - b.y], m: [0, ref.y + ref.h / 2 - (b.y + b.height / 2)], b: [0, ref.y + ref.h - (b.y + b.height)],
    })[mode];
    setEls((a) => a.map((x) => {
      const o = boxes.find((q) => q.id === x.id);
      if (!o) return x;
      const [dx, dy] = delta(o.b);
      return { ...x, x: x.x + dx, y: x.y + dy };
    }));
  };
  const move = (id: string, dir: -1 | 1) =>
    setEls((a) => {
      const i = a.findIndex((x) => x.id === id);
      const j = i + dir;
      if (j < 0 || j >= a.length) return a;
      const b = [...a];
      [b[i], b[j]] = [b[j], b[i]];
      return b;
    });

  const addImage = (file: File | undefined) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = async () => {
      const img = await shrink(String(r.result), 1600, file.type === "image/png");
      const width = Math.min(100, w - 20);
      add({ id: uid(), type: "image", src: img.src, x: 10, y: 10, width, height: (width * img.h) / img.w, ...common });
    };
    r.readAsDataURL(file);
  };

  // Dibuja la hoja entera a ~300 ppp (menos si superaría el límite de píxeles) sin las maniglie
  const render = (n: number) => {
    const stage = stageRef.current!;
    const tr = trRef.current!;
    const targetW = (w / MM_PER_INCH) * DPI;
    const targetH = (h / MM_PER_INCH) * DPI;
    const k = Math.min(1, Math.sqrt(MAX_PIXELS / (targetW * targetH * n))); // n copias = n veces los píxeles
    // En modo oscuro la hoja blanca se ve en blanco roto; al exportar o imprimir sale blanco puro
    const sheet = stage.findOne(".paper") as Konva.Rect | undefined;
    const screenFill = sheet?.fill();
    if (sheet && !bgGrad && bg.toLowerCase() === PAPER_WHITE) sheet.fill(PAPER_WHITE);
    tr.visible(false);
    try {
      return { url: stage.toDataURL({ pixelRatio: (targetW * k) / (w * zoom), mimeType: "image/png" }), dpi: Math.round(DPI * k) };
    } finally {
      tr.visible(true);
      if (sheet && screenFill) sheet.fill(screenFill);
    }
  };
  // La hoja lista para imprimir: la carta repetida en el folio (una sola imagen con 1 copia)
  const compose = async () => {
    const n = sheet.cols * sheet.rows;
    // Con números de mesa, cada copia se dibuja por separado cambiando el texto de esos nodos (y se restaura después)
    const nodes = stageRef.current!.find(".table-number") as Konva.Text[];
    const urls: string[] = [];
    let dpi = 0;
    if (nodes.length) {
      const orig = nodes.map((t) => ({ text: t.text(), opacity: t.opacity() }));
      try {
        for (let c = 0; c < copies; c++) {
          nodes.forEach((t) => {
            t.text(tables[c] ?? "");
            t.opacity(1);
          });
          const r = render(n);
          urls.push(r.url);
          dpi = r.dpi;
        }
      } finally {
        nodes.forEach((t, i) => {
          t.text(orig[i].text);
          t.opacity(orig[i].opacity);
        });
      }
    } else {
      const r = render(n);
      urls.push(r.url);
      dpi = r.dpi;
    }
    if (copies === 1) return { url: urls[0], dpi };
    const ims = await Promise.all(urls.map(async (u) => {
      const im = new window.Image();
      im.src = u;
      await im.decode();
      return im;
    }));
    const c = document.createElement("canvas");
    c.width = ims[0].width * sheet.cols;
    c.height = ims[0].height * sheet.rows;
    const g = c.getContext("2d")!;
    for (let r = 0; r < sheet.rows; r++) for (let q = 0; q < sheet.cols; q++) g.drawImage(ims[(r * sheet.cols + q) % ims.length], q * ims[0].width, r * ims[0].height);
    return { url: c.toDataURL("image/png"), dpi };
  };
  const download = (href: string, name: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
  };
  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setExportError("");
    try {
      await job();
    } catch (e) {
      console.error(e);
      setExportError(tr("Non sono riuscito a completare l'operazione. Prova con una carta più piccola o meno immagini."));
    } finally {
      setBusy(false);
    }
  };
  // Recorre las páginas mostrándolas una a una (el lienzo solo pinta la actual), espera a que se
  // dibujen y devuelve el resultado de `fn` para cada una. Al terminar vuelve a la página en que estaba.
  const eachPage = async <T,>(fn: () => Promise<T>): Promise<T[]> => {
    const start = page;
    let shown = page;
    const out: T[] = [];
    try {
      for (let i = 0; i < hist.pages.length; i++) {
        if (hist.pages.length > 1) {
          setSels([]);
          if (shown !== i) {
            // se espera al commit de React (el efecto de `page` avisa), no a un número fijo de fotogramas
            await new Promise<void>((ok) => {
              pageWaiter.current = { i, ok };
              setPageIdx(i);
            });
            shown = i;
          }
          await new Promise((ok) => requestAnimationFrame(ok));
          // las imágenes se cargan de forma asíncrona: se espera (máx. 3 s) a que estén todas
          for (let t = 0; t < 60 && !stageRef.current!.find("Image").every((n) => (n as Konva.Image).image()); t++) await new Promise((ok) => setTimeout(ok, 50));
        }
        out.push(await fn());
      }
    } finally {
      setPageIdx(start);
    }
    return out;
  };
  const exportPng = () =>
    run(async () => {
      const urls = (await eachPage(compose)).map((c) => c.url);
      for (const [i, url] of urls.entries()) {
        download(url, `menu-${paper}-x${copies}${urls.length > 1 ? `-p${i + 1}` : ""}.png`);
        if (i < urls.length - 1) await new Promise((ok) => setTimeout(ok, 300)); // los navegadores descartan descargas simultáneas
      }
    });
  const exportPdf = () =>
    run(async () => {
      const { PDFDocument } = await import("pdf-lib");
      const urls = (await eachPage(compose)).map((c) => c.url);
      const doc = await PDFDocument.create();
      const pt = (mm: number) => (mm / MM_PER_INCH) * 72;
      for (const url of urls) {
        const png = await fetch(url).then((r) => r.arrayBuffer());
        const pg = doc.addPage([pt(sheet.w), pt(sheet.h)]);
        pg.drawImage(await doc.embedPng(png), { x: 0, y: 0, width: pt(sheet.w), height: pt(sheet.h) });
      }
      const bytes = await doc.save();
      const href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      download(href, `menu-${paper}-x${copies}.pdf`);
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    });
  // Imán al arrastrar: los bordes y el centro del elemento se pegan a los de la hoja y a los de los demás
  const snap = (e: Konva.KonvaEventObject<DragEvent>, id: string) => {
    const node = e.target;
    if (e.evt.altKey) return setGuides({ v: [], h: [] });
    const layer = layerRef.current!;
    const tol = 4 / zoom; // 4 px de pantalla
    const xs = [0, w / 2, w];
    const ys = [0, h / 2, h];
    for (const o of els) {
      const n = o.id !== id && o.visible ? layer.findOne("#" + o.id) : undefined;
      if (!n) continue;
      const b = n.getClientRect({ relativeTo: layer });
      xs.push(b.x, b.x + b.width / 2, b.x + b.width);
      ys.push(b.y, b.y + b.height / 2, b.y + b.height);
    }
    const best = (mine: number[], targets: number[]) => {
      let r: { d: number; t: number } | null = null;
      for (const m of mine) for (const t of targets) if (Math.abs(t - m) <= tol && (!r || Math.abs(t - m) < Math.abs(r.d))) r = { d: t - m, t };
      return r;
    };
    const box = node.getClientRect({ relativeTo: layer });
    const bx = best([box.x, box.x + box.width / 2, box.x + box.width], xs);
    const by = best([box.y, box.y + box.height / 2, box.y + box.height], ys);
    if (bx) node.x(node.x() + bx.d);
    if (by) node.y(node.y() + by.d);
    setGuides({ v: bx ? [bx.t] : [], h: by ? [by.t] : [] });
  };

  // Archivo de diseños
  useEffect(() => {
    designs.list().then(setSaved, () => setArchiveMsg(tr("L'archivio non è disponibile su questo browser.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir el editor
  }, []);
  const refreshSaved = () => designs.list().then(setSaved);
  const saveDesign = async () => {
    const name = designName.trim() || tr("Senza nome");
    try {
      const same = saved.find((d) => d.name.toLowerCase() === name.toLowerCase());
      if (same && !confirm(lang === "es" ? `Ya existe «${same.name}». ¿Quieres reemplazarlo?` : `Esiste già «${same.name}». Sostituirlo?`)) return;
      await designs.save({ id: same?.id ?? uid(), name, savedAt: Date.now(), doc: { paper, copies, pages: hist.pages, tables, bg, bgGrad } });
      setDesignName("");
      setArchiveMsg(lang === "es" ? `Guardado «${name}».` : `Salvato «${name}».`);
      await refreshSaved();
    } catch {
      setArchiveMsg(tr("Non sono riuscito a salvare: forse manca spazio sul dispositivo."));
    }
  };
  const openDesign = (d: Design) => {
    if (!confirm(lang === "es" ? `¿Abrir «${d.name}»? El trabajo actual sin guardar se perderá.` : `Aprire «${d.name}»? Il lavoro attuale non salvato andrà perso.`)) return;
    setPaper(d.doc.paper);
    setCopies(COPIES.includes(d.doc.copies) ? d.doc.copies : 1);
    setTables(d.doc.tables ?? []);
    setBg(okBg(d.doc.bg));
    setBgGrad(okGrad(d.doc.bgGrad));
    setPages(() => cleanPages(d.doc.pages));
    goPage(0);
    setArchiveMsg(lang === "es" ? `Abierto «${d.name}».` : `Aperto «${d.name}».`);
  };
  const removeDesign = async (d: Design) => {
    if (!confirm(lang === "es" ? `¿Eliminar «${d.name}» del archivo?` : `Eliminare «${d.name}» dall'archivio?`)) return;
    await designs.remove(d.id).catch(() => setArchiveMsg(tr("Non sono riuscito a eliminarlo.")));
    await refreshSaved();
  };

  // Rehace el lienzo a partir de la carta del editor principal; Annulla lo deshace
  const importMenu = () =>
    run(async () => {
      setImportMsg("");
      const menu = readSavedMenu();
      if (!menu) return setImportMsg(tr("Nessun menù trovato: crealo prima nell'editor principale."));
      const pages = await menuToPages(menu, paper, tr("Tavolo n.:"));
      setPages(() => pages);
      setTables(menu.tableNumbers.map(String).slice(0, 4));
      goPage(pages.length - 1); // la página del menú; la copertina es la anterior
      setImportMsg(pages.length > 1 ? tr("Menù importato, con la copertina.") : tr("Menù importato."));
    });
  // PDF ya hecho → páginas nuevas con fondo fiel y textos editables. Si el documento está vacío, lo sustituye y toma su papel.
  const [pdfBusy, setPdfBusy] = useState(false);
  const importPdf = (file: File | undefined) => {
    if (!file) return;
    setPdfBusy(true);
    setImportMsg("");
    run(async () => {
      try {
        const blank = hist.pages.length === 1 && hist.pages[0].every((e) => e.type === "text" && e.text === "Menù");
        let r;
        try {
          r = await readPdf(file, blank ? null : paper);
        } catch (e) {
          console.error(e);
          const code = (e as { code?: PdfError }).code ?? "invalid";
          return setImportMsg(tr({ big: "Il PDF supera i 15 MB: riducilo e riprova.", password: "Il PDF è protetto da password: toglila e riprova.", invalid: "Non riesco a leggere questo PDF: forse è danneggiato." }[code]));
        }
        if (blank) {
          setPaper(r.paper);
          setPages(() => r.pages);
          goPage(0);
        } else {
          const at = hist.pages.length;
          setPages((p) => [...p, ...r.pages]);
          goPage(at);
        }
        setTab("canvas");
        const n = r.pages.length;
        const msg = [lang === "es" ? `PDF importado: ${n === 1 ? "1 página" : `${n} páginas`}.` : `PDF importato: ${n === 1 ? "1 pagina" : `${n} pagine`}.`];
        if (r.total > MAX_PAGES) msg.push(lang === "es" ? `Tenía ${r.total} páginas: solo he importado las ${MAX_PAGES} primeras.` : `Aveva ${r.total} pagine: ho importato solo le prime ${MAX_PAGES}.`);
        msg.push(tr(r.textless ? "Non ci sono testi modificabili (forse è una scansione): l'ho importato come immagine." : "Fai doppio clic su un testo per modificarlo."));
        setImportMsg(msg.join(" "));
      } finally {
        setPdfBusy(false); // pase lo que pase, el botón vuelve a estar disponible
      }
    });
  };
  const print = () =>
    run(async () => {
      const urls = (await eachPage(compose)).map((c) => c.url);
      await Promise.all(urls.map(async (u) => {
        const im = new window.Image();
        im.src = u;
        await im.decode();
      }));
      setPrintSrcs(urls);
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      window.print();
    });

  // Suprimir borra el elemento (salvo si se está escribiendo en un campo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      // Esc: deja de seleccionar, aunque el foco esté en un campo del panel (se le quita el foco). Escribiendo sobre la hoja, Esc solo cierra la caja
      if (e.key === "Escape" && tool) {
        dragRef.current = null;
        setDrag(null);
        setTool(null);
        return;
      }
      if (e.key === "Escape" && !(t.tagName === "TEXTAREA" && t.getAttribute("aria-label") === tr("Testo"))) {
        if (/INPUT|TEXTAREA|SELECT/.test(t.tagName)) t.blur();
        setSels([]);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) {
        const k = e.key.toLowerCase();
        if (k === "z") {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        }
        if (k === "y") { e.preventDefault(); redo(); }
        if (k === "a") { e.preventDefault(); setSels(els.filter((x) => x.visible && !x.locked).map((x) => x.id)); }
        if (k === "g" && sels.length) { e.preventDefault(); if (e.shiftKey) ungroup(); else if (sels.length > 1) group(); }
        if (k === "d" && sels.length) { e.preventDefault(); duplicateSel(); }
        return;
      }
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (!sels.length) return;
      if (e.key === "Delete" || e.key === "Backspace") removeSel();
      const step = e.shiftKey ? 5 : 1;
      const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (d[e.key]) {
        e.preventDefault();
        setEls((a) => a.map((x) => (sels.includes(x.id) && !x.locked ? { ...x, x: x.x + d[e.key][0], y: x.y + d[e.key][1] } : x)), "nudge:" + sels.join());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Tras mover o transformar, guarda todos los elementos seleccionados y pasa la escala a width/height
  // para no acumularla. Es idempotente: si Konva avisa varias veces (una por nodo) no añade pasos de historial.
  // Texto en vivo: al arrastrar un tirador no se estira, se re-ajusta al instante. Tiradores de los lados: cambia el ancho y el texto
  // salta de línea; arriba/abajo: cambia el cuerpo de la letra; esquinas: ancho y cuerpo a la vez (se amplía o reduce entero)
  const textLive = (e: Konva.KonvaEventObject<Event>) => {
    const n = e.target as Konva.Text;
    const a = trRef.current?.getActiveAnchor() ?? "";
    const next = a.startsWith("middle")
      ? { width: Math.max(5, n.width() * n.scaleX()) }
      : a === "top-center" || a === "bottom-center"
        ? { fontSize: Math.max(2, n.fontSize() * n.scaleY()) }
        : { width: Math.max(5, n.width() * n.scaleX()), fontSize: Math.max(2, n.fontSize() * n.scaleX()) };
    n.setAttrs({ ...next, scaleX: 1, scaleY: 1 });
  };
  // Doble clic en un tirador: la caja de cada texto seleccionado se ajusta a su texto (el renglón más largo, sin saltos automáticos)
  const fitTexts = () => {
    const layer = layerRef.current;
    if (!layer) return;
    const upd = new Map<string, { x: number; width: number }>();
    for (const el of els) {
      const n = el.type === "text" && !el.locked && sels.includes(el.id) ? (layer.findOne("#" + el.id) as Konva.Text | undefined) : undefined;
      if (!n || el.type !== "text") continue;
      const c = n.clone({ width: "auto" }) as Konva.Text;
      const w = Math.max(5, c.width());
      c.destroy();
      const dw = el.width - w;
      // el texto centrado o a la derecha mantiene su centro o su borde derecho (si está girado se deja la esquina)
      const dx = el.rotation % 360 !== 0 ? 0 : el.align === "center" ? dw / 2 : el.align === "right" ? dw : 0;
      upd.set(el.id, { x: el.x + dx, width: w });
    }
    if (upd.size) setEls((a) => a.map((x) => (upd.has(x.id) ? ({ ...x, ...upd.get(x.id) } as El) : x)));
  };
  const commit = () => {
    const layer = layerRef.current!;
    const upd = new Map<string, Partial<El>>();
    for (const el of els) {
      const n = sels.includes(el.id) ? layer.findOne("#" + el.id) : undefined;
      if (!n) continue;
      const sx = n.scaleX();
      const sy = n.scaleY();
      n.scaleX(1);
      n.scaleY(1);
      const u: Partial<El> = { x: n.x(), y: n.y(), rotation: n.rotation() };
      if (el.type === "text") {
        // ya re-ajustado en vivo por textLive: ancho y cuerpo salen del propio nodo
        (u as Partial<typeof el>).fontSize = Math.max(2, (n as Konva.Text).fontSize());
        u.width = Math.max(1, n.width());
      } else if (sx !== 1 || sy !== 1) {
        u.width = Math.max(1, n.width() * sx);
        if (el.type !== "line") u.height = Math.max(0.1, n.height() * sy);
      }
      upd.set(el.id, u);
    }
    if (!upd.size) return;
    setEls((a) => {
      let changed = false;
      const next = a.map((x) => {
        const u = upd.get(x.id);
        if (!u || (Object.keys(u) as (keyof El)[]).every((k) => x[k] === u[k])) return x;
        changed = true;
        return { ...x, ...u } as El;
      });
      return changed ? next : a;
    });
  };

  // Rectángulo de selección: arrastrar sobre la hoja vacía
  const toMm = (stage: Konva.Stage) => {
    const p = stage.getPointerPosition()!;
    return { x: p.x / zoom, y: p.y / zoom };
  };
  const emptyHit = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => e.target === e.target.getStage() || e.target.name() === "paper";
  const endMarquee = () => {
    const from = marqueeFrom.current;
    marqueeFrom.current = null;
    if (!from || !marquee) return setMarquee(null);
    const layer = layerRef.current!;
    const hit = els.filter((el) => {
      const b = el.visible && !el.locked ? layer.findOne("#" + el.id)?.getClientRect({ relativeTo: layer }) : undefined;
      return !!b && b.x < marquee.x + marquee.w && b.x + b.width > marquee.x && b.y < marquee.y + marquee.h && b.y + b.height > marquee.y;
    });
    const groups = new Set(hit.map((e) => e.group).filter(Boolean));
    const ids = els.filter((e) => hit.includes(e) || (e.group && groups.has(e.group))).map((e) => e.id);
    setSels((cur) => (from.add ? [...new Set([...cur, ...ids])] : ids));
    setMarquee(null);
  };

  const ball = `grid size-11 place-items-center rounded-full bg-surface text-ink shadow-[0_8px_24px_-8px_rgb(14_26_43/0.45)] ring-1 ring-laguna/60 lift hover:text-mare disabled:pointer-events-none disabled:opacity-40 ${focus}`;
  const small = `${secondary} px-3 py-1.5 text-xs`;
  const pillOpt = (on: boolean) => (on ? chipOn : chip);
  const pct = Math.round(Math.min(mul, maxMul) * 100);
  const hasTable = hist.pages.some((pg) => pg.some((e) => e.type === "text" && e.table));

  // Panel «Elemento»: columna derecha en escritorio y pestaña «Strumenti» en móvil (mismo JSX en los dos sitios)
  // Esquinas de la imagen seleccionada: cuatro formas rápidas (fracción del lado menor) y los mm exactos
  const imageCorners =
    cur?.type === "image" ? (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-1.5">
          {([["Retti", 0], ["Morbidi", 0.12], ["Arrotondati", 0.3], ["Cerchio", 0.5]] as const).map(([name, f]) => {
            const m = Math.min(cur.width, cur.height);
            const on = Math.abs((cur.radius ?? 0) / m - f) < 0.02;
            return (
              <button key={name} type="button" aria-pressed={on} className={`${small} justify-center ${on ? "bg-mare/15" : ""}`} onClick={() => patch(cur.id, { radius: f * m })}>
                {tr(name)}
              </button>
            );
          })}
        </div>
        <Num label={tr("Angoli (mm)")} value={cur.radius ?? 0} min={0} onChange={(v) => patch(cur.id, { radius: v })} />
      </div>
    ) : null;
  // Edición en conjunto (varios elementos seleccionados): un cambio se aplica a los del tipo al que corresponde
  type TextEl = Extract<El, { type: "text" }>;
  type FillEl = Exclude<El, { type: "image" } | { type: "tiles" }>;
  type ShapeLike = Extract<El, { type: "rect" }> | Extract<El, { type: "shape" }>;
  const isText = (e: El): e is TextEl => e.type === "text";
  const isFill = (e: El): e is FillEl => e.type !== "image" && e.type !== "tiles";
  const isShapeLike = (e: El): e is ShapeLike => e.type === "rect" || (e.type === "shape" && !SHAPES[e.kind].stroke);
  const isImg = (e: El): e is Extract<El, { type: "image" }> => e.type === "image";
  const putSel = (pick: (e: El) => boolean, p: Partial<El>) => {
    const hit = selEls.filter((x) => !x.locked && pick(x));
    if (!hit.length) return;
    noteLast(hit[0], p);
    setEls((a) => a.map((x) => (sels.includes(x.id) && !x.locked && pick(x) ? ({ ...x, ...p } as El) : x)), `multi:${Object.keys(p).join()}`);
  };
  const mTexts = selEls.filter(isText);
  const mFill = selEls.filter(isFill);
  const mShapes = selEls.filter(isShapeLike);
  const mImgs = selEls.filter(isImg);
  // Cajas de los seleccionados en mm (las que usa también «alinear»)
  const boxesOfSel = () => {
    const layer = layerRef.current!;
    return selEls.flatMap((e) => {
      const b = !e.locked ? layer.findOne("#" + e.id)?.getClientRect({ relativeTo: layer }) : undefined;
      return b ? [{ id: e.id, b }] : [];
    });
  };
  // Distribuir: el mismo espacio entre elementos (el primero y el último no se mueven)
  const distribute = (axis: "x" | "y") => {
    const boxes = boxesOfSel();
    if (boxes.length < 3) return;
    const [pos, size] = axis === "x" ? (["x", "width"] as const) : (["y", "height"] as const);
    boxes.sort((p, q) => p.b[pos] - q.b[pos]);
    const first = boxes[0].b[pos];
    const lastBox = boxes[boxes.length - 1].b;
    const gap = (lastBox[pos] + lastBox[size] - first - boxes.reduce((a, o) => a + o.b[size], 0)) / (boxes.length - 1);
    const delta = new Map<string, number>();
    let at = first;
    for (const o of boxes) {
      delta.set(o.id, at - o.b[pos]);
      at += o.b[size] + gap;
    }
    setEls((a) => a.map((x) => (delta.has(x.id) ? (axis === "x" ? { ...x, x: x.x + delta.get(x.id)! } : { ...x, y: x.y + delta.get(x.id)! }) : x)));
  };
  // Misma anchura o altura que el primer elemento seleccionado (el alto de textos y líneas no se toca)
  const sameSize = (dim: "width" | "height") => {
    const ref = els.find((x) => x.id === sels[0]);
    if (!ref) return;
    setEls((a) => a.map((x) => (sels.includes(x.id) && !x.locked && (dim === "width" || (x.type !== "text" && x.type !== "line")) ? ({ ...x, [dim]: ref[dim] } as El) : x)));
  };
  // Barra de texto (como en Canva): en la cabecera, en lugar del aviso, cuando la selección tiene algún texto. Cambia todos los textos seleccionados
  const tx = mTexts[0];
  const barBtn = `glow grid size-9 shrink-0 place-items-center rounded-lg text-ink/80 hover:bg-laguna/30 ${focus}`;
  const barOn = "bg-laguna/40 text-ink";
  const stepSize = (k: number) => tx && putSel(isText, { fontSize: Math.max(2, Math.round((tx.fontSize + k) * 10) / 10) });
  const textBar = tx && !editing && (
    <div className="relative flex min-w-0 flex-1 justify-center">
      <div role="toolbar" aria-label={tr("Testo")} className="flex items-center gap-1"
        onKeyDown={(e) => e.key === "Escape" && fontOpen && (e.stopPropagation(), setFontOpen(false))}>
        <button type="button" aria-haspopup="true" aria-expanded={fontOpen} title={tr("Carattere")} className={`glow flex h-9 w-36 shrink-0 items-center justify-between gap-1 rounded-lg border border-laguna px-2.5 text-[15px] hover:bg-laguna/30 ${focus}`}
          style={{ fontFamily: (() => { const f = FONTS.find((x) => x.key === tx.fontFamily); return f ? `var(${f.cssVar}), ${f.fallback}` : undefined; })() }} onClick={() => setFontOpen((o) => !o)}>
          <span className="truncate">{FONTS.find((x) => x.key === tx.fontFamily)?.label ?? tx.fontFamily}</span>
          <span aria-hidden className="text-xs text-ink/60">▾</span>
        </button>
        <div className="glow flex h-9 shrink-0 items-center rounded-lg border border-laguna">
          <button type="button" className={`${barBtn} size-8`} aria-label={tr("Riduci dimensione")} onClick={() => stepSize(-0.5)}>−</button>
          <input type="number" aria-label={tr("Dimensione (mm)")} title={tr("Dimensione (mm)")} min={2} step={0.5} value={Math.round(tx.fontSize * 10) / 10}
            onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 2) putSel(isText, { fontSize: v }); }}
            className="w-12 bg-transparent text-center text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
          <button type="button" className={`${barBtn} size-8`} aria-label={tr("Aumenta dimensione")} onClick={() => stepSize(0.5)}>+</button>
        </div>
        <label title={tr("Colore")} className={`${barBtn} relative cursor-pointer`}>
          <span aria-hidden className="text-[17px] font-bold leading-none">A</span>
          <span aria-hidden className="absolute bottom-1.5 left-2 right-2 h-1 rounded-full ring-1 ring-ink/20" style={{ background: tx.fill }} />
          <input type="color" aria-label={tr("Colore")} value={/^#[0-9a-f]{6}$/i.test(tx.fill) ? tx.fill : "#000000"} onChange={(e) => putSel(isText, { fill: e.target.value })} className="absolute inset-0 size-full cursor-pointer opacity-0" />
        </label>
        <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-laguna" />
        <Tip label={tr("Grassetto")}><button type="button" aria-pressed={tx.bold} aria-label={tr("Grassetto")} className={`${barBtn} font-bold ${tx.bold ? barOn : ""}`} onClick={() => putSel(isText, { bold: !tx.bold })}>B</button></Tip>
        <Tip label={tr("Corsivo")}><button type="button" aria-pressed={tx.italic} aria-label={tr("Corsivo")} className={`${barBtn} font-serif italic ${tx.italic ? barOn : ""}`} onClick={() => putSel(isText, { italic: !tx.italic })}>I</button></Tip>
        <Tip label={tr("Sottolineato")}><button type="button" aria-pressed={!!tx.underline} aria-label={tr("Sottolineato")} className={`${barBtn} underline underline-offset-2 ${tx.underline ? barOn : ""}`} onClick={() => putSel(isText, { underline: !tx.underline })}>U</button></Tip>
        {(["left", "center", "right"] as const).map((al) => {
          const t = tr(`Allinea testo ${al === "left" ? "a sinistra" : al === "center" ? "al centro" : "a destra"}`);
          return (
            <Tip key={al} label={t}>
              <button type="button" aria-pressed={tx.align === al} aria-label={t} className={`${barBtn} ${tx.align === al ? barOn : ""}`} onClick={() => putSel(isText, { align: al })}>
                <Icon d={al === "left" ? ICONS.alignLeft : al === "center" ? ICONS.alignCenter : ICONS.alignRight} className="size-[18px]" />
              </button>
            </Tip>
          );
        })}
        <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-laguna" />
        <label title={tr("Interlinea")} className="glow flex h-9 shrink-0 items-center gap-1 rounded-lg border border-laguna pl-2 text-xs text-ink/70">
          <span aria-hidden>↕</span>
          <input type="number" aria-label={tr("Interlinea")} min={0.5} step={0.1} value={tx.lineHeight ?? 1.2}
            onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0.5) putSel(isText, { lineHeight: v }); }}
            className="w-12 bg-transparent text-center text-sm text-ink tabular-nums outline-none" />
        </label>
        <Tip label={tr("Copia stile")}><button type="button" aria-label={tr("Copia stile")} className={barBtn} onClick={() => setStyleClip({ fontFamily: tx.fontFamily, fontSize: tx.fontSize, bold: tx.bold, italic: tx.italic, underline: tx.underline, align: tx.align, fill: tx.fill, grad: tx.grad, lineHeight: tx.lineHeight, opacity: tx.opacity })}><Icon d={ICONS.copy} className="size-[18px]" /></button></Tip>
        <Tip label={tr("Applica stile")}><button type="button" aria-label={tr("Applica stile")} disabled={!styleClip} className={`${barBtn} disabled:text-ink/30`} onClick={() => styleClip && putSel(isText, styleClip)}><PaintBrushIcon size={18} weight="fill" aria-hidden /></button></Tip>
      </div>
      {fontOpen && (
        <div className="absolute left-1/2 top-full z-40 mt-2 w-60 -translate-x-1/2 rounded-xl border border-laguna/60 bg-surface p-1 shadow-[0_10px_30px_-10px_rgb(14_26_43/0.35)]">
          <FontList value={tx.fontFamily} tr={tr} onPick={(k) => { putSel(isText, { fontFamily: k }); setFontOpen(false); }} />
        </div>
      )}
    </div>
  );
  const properties = sels.length > 0 && (
    <div>
      <div className="border-b border-laguna/50 px-5 py-4">
        <h2 className="font-display text-[17px] font-semibold">{cur ? label(cur, tr) : `${sels.length} ${tr("elementi")}`}</h2>
        <p className="text-xs text-ink/70">{cur ? tr("Elemento selezionato") : tr("Selezione multipla")}</p>
      </div>
      {cur?.type === "text" && (
        <Block title={tr("Testo")}>
          <button className={`${secondary} w-full justify-center`} onClick={() => { setTab("canvas"); setEditing(cur.id); }}>
            <Icon d={ICONS.edit} className="size-4" />
            {tr("Modifica testo")}
          </button>
          <p className="text-xs text-ink/70">{tr("Oppure doppio clic sul testo, sulla carta.")}</p>
          <Switch checked={!!cur.table} onChange={(v) => patch(cur.id, { table: v })}>{tr("Numero di tavolo (diverso per ogni copia)")}</Switch>
        </Block>
      )}
      <Block title={tr("Azioni")}>
        <div className="flex flex-wrap gap-1.5">
          <Tip label={tr("Duplica")} hint="Ctrl+D"><button className={iconBtn} aria-label={tr("Duplica")} onClick={duplicateSel}><Icon d={ICONS.copy} className="size-[18px]" /></button></Tip>
          {sels.length > 1 && <Tip label={tr("Raggruppa")} hint={tr("Ctrl+G: si spostano insieme")}><button className={iconBtn} aria-label={tr("Raggruppa")} onClick={group}><Icon d={ICONS.group} className="size-[18px]" /></button></Tip>}
          {selEls.some((x) => x.group) && <Tip label={tr("Separa")} hint={tr("Ctrl+Maiusc+G")}><button className={iconBtn} aria-label={tr("Separa")} onClick={ungroup}><Icon d={ICONS.ungroup} className="size-[18px]" /></button></Tip>}
          <Tip label={tr("Elimina")} hint={tr("Canc")}><button className={iconBtn} aria-label={tr("Elimina")} onClick={removeSel}><Icon d={ICONS.trash} className="size-[18px]" /></button></Tip>
        </div>
      </Block>
      <Block title={tr("Allineamento")}>
        <div className="grid grid-cols-3 gap-1.5">
          {([["l", tr("Sinistra"), "a sinistra"], ["c", tr("Centro"), "al centro"], ["r", tr("Destra"), "a destra"], ["t", tr("Alto"), "in alto"], ["m", tr("Mezzo"), "al centro in verticale"], ["b", tr("Basso"), "in basso"]] as const).map(([m, t, d]) => (
            <button key={m} title={tr(`Allinea ${d}`)} aria-label={tr(`Allinea ${d}`)} className={`${small} justify-center`} onClick={() => align(m)}>{t}</button>
          ))}
        </div>
      </Block>
      {sels.length > 1 && (
        <>
          <Block title={tr("Disposizione")}>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" title={tr("Distribuisci in orizzontale")} disabled={selEls.length < 3} className={`${small} justify-center`} onClick={() => distribute("x")}>{tr("Orizzontale")}</button>
              <button type="button" title={tr("Distribuisci in verticale")} disabled={selEls.length < 3} className={`${small} justify-center`} onClick={() => distribute("y")}>{tr("Verticale")}</button>
              <button type="button" title={tr("Stessa larghezza")} className={`${small} justify-center`} onClick={() => sameSize("width")}>{tr("Larghezza")}</button>
              <button type="button" title={tr("Stessa altezza")} className={`${small} justify-center`} onClick={() => sameSize("height")}>{tr("Altezza")}</button>
            </div>
          </Block>
          {mShapes.length > 0 && (
            <Block title={tr("Riempimento")}>
              <Seg label={tr("Riempimento")} value={mShapes[0].hollow ? "line" : "fill"} onChange={(v) => putSel(isShapeLike, { hollow: v === "line" })} options={[["fill", tr("Pieno")], ["line", tr("Solo bordo")]] as const} />
              {mShapes[0].hollow && <Num label={tr("Spessore bordo (mm)")} value={mShapes[0].borderW ?? 1} min={0.1} step={0.1} onChange={(v) => putSel(isShapeLike, { borderW: v })} />}
            </Block>
          )}
          {mFill.length > 0 && (
            <Block title={tr("Colore")}>
              <ColorRow value={mFill[0].fill} onChange={(hex) => putSel(isFill, { fill: hex })} tr={tr} label={mFill[0].grad ? tr("Colore iniziale") : tr("Colore")} />
              <GradientControls fill={mFill[0].fill} grad={mFill[0].grad} onChange={(g) => putSel(isFill, { grad: g })} tr={tr} />
            </Block>
          )}
          {mImgs.length > 0 && (
            <Block title={tr("Bordi dell'immagine")}>
              <Num label={tr("Angoli (mm)")} value={mImgs[0].radius ?? 0} min={0} onChange={(v) => putSel(isImg, { radius: v })} />
            </Block>
          )}
          <Block title={tr("Aspetto")}>
            <label className="flex items-center gap-2 text-[13px] font-semibold">
              {tr("Opacità")}
              <Range min={0} max={1} step={0.05} value={selEls[0]?.opacity ?? 1} label={tr("Opacità")} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => putSel(() => true, { opacity: v })} />
              <span className="w-10 text-right font-normal tabular-nums">{Math.round((selEls[0]?.opacity ?? 1) * 100)}%</span>
            </label>
          </Block>
        </>
      )}
      {cur && (
        <Block title={tr("Posizione e misure")}>
          <div className="space-y-3">
            <Num label="X (mm)" value={cur.x} onChange={(v) => patch(cur.id, { x: v })} />
            <Num label="Y (mm)" value={cur.y} onChange={(v) => patch(cur.id, { y: v })} />
            <Num label={tr("Larghezza (mm)")} value={cur.width} min={1} onChange={(v) => patch(cur.id, { width: v })} />
            {cur.type !== "text" && <Num label={tr("Altezza (mm)")} value={cur.height} min={1} onChange={(v) => patch(cur.id, { height: v })} />}
            <Num label={tr("Rotazione (°)")} value={cur.rotation} onChange={(v) => patch(cur.id, { rotation: v })} />
          </div>
        </Block>
      )}
      {cur && (cur.type === "rect" || (cur.type === "shape" && !SHAPES[cur.kind].stroke)) && (
        <Block title={tr("Riempimento")}>
          <Seg label={tr("Riempimento")} value={cur.hollow ? "line" : "fill"} onChange={(v) => patch(cur.id, { hollow: v === "line" })} options={[["fill", tr("Pieno")], ["line", tr("Solo bordo")]] as const} />
          {cur.hollow && <Num label={tr("Spessore bordo (mm)")} value={cur.borderW ?? 1} min={0.1} step={0.1} onChange={(v) => patch(cur.id, { borderW: v })} />}
        </Block>
      )}
      {cur && cur.type !== "image" && (
        <Block title={tr("Colore")}>
          <ColorRow value={cur.fill} onChange={(hex) => patch(cur.id, { fill: hex })} tr={tr} label={cur.grad ? tr("Colore iniziale") : tr("Colore")} />
          {cur.type !== "tiles" && <GradientControls fill={cur.fill} grad={cur.grad} onChange={(g) => patch(cur.id, { grad: g })} tr={tr} />}
        </Block>
      )}
      {imageCorners && <Block title={tr("Bordi dell'immagine")}>{imageCorners}</Block>}
      {cur && (
        <Block title={tr("Aspetto")}>
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            {tr("Opacità")}
            <Range min={0} max={1} step={0.05} value={cur.opacity} label={tr("Opacità")} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => patch(cur.id, { opacity: v })} />
            <span className="w-10 text-right font-normal tabular-nums">{Math.round(cur.opacity * 100)}%</span>
          </label>
          {cur.type === "rect" && <Num label={tr("Angoli (mm)")} value={cur.radius} min={0} onChange={(v) => patch(cur.id, { radius: v })} />}
          {cur.type === "tiles" && <Num label={tr("Dimensione maiolica")} value={cur.k} min={0.1} step={0.1} onChange={(v) => patch(cur.id, { k: v })} />}
          {cur.type === "line" && (
            <>
              <Num label={tr("Spessore (mm)")} value={cur.thickness} min={0.1} step={0.1} onChange={(v) => patch(cur.id, { thickness: v })} />
              <Switch checked={cur.dash} onChange={(v) => patch(cur.id, { dash: v })}>{tr("Punteggiata")}</Switch>
            </>
          )}
        </Block>
      )}
    </div>
  );
  const hint = tr("Seleziona un elemento per modificarlo, oppure trascina sulla carta per selezionarne di più (Maiusc per aggiungere). Frecce per spostare (Maiusc = 5 mm).");

  // Plantillas de texto y formas de las secciones «Testo» y «Forme»
  const textPresets: { name: string; hint: string; cls: string; o: Partial<Extract<El, { type: "text" }>> }[] = [
    { name: tr("Titolo"), hint: tr("Per il nome del locale o le sezioni"), cls: "text-xl font-bold", o: { fontSize: 16, bold: true, fontFamily: "display", width: 170 } },
    { name: tr("Sottotitolo"), hint: tr("Per le categorie del menù"), cls: "text-base font-semibold", o: { fontSize: 10, bold: true, width: 170 } },
    { name: tr("Corpo"), hint: tr("Per piatti, ingredienti e prezzi"), cls: "text-sm", o: { fontSize: 6, width: 170 } },
  ];
  const kinds = (stroke: boolean) => (Object.keys(SHAPES) as ShapeKind[]).filter((k) => SHAPES[k].stroke === stroke);
  const on = (id: string) => (tool?.id === id ? " ring-2 ring-mare bg-mare/15" : ""); // la herramienta activa
  const tile = `flex flex-col items-center gap-1.5 rounded-lg bg-laguna/20 px-2 py-3 text-center glow lift hover:bg-laguna/35 ${focus}`;
  const shapes = [
    { id: "rect", name: tr("Rettangolo"), hint: tr("Un riquadro pieno, utile come sfondo"), icon: ICONS.rect },
    { id: "circle", name: tr("Cerchio"), hint: tr("Un cerchio pieno, anche per le icone"), icon: ICONS.circle },
    { id: "line", name: tr("Linea"), hint: tr("Separa le sezioni del menù"), icon: ICONS.line },
    { id: "dotted", name: tr("Punteggiata"), hint: tr("Per guidare l'occhio fino al prezzo"), icon: ICONS.dots },
  ];

  // Secciones del editor: carril de iconos en escritorio; en móvil se apilan todas en la pestaña «Strumenti»
  const sections = [
    { id: "text", label: tr("Testo"), hint: tr("Titoli e paragrafi da scrivere sulla carta"), icon: ICONS.text, body: (
      <>
        <p className="text-sm text-ink/70">{tr("Scegli uno stile, poi scrivi direttamente sulla carta.")}</p>
        {textPresets.map((p) => (
          <button key={p.name} className={`flex w-full flex-col items-start gap-0.5 rounded-lg border border-laguna bg-surface px-3 py-3 text-left glow lift hover:border-mare hover:bg-laguna/15 ${focus}`} onClick={() => { const t = newText({ ...p.o, text: tr("Testo"), width: Math.min(p.o.width ?? 100, w - 40) }); add(t); freshText.current = t.id; setTab("canvas"); setEditing(t.id); }}>
            <span className={p.cls}>{p.name}</span>
            <span className="text-xs text-ink/70">{p.hint}</span>
          </button>
        ))}
      </>
    ) },
    { id: "shapes", label: tr("Forme"), hint: tr("Rettangoli, cerchi e linee"), icon: ICONS.rect, body: (
      <>
        <p className="text-sm text-ink/70">{tr("Scegli una forma e trascina sulla carta per disegnarla. Maiusc la mantiene proporzionata.")}</p>
        <div className="grid grid-cols-2 gap-2">
          {shapes.map((s) => (
            <button key={s.id} title={s.hint} aria-pressed={tool?.id === s.id} className={`flex flex-col items-center gap-1.5 rounded-lg bg-laguna/20 px-2 py-3 text-center glow lift hover:bg-laguna/35 ${focus}${on(s.id)}`} onClick={() => pickTool(s.id)}>
              <Icon d={s.icon} className="size-7 text-mare" />
              <span className="text-[13px] font-semibold">{s.name}</span>
              <span className="text-xs leading-tight text-ink/70">{s.hint}</span>
            </button>
          ))}
          {kinds(false).map((k) => (
            <button key={k} title={tr(SHAPES[k].hint)} aria-pressed={tool?.id === k} className={`${tile}${on(k)}`} onClick={() => pickTool(k)}>
              <ShapeIcon kind={k} className="size-7 text-mare" />
              <span className="text-[13px] font-semibold">{tr(SHAPES[k].label)}</span>
              <span className="text-xs leading-tight text-ink/70">{tr(SHAPES[k].hint)}</span>
            </button>
          ))}
        </div>
      </>
    ) },
    { id: "objects", label: tr("Oggetti"), hint: tr("Icone di caffè, vino, posate e altro"), icon: SHAPES.utensils.d, body: (
      <>
        <p className="text-sm text-ink/70">{tr("Icone semplici: scegline una e trascina sulla carta per disegnarla. Poi cambia colore e misura.")}</p>
        <div className="grid grid-cols-2 gap-2">
          {kinds(true).map((k) => (
            <button key={k} title={tr(SHAPES[k].hint)} aria-pressed={tool?.id === k} className={`${tile}${on(k)}`} onClick={() => pickTool(k)}>
              <ShapeIcon kind={k} className="size-7 text-mare" />
              <span className="text-[13px] font-semibold">{tr(SHAPES[k].label)}</span>
              <span className="text-xs leading-tight text-ink/70">{tr(SHAPES[k].hint)}</span>
            </button>
          ))}
        </div>
      </>
    ) },
    { id: "images", label: tr("Immagini"), hint: tr("Foto e loghi"), icon: ICONS.image, body: (
      <>
        <p className="text-sm text-ink/70">{tr("Carica una foto o un logo, oppure cercane una sul web. Le immagini grandi vengono ridotte per entrare nel salvataggio.")}</p>
        <label className={`${primary} relative w-full cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink`}>
          <Icon d={ICONS.image} className="size-[18px]" />
          {tr("Carica un'immagine")}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => { addImage(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <hr className="border-laguna/50" />
        <h3 className="text-[13px] font-semibold">{tr("Bordi dell'immagine")}</h3>
        {imageCorners ?? <p className="text-sm text-ink/70">{tr("Seleziona un'immagine per arrotondarne gli angoli.")}</p>}
        <hr className="border-laguna/50" />
        <h3 className="text-[13px] font-semibold">{tr("Cerca sul web")}</h3>
        <ImageSearch onPick={addImage} tr={tr} lang={lang} />
      </>
    ) },
    { id: "ai", label: tr("IA"), hint: tr("Crea un modello con l'intelligenza artificiale"), icon: ICONS.sparkles, body: (
      <>
        <p className="text-sm text-ink/70">{tr("Descrivi il tuo locale e lo stile che vuoi: creo un modello come nuova pagina.")}</p>
        <div>
          <textarea
            className={`${input} h-28 resize-none`} maxLength={500} aria-label={tr("Descrizione del modello")} placeholder={tr("Es. pizzeria elegante, toni caldi")}
            value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
          />
          <p className="mt-1 text-right text-xs text-ink/60 tabular-nums">{aiPrompt.length}/500</p>
        </div>
        <Switch checked={aiUseMenu} onChange={setAiUseMenu}>{tr("Usa il nome e le sezioni del mio menù")}</Switch>
        <button type="button" className={`${primary} w-full`} disabled={aiBusy} onClick={() => createTemplate()}>
          <Icon d={ICONS.sparkles} className="size-[18px]" />
          {aiBusy ? tr("Sto creando…") : tr("Crea modello")}
        </button>
        {aiMsg && <p role="status" className="text-sm text-ink/70">{aiMsg}</p>}
        <p className="text-xs text-ink/60">{tr("Senza un menù importato uso piatti di esempio.")}</p>
      </>
    ) },
    { id: "pages", label: tr("Pagine"), hint: tr("Aggiungi, duplica e ordina le pagine"), icon: ICONS.pages, body: (
      <>
          <p className="text-sm font-semibold">{tr("Pagina")} {page + 1} {tr("di")} {hist.pages.length}</p>
          <div className="flex flex-wrap gap-1">
            <button className={iconBtn} aria-label={tr("Nuova pagina")} title={tr("Nuova pagina")} onClick={addPage}><Icon d={ICONS.plus} /></button>
            <button className={iconBtn} aria-label={tr("Duplica pagina")} title={tr("Duplica pagina")} onClick={duplicatePage}><Icon d={ICONS.copy} /></button>
            <button className={iconBtn} aria-label={tr("Sposta indietro")} title={tr("Sposta indietro")} disabled={page === 0} onClick={() => movePage(-1)}><Icon d={ICONS.left} /></button>
            <button className={iconBtn} aria-label={tr("Sposta avanti")} title={tr("Sposta avanti")} disabled={page === hist.pages.length - 1} onClick={() => movePage(1)}><Icon d={ICONS.right} /></button>
            <button className={iconBtn} aria-label={tr("Elimina pagina")} title={tr("Elimina pagina")} disabled={hist.pages.length < 2} onClick={deletePage}><Icon d={ICONS.trash} /></button>
          </div>
      </>
    ) },
    { id: "sheet", label: tr("Foglio"), hint: tr("Carta, copie e numeri di tavolo"), icon: ICONS.sheet, body: (
      <>
          <fieldset className="space-y-3">
            <legend className="mb-1.5 text-sm font-semibold">{tr("Colore della carta")}</legend>
            <ColorRow value={bg} onChange={setBg} tr={tr} label={bgGrad ? tr("Colore iniziale") : tr("Colore della carta")} />
            <GradientControls fill={bg} grad={bgGrad} onChange={setBgGrad} tr={tr} />
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">{tr("Carta")}</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PAPERS) as Paper[]).map((p) => (
                <label key={p} className={pillOpt(paper === p)}>
                  <input type="radio" name="paper" className="sr-only" checked={paper === p} onChange={() => {
                    setPaper(p);
                  }} />
                  {p} <span className="font-normal opacity-80">({PAPERS[p].w} × {PAPERS[p].h} mm)</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">{tr("Copie per foglio")}</legend>
            <div className="flex flex-wrap gap-2">
              {COPIES.map((n) => {
                const sh = sheetFor(paper, n);
                return (
                  <label key={n} className={`${pillOpt(copies === n)} ${sh ? "" : "pointer-events-none opacity-40"}`}>
                    <input type="radio" name="copies" className="sr-only" disabled={!sh} checked={copies === n} onChange={() => setCopies(n)} />
                    {n === 1 ? tr("1 copia") : `${n} ${tr("copie")}`}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-sm text-ink/65">
              {tr("Foglio:")} {sheet.name} {tr(sheet.landscape ? "orizzontale" : "verticale")} ({sheet.w} × {sheet.h} mm)
            </p>
          </fieldset>
          {hasTable && (
            <fieldset className="space-y-3">
              <legend className="mb-1.5 text-sm font-semibold">{tr("Numeri di tavolo")}</legend>
              {COPY_NAMES[copies].map((where, c) => (
                <label key={c} className="flex items-center justify-between gap-2 text-sm">
                  {tr(where)}
                  <input
                    className={`${input} w-24 text-center`} maxLength={4} inputMode="numeric" placeholder={tr("a penna")}
                    value={tables[c] ?? ""}
                    onChange={(e) => setTables((t) => Object.assign([...t], { [c]: e.target.value }))}
                  />
                </label>
              ))}
              <p className="text-sm text-ink/65">{tr("Lascia vuoto per scriverlo a penna. Sullo schermo il numero è solo un segnaposto.")}</p>
            </fieldset>
          )}
      </>
    ) },
    { id: "layers", label: tr("Livelli"), hint: tr("Ordine, visibilità e blocco degli elementi"), icon: ICONS.layers, body: (
      <>
          {sels.length === 0 && <p className="text-sm text-ink/70 lg:hidden">{hint}</p>}
          {(() => {
            // La hoja agrupa todos los elementos: al elegirla se seleccionan todos (los no bloqueados) y se mueven juntos sobre el papel
            const free = els.filter((x) => !x.locked && x.visible).map((x) => x.id);
            const on = free.length > 0 && free.every((i) => sels.includes(i));
            return (
              <button type="button" disabled={!free.length} aria-pressed={on} title={tr("Seleziona tutti gli elementi del foglio per spostarli insieme")}
                className={`glow -mx-2 mb-1.5 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold disabled:opacity-50 ${focus} ${on ? "bg-laguna/40" : ""}`}
                onClick={() => { setEditing(null); setSels(on ? [] : free); }}>
                <Icon d={ICONS.pages} className="size-4 shrink-0" />
                <span className="flex-1 truncate">{tr("Foglio")} {paper}</span>
                <span className="text-xs font-normal text-ink/55">{els.length}</span>
              </button>
            );
          })()}
          <ul className="-mx-2 ml-1 space-y-1.5 border-l border-laguna/70 pl-2">
            {(() => {
              const shown = [...els].reverse();
              const others = layerDrag ? shown.filter((x) => x.id !== layerDrag.id) : shown;
              return shown.map((e, j) => {
                const held = layerDrag?.id === e.id;
                // Las demás filas se apartan con suavidad para dejar hueco donde caerá la arrastrada; esta sigue al puntero
                const i = others.indexOf(e);
                const shift = layerDrag && !held ? (i + (i >= layerDrag.to ? 1 : 0) - j) * layerDrag.h : 0;
                return (
              <li key={e.id} data-id={e.id}
                style={held ? { transform: `translateY(${layerDrag.dy}px) scale(1.03)` } : shift ? { transform: `translateY(${shift}px)` } : undefined}
                className={`glow flex items-center gap-0.5 rounded-lg px-2 py-0.5 ${sels.includes(e.id) || held ? "bg-laguna/40" : ""} ${held ? "relative z-10 bg-surface shadow-[0_12px_28px_-10px_rgb(14_26_43/0.45)] ring-1 ring-mare/60" : "motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out"}`}>
                <button title={tr("Trascina per cambiare livello")} className={`min-w-0 flex-1 cursor-grab truncate py-1.5 text-left text-sm active:cursor-grabbing ${focus} ${e.visible ? "" : "text-ink/40 line-through"}`}
                  onPointerDown={(ev) => {
                    if (ev.button !== 0) return;
                    layerPress.current = { id: e.id, y: ev.clientY, moved: false };
                    ev.currentTarget.setPointerCapture(ev.pointerId);
                    const li = ev.currentTarget.closest("li");
                    // al pulsar, la fila ya se levanta (se ve que está cogida) aunque aún no se mueva
                    setLayerDrag({ id: e.id, to: j, dy: 0, h: (li?.offsetHeight ?? 40) + 6 });
                  }}
                  onPointerMove={(ev) => {
                    const p = layerPress.current;
                    if (!p || (!p.moved && Math.abs(ev.clientY - p.y) < 5)) return;
                    p.moved = true;
                    const ul = ev.currentTarget.closest("ul");
                    if (ul) setLayerDrag((d) => d && { ...d, to: layerTarget(ul, p.id, ev.clientY), dy: ev.clientY - p.y });
                  }}
                  onPointerUp={() => {
                    const p = layerPress.current;
                    layerPress.current = null;
                    if (p?.moved && layerDrag) { moveLayer(p.id, layerDrag.to); layerClickBlock.current = true; }
                    setLayerDrag(null);
                  }}
                  onPointerCancel={() => { layerPress.current = null; setLayerDrag(null); }}
                  onClick={(ev) => { if (layerClickBlock.current) { layerClickBlock.current = false; return; } pick(e.id, ev.shiftKey || ev.ctrlKey || ev.metaKey); }}>
                  <span aria-hidden className="mr-2 inline-grid size-5 place-items-center align-[-5px] text-ink/60">
                    {e.type === "text" ? <TextTIcon size={16} weight="bold" />
                      : e.type === "image" ? <ImageIcon size={16} weight="fill" />
                      : e.type === "line" ? <LineSegmentIcon size={16} weight="bold" />
                      : e.type === "tiles" ? <GridFourIcon size={16} weight="fill" />
                      : e.type === "shape" ? <ShapeIcon kind={e.kind} className="size-4" />
                      : <RectangleIcon size={16} weight="fill" />}
                  </span>
                  {label(e, tr)}
                  {e.group && <span className="ml-1 text-xs text-ink/45">{tr("gruppo")}</span>}
                </button>
                <button title={tr("Porta su")} aria-label={tr("Porta su")} className="grid size-8 place-items-center rounded-md text-ink/60 hover:bg-laguna/30 hover:text-ink" onClick={() => move(e.id, 1)}><Icon d={ICONS.up} className="size-4" /></button>
                <button title={tr("Porta giù")} aria-label={tr("Porta giù")} className="grid size-8 place-items-center rounded-md text-ink/60 hover:bg-laguna/30 hover:text-ink" onClick={() => move(e.id, -1)}><Icon d={ICONS.down} className="size-4" /></button>
                <button title={tr("Mostra o nascondi")} aria-label={tr("Mostra o nascondi")} aria-pressed={!e.visible} className="grid size-8 place-items-center rounded-md text-ink/60 hover:bg-laguna/30 hover:text-ink" onClick={() => patch(e.id, { visible: !e.visible })}><Icon d={e.visible ? ICONS.eye : ICONS.eyeOff} className="size-4" /></button>
                <button title={tr("Blocca o sblocca")} aria-label={tr("Blocca o sblocca")} aria-pressed={e.locked} className="grid size-8 place-items-center rounded-md text-ink/60 hover:bg-laguna/30 hover:text-ink" onClick={() => patch(e.id, { locked: !e.locked })}><Icon d={e.locked ? ICONS.lock : ICONS.unlock} className="size-4" /></button>
              </li>
                );
              });
            })()}
          </ul>
      </>
    ) },
    { id: "archive", label: tr("File"), hint: tr("Importa, esporta e salva i design"), icon: ICONS.archive, body: (
      <>
          <button className={`${primary} w-full`} disabled={busy} onClick={importMenu}>
            <Icon d={ICONS.edit} className="size-[18px]" />
            {tr("Importa il menù attuale")}
          </button>
          <label className={`${secondary} w-full justify-center has-[:disabled]:pointer-events-none has-[:disabled]:opacity-40`}>
            <input type="file" accept="application/pdf" className="sr-only" disabled={busy} onChange={(e) => { importPdf(e.target.files?.[0]); e.target.value = ""; }} />
            <Icon d={ICONS.pages} className="size-[18px]" />
            {pdfBusy ? tr("Leggo il PDF…") : tr("Importa PDF")}
          </label>
          {importMsg && <p role="status" className="text-sm text-ink/65">{importMsg}</p>}
          <div className="flex flex-wrap gap-2">
            <button className={secondary} disabled={busy} onClick={exportPdf}><Icon d={ICONS.download} className="size-4" />PDF</button>
            <button className={secondary} disabled={busy} onClick={exportPng}><Icon d={ICONS.download} className="size-4" />PNG</button>
            <button className={secondary} disabled={busy} onClick={print}><Icon d={ICONS.print} className="size-4" />{tr("Stampa")}</button>
            <button className={secondary} onClick={() => { if (confirm(tr("Cancellare tutto e ricominciare?"))) { setPages(() => [starter()]); setBg(PAPER_WHITE); setBgGrad(undefined); goPage(0); } }}><Icon d={ICONS.reset} className="size-4" />{tr("Nuovo")}</button>
          </div>
          {exportError && <p role="alert" className="rounded-lg bg-sabbia px-3 py-2 text-sm font-semibold">{exportError}</p>}
          {saveError && <p role="alert" className="rounded-lg bg-sabbia px-3 py-2 text-sm font-semibold">{tr("Non c'è spazio per salvare: ci sono troppe immagini. Il lavoro non verrà ripristinato se ricarichi.")}</p>}
        <hr className="border-laguna/50" />
          <div className="flex gap-2">
            <input
              aria-label={tr("Nome del design")} className={input} placeholder={tr("Nome del design")} value={designName}
              onChange={(e) => setDesignName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveDesign()}
            />
            <button className={secondary} onClick={saveDesign}><Icon d={ICONS.save} className="size-4" />{tr("Salva")}</button>
          </div>
          {archiveMsg && <p role="status" className="text-sm text-ink/65">{archiveMsg}</p>}
          <ul className="space-y-2">
            {saved.map((d) => (
              <li key={d.id} className="glow flex items-center gap-2 rounded-lg bg-surface px-3 py-2 ring-1 ring-laguna/60">
                <button className={`min-w-0 flex-1 text-left ${focus}`} onClick={() => openDesign(d)} title={`${tr("Apri")} «${d.name}»`}>
                  <p className="truncate text-sm font-semibold">{d.name}</p>
                  <p className="text-xs text-ink/55">
                    {d.doc.paper} · {d.doc.pages.length} {tr(d.doc.pages.length === 1 ? "pagina" : "pagine")} · {new Date(d.savedAt).toLocaleDateString(lang === "es" ? "es-ES" : "it-IT", { day: "numeric", month: "short" })}
                  </p>
                </button>
                <button aria-label={`${tr("Elimina")} ${d.name}`} title={tr("Elimina")} className={iconBtn} onClick={() => removeDesign(d)}><Icon d={ICONS.trash} className="size-4" /></button>
              </li>
            ))}
          </ul>
      </>
    ) },
  ];
  const active = sections.find((s) => s.id === panel) ?? sections[0];
  const editEl = els.find((x): x is Extract<El, { type: "text" }> => x.id === editing && x.type === "text");

  return (
    <>
    {/* Medidas explícitas: los nombres A2 y A1 no son tamaños de página válidos en CSS */}
    <style>{`@page { size: ${sheet.w}mm ${sheet.h}mm; margin: 0; }`}</style>
    <div ref={rootRef} className="flex h-dvh flex-col bg-app text-ink print:hidden">
      <header className="shrink-0 border-b border-laguna/60 bg-app pt-[env(safe-area-inset-top)]">
        <div className="flex h-16 items-center gap-2 px-3 pt-2 md:h-20 md:gap-3 md:px-4">
          <Tip label={tr("Torna al menù")} hint={tr("Esci dall'editor libero. Le modifiche sono già salvate.")}>
            <Link href="/" className={`inline-flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold hover:bg-laguna/30 md:h-9 ${focus}`}>
              <Icon d={ICONS.left} className="size-[18px]" />
              {tr("Menù")}
            </Link>
          </Tip>
          <Link href="/" aria-label="Menudo" className={`hidden shrink-0 rounded-md sm:block ${focus}`}>
            <Brand />
          </Link>
          {textBar || (
            <p className="min-w-0 flex-1 truncate text-xs text-ink/70" aria-live="polite">
              {tr("Editor libero · Le modifiche si salvano da sole")}
            </p>
          )}
          <Tip label={tr("Annulla")} hint="Ctrl+Z">
            <button className={iconBtn} aria-label={tr("Annulla")} disabled={!hist.past.length} onClick={undo}>
              <Icon d={ICONS.undo} className="size-[18px]" />
            </button>
          </Tip>
          <Tip label={tr("Ripeti")} hint={tr("Ctrl+Maiusc+Z")}>
            <button className={iconBtn} aria-label={tr("Ripeti")} disabled={!hist.future.length} onClick={redo}>
              <Icon d={ICONS.redo} className="size-[18px]" />
            </button>
          </Tip>
          <div role="group" aria-label={tr("Lingua")} className="flex shrink-0 rounded-lg bg-laguna/25 p-0.5">
            {(["it", "es"] as const).map((l) => (
              <button key={l} lang={l} aria-label={l === "it" ? "Italiano" : "Español"} aria-pressed={lang === l} title={l === "it" ? "Italiano" : "Español"} onClick={() => changeLang(l)}
                className={`h-10 min-w-9 rounded-md px-2 text-xs font-semibold md:h-8 ${focus} ${lang === l ? "bg-surface shadow-sm" : "text-ink/70 hover:text-ink"}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <Tip label={dark ? tr("Tema chiaro") : tr("Tema scuro")} hint={tr("Cambia l'aspetto dell'editor")}>
            <button className={iconBtn} aria-label={dark ? tr("Tema chiaro") : tr("Tema scuro")} onClick={toggleTheme}>
              <Icon d={dark ? ICONS.sun : ICONS.moon} className="size-[18px]" />
            </button>
          </Tip>
          <button
            className={`hidden h-9 shrink-0 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white lift hover:brightness-110 disabled:opacity-50 md:inline-flex ${focus}`}
            title={tr("Stampa")} disabled={busy} onClick={print}
          >
            <Icon d={ICONS.print} className="size-[18px]" />
            {!textBar && tr("Stampa")}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
      {/* Escritorio: carril de iconos y una sección cada vez, como en Canva */}
      <div className="hidden md:flex">
        <nav aria-label={tr("Sezioni")} className="flex w-[76px] shrink-0 flex-col items-center overflow-x-hidden overflow-y-auto border-r border-laguna/60 bg-app py-4">
          <div className="my-auto flex flex-col items-center gap-5">
            {sections.map((s, i) => (
              <Fragment key={s.id}>
                {i === 5 && <hr className="w-9 border-laguna/60" />}
                <Tip side="right" label={s.label} hint={s.hint}>
                  <button aria-label={s.label} aria-pressed={panel === s.id} onClick={() => setPanel(s.id)}
                    className={`glow grid size-12 place-items-center rounded-full transition-all ${focus} ${panel === s.id ? "bg-brand text-white shadow-md" : "text-ink/65 hover:bg-laguna/30 hover:text-ink"}`}>
                    {(() => { const R = RAIL_ICONS[s.id]; return <R size={26} weight="fill" aria-hidden />; })()}
                  </button>
                </Tip>
              </Fragment>
            ))}
          </div>
        </nav>
        <aside aria-label={active.label} className="w-[248px] shrink-0 overflow-y-auto border-r border-laguna/60 bg-app lg:w-[264px]">
          <div className="border-b border-laguna/50 px-5 pt-5 pb-4">
            <h2 className="font-display text-[17px] font-semibold">{active.label}</h2>
            <p className="mt-1 text-xs leading-snug text-ink/70">{active.hint}</p>
          </div>
          <form className="space-y-5 px-5 py-5" onSubmit={(e) => e.preventDefault()}>{active.body}</form>
          <div className="border-t border-laguna/50 lg:hidden">{properties}</div>
        </aside>
      </div>
      {/* Móvil: pestaña «Strumenti» con todas las secciones apiladas */}
      <aside aria-label={tr("Strumenti")} className={`${tab === "tools" ? "block" : "hidden"} w-full shrink-0 overflow-y-auto bg-surface pb-24 md:hidden`}>
        {sections.map((s) => (
          <Fragment key={s.id}>
            <Group title={s.label} icon={s.icon} open={s.id === "text"}><form className="space-y-5" onSubmit={(e) => e.preventDefault()}>{s.body}</form></Group>
            {s.id === "images" && properties}
          </Fragment>
        ))}
      </aside>

      <main ref={wrap} style={{ backgroundColor: "#ffffff" }} className={`${tab === "canvas" ? "block" : "hidden"} canvas min-w-0 flex-1 overflow-auto px-4 pb-40 md:block md:px-6 md:pb-6`}>
        {/* sticky dentro de la zona que se desplaza (no fixed): las bolas quedan dentro de su caja, como en el editor principal */}
        <div className="pointer-events-none sticky top-1/2 z-20 -mb-5 h-0">
          <div role="group" aria-label={`Zoom ${pct}%`} className="pointer-events-auto absolute right-0 flex -translate-y-1/2 flex-col gap-2">
            <button className={ball} aria-label={tr("Ingrandisci")} title={`${tr("Ingrandisci")} · ${pct}%`} disabled={mul >= maxMul} onClick={() => zoomBy(1.25)}><Icon d={ICONS.zoomIn} /></button>
            <button className={`${ball} text-xs font-semibold tabular-nums`} aria-label={tr("Adatta alla pagina")} title={tr("Adatta alla pagina")} onClick={() => setMul(1)}>{pct}%</button>
            <button className={ball} aria-label={tr("Riduci")} title={`${tr("Riduci")} · ${pct}%`} disabled={mul <= 0.5} onClick={() => zoomBy(1 / 1.25)}><Icon d={ICONS.zoomOut} /></button>
          </div>
        </div>
        {hist.pages.length > 1 && (
                      <div role="tablist" aria-label={tr("Pagine")} className="mt-5 flex flex-wrap justify-center gap-1.5 pt-3">
              {hist.pages.map((_, i) => (
                <button key={i} role="tab" aria-selected={i === page} className={`grid size-9 place-items-center rounded-full text-sm font-semibold shadow-[0_8px_24px_-8px_rgb(14_26_43/0.45)] ring-1 ring-laguna/60 lift ${focus} ${i === page ? "bg-brand text-white" : "bg-surface"}`} onClick={() => goPage(i)}>{i + 1}</button>
              ))}
            </div>
        )}
        {tool && (
          <div className="pointer-events-none sticky top-3 z-30 flex h-0 justify-center">
            <span className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-surface shadow-lg">{tr("Trascina sulla carta per disegnare · Esc annulla")}</span>
          </div>
        )}
        {/* m-auto centra la hoja cuando cabe y deja desplazarse cuando es mayor que el área (justify-center la cortaría) */}
        <div className={`flex py-4 md:py-6 ${hist.pages.length > 1 ? "min-h-[calc(100%-3rem)]" : "min-h-full"}`}>
        <div className="relative m-auto h-fit shrink-0 shadow-[var(--sheet-shadow)]" style={tool ? { cursor: "crosshair", touchAction: "none" } : undefined}>
          <Stage
            ref={stageRef}
            width={w * zoom}
            height={h * zoom}
            scaleX={zoom}
            scaleY={zoom}
            onMouseDown={(e) => {
              if (tool) {
                if (e.evt.button === 0) startDraw(...Object.values(toMm(e.target.getStage()!)) as [number, number], e.evt.shiftKey);
                return;
              }
              if (!emptyHit(e)) return;
              const add = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
              const p = toMm(e.target.getStage()!);
              marqueeFrom.current = { ...p, add };
              setMarquee({ ...p, w: 0, h: 0 });
              if (!add) setSels([]);
            }}
            onMouseMove={(e) => {
              if (tool) {
                const p = toMm(e.target.getStage()!);
                moveDraw(p.x, p.y, e.evt.shiftKey);
                return;
              }
              const from = marqueeFrom.current;
              if (!from) return;
              const p = toMm(e.target.getStage()!);
              setMarquee({ x: Math.min(from.x, p.x), y: Math.min(from.y, p.y), w: Math.abs(p.x - from.x), h: Math.abs(p.y - from.y) });
            }}
            onMouseUp={endMarquee}
            onMouseLeave={endMarquee}
            onTouchStart={(e) => {
              if (tool) {
                const p = toMm(e.target.getStage()!);
                startDraw(p.x, p.y, false);
                return;
              }
              if (emptyHit(e) && !multi) setSels([]);
            }}
            onTouchMove={(e) => {
              if (!tool) return;
              const p = toMm(e.target.getStage()!);
              moveDraw(p.x, p.y, false);
            }}
          >
            <Layer ref={layerRef}>
              <Rect name="paper" width={w} height={h} {...fillGrad(dark && !bgGrad && bg.toLowerCase() === PAPER_WHITE ? DARK_PAPER : bg, bgGrad, w, h)} />
              {(draftEl ? [...els, draftEl] : els).map((el) => {
                const props = {
                  id: el.id,
                  x: el.x,
                  y: el.y,
                  width: el.width,
                  height: el.height,
                  rotation: el.rotation,
                  opacity: el.opacity,
                  visible: el.visible,
                  draggable: !el.locked && !tool,
                  listening: !el.locked && !tool,
                  // Se selecciona al pulsar (no al soltar) para poder arrastrar directamente
                  onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
                    const add = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
                    if (add || !sels.includes(el.id)) pick(el.id, add);
                  },
                  // Táctil: con «Multi» activo, tocar suma al conjunto; tocar uno ya elegido (sin arrastrar) lo quita
                  onTouchStart: () => {
                    addedOnTouch.current = false;
                    if (!sels.includes(el.id)) {
                      pick(el.id, multi);
                      addedOnTouch.current = true;
                    }
                  },
                  onTap: () => {
                    if (multi && !addedOnTouch.current && sels.includes(el.id) && sels.length > 1) pick(el.id, true);
                  },
                  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
                    if (sels.length <= 1) snap(e, el.id); // con varios, el transformador mueve el resto por su cuenta
                  },
                  onDragEnd: () => {
                    setGuides({ v: [], h: [] });
                    commit();
                  },
                  onTransformEnd: commit,
                };
                if (el.type === "text")
                  return (
                    <Text key={el.id} {...props} onTransform={textLive} visible={el.visible && editing !== el.id} onDblClick={() => setEditing(el.id)} onDblTap={() => setEditing(el.id)} name={el.table ? "table-number" : undefined} height={undefined} text={el.text} fontSize={el.fontSize} {...fillGrad(el.fill, el.grad, el.width, el.fontSize * (el.lineHeight ?? 1.2) * Math.max(1, el.text.split("\n").length))} fontFamily={fontFamily(el.fontFamily)} align={el.align}
                      fontStyle={fontStyleOf(el)} textDecoration={el.underline ? "underline" : ""} lineHeight={el.lineHeight ?? 1.2} />
                  );
                if (el.type === "rect") return <Rect key={el.id} {...props} {...(el.hollow ? { fill: "transparent", ...strokeGrad(el.fill, el.grad, el.width, el.height), strokeWidth: el.borderW ?? 1 } : { ...fillGrad(el.fill, el.grad, el.width, el.height), stroke: el.stroke, strokeWidth: el.strokeW })} cornerRadius={el.radius} />;
                if (el.type === "tiles") return <TilesNode key={el.id} el={el} {...props} />;
                if (el.type === "line")
                  return <Line key={el.id} {...props} points={[0, 0, el.width, 0]} {...strokeGrad(el.fill, el.grad, el.width, el.thickness, -el.thickness / 2)} strokeWidth={el.thickness} lineCap="round" dash={el.dash ? [0.01, el.thickness * 2] : undefined} hitStrokeWidth={4} />;
                if (el.type === "shape") return <ShapeNode key={el.id} el={el} {...props} />;
                return <ImageNode key={el.id} el={el} {...props} />;
              })}
              {guides.v.map((x) => <Line key={"v" + x} points={[x, 0, x, h]} stroke={PALETTE[1].hex} strokeWidth={1.2 / zoom} dash={[4 / zoom, 3 / zoom]} listening={false} />)}
              {guides.h.map((y) => <Line key={"h" + y} points={[0, y, w, y]} stroke={PALETTE[1].hex} strokeWidth={1.2 / zoom} dash={[4 / zoom, 3 / zoom]} listening={false} />)}
              {marquee && <Rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill={PALETTE[1].hex} opacity={0.18} stroke={PALETTE[1].hex} strokeWidth={1 / zoom} listening={false} />}
              <Transformer ref={trRef} onDblClick={(e) => e.target.hasName("_anchor") && fitTexts()} onDblTap={(e) => e.target.hasName("_anchor") && fitTexts()} shouldOverdrawWholeArea borderStroke={PALETTE[1].hex} anchorStroke={PALETTE[1].hex} anchorFill="#fff" anchorSize={coarse ? 26 : 10} anchorCornerRadius={coarse ? 13 : 0} rotateAnchorOffset={coarse ? 40 : 50} rotateEnabled keepRatio={false} enabledAnchors={onlyLines ? ["middle-left", "middle-right"] : ALL_ANCHORS} boundBoxFunc={(o, n) => (n.width < 5 || (!onlyLines && n.height < 5) ? o : n)} />
            </Layer>
          </Stage>
          {editEl && (
            <textarea
              aria-label={tr("Testo")} autoFocus rows={1} value={editEl.text}
              onFocus={(e) => {
                const t = e.currentTarget;
                if (freshText.current === editEl.id) t.select();
                else t.setSelectionRange(t.value.length, t.value.length);
              }}
              ref={(t) => { if (t) { t.style.height = "auto"; t.style.height = `${t.scrollHeight}px`; } }}
              onChange={(e) => patch(editEl.id, { text: e.target.value })}
              onBlur={() => {
                if (!editEl.text.trim()) { setEls((a) => a.filter((x) => x.id !== editEl.id)); setSels([]); } // un testo vuoto non resta sulla carta
                freshText.current = null;
                setEditing(null);
              }}
              onKeyDown={(e) => { if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); e.currentTarget.blur(); } }}
              style={{
                left: editEl.x * zoom, top: editEl.y * zoom, width: editEl.width * zoom, fontSize: editEl.fontSize * zoom, lineHeight: editEl.lineHeight ?? 1.2,
                fontFamily: fontFamily(editEl.fontFamily), fontWeight: editEl.bold ? 700 : 400, fontStyle: editEl.italic ? "italic" : "normal", textDecoration: editEl.underline ? "underline" : "none",
                textAlign: editEl.align, color: editEl.fill, opacity: editEl.opacity, transform: `rotate(${editEl.rotation}deg)`, transformOrigin: "0 0",
              }}
              className="absolute z-10 m-0 block resize-none overflow-hidden border-0 bg-transparent p-0 outline-2 outline-offset-2 outline-mare"
            />
          )}
        </div>
        </div>
      </main>
      <aside aria-label={tr("Proprietà")} className="hidden w-[280px] shrink-0 overflow-y-auto border-l border-laguna/60 bg-app lg:block">
        {properties}
        {sels.length === 0 && <p className="p-4 text-sm text-ink/70">{hint}</p>}
      </aside>
      </div>

      {/* Móvil: acciones de la selección y barra de pestañas, en la zona del pulgar */}
      {tab === "canvas" && sels.length > 0 && (
        <div className="fixed inset-x-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] flex flex-wrap justify-center gap-2 rounded-2xl bg-surface/95 p-2 shadow-lg ring-1 ring-laguna/60 backdrop-blur md:hidden">
          <button className={secondary} onClick={duplicateSel}><Icon d={ICONS.copy} className="size-4" />{tr("Duplica")}</button>
          {sels.length > 1 && <button className={secondary} onClick={group}><Icon d={ICONS.group} className="size-4" />{tr("Raggruppa")}</button>}
          {selEls.some((x) => x.group) && <button className={secondary} onClick={ungroup}><Icon d={ICONS.ungroup} className="size-4" />{tr("Separa")}</button>}
          <button className={secondary} onClick={removeSel}><Icon d={ICONS.trash} className="size-4" />{tr("Elimina")}</button>
        </div>
      )}
      <nav aria-label={tr("Sezioni")} className="fixed inset-x-0 bottom-0 grid grid-cols-5 border-t border-laguna/60 bg-surface/95 px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        {([["canvas", tr("Carta", "tab"), ICONS.canvas], ["tools", tr("Strumenti"), ICONS.tools]] as const).map(([id, t, icon]) => (
          <button key={id} aria-current={tab === id ? "page" : undefined} className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-xs ${focus} ${tab === id ? "font-semibold" : "text-ink/65"}`} onClick={() => setTab(id)}>
            <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${tab === id ? "bg-laguna/50" : ""}`}><Icon d={icon} /></span>
            {t}
          </button>
        ))}
        <button className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-xs text-ink/65 disabled:opacity-40 ${focus}`} disabled={!hist.past.length} onClick={undo}>
          <span className="grid h-7 w-12 place-items-center rounded-full"><Icon d={ICONS.undo} /></span>
          {tr("Annulla")}
        </button>
        <button aria-pressed={multi} className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-xs ${focus} ${multi ? "font-semibold" : "text-ink/65"}`} onClick={() => setMulti((v) => !v)}>
          <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${multi ? "bg-laguna/50" : ""}`}><Icon d={ICONS.select} /></span>
          {tr("Multi")}
        </button>
        <button className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-xs font-semibold disabled:opacity-50 ${focus}`} disabled={busy} onClick={print}>
          <span className="grid h-7 w-12 place-items-center rounded-full bg-brand text-white"><Icon d={ICONS.print} /></span>
          {tr("Stampa")}
        </button>
      </nav>
    </div>
    {/* Solo al imprimir: la hoja renderizada a alta resolución, a tamaño real */}
    <div className="hidden print:block">
      {printSrcs.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- data URL local, no hay nada que optimizar
        <img key={i} src={src} alt="" className={i < printSrcs.length - 1 ? "break-after-page" : ""} style={{ width: `${sheet.w}mm`, height: `${sheet.h}mm`, display: "block" }} />
      ))}
    </div>
    </>
  );
}
