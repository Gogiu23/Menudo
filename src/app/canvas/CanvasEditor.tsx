"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { flushSync } from "react-dom";
import { Image as KImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";

/* Fase 1: lienzo con papel A2–A5, elementos básicos y transformador.
   Fase 2: panel de propiedades completo y panel de capas (orden, ocultar, bloquear, duplicar).
   Todas las medidas del modelo están en mm; el Stage se escala para mostrarlas. */

import { common, Copies, COPIES, COPY_NAMES, El, FONTS, FontKey, fontFamily, fontStyleOf, newText, PALETTE, PAPERS, Paper, sheetFor, tilePattern, tileScale, uid } from "./model";
import { designs, type Design } from "./archive";
import { menuToPages, readSavedMenu } from "./menuTemplate";
import { Brand, chip, chipOn, focus, Group, Icon, ICONS, iconBtn, input, Num, primary, secondary } from "./ui";
import { Tip } from "./Tip";

const label = (e: El) =>
  e.type === "text" ? e.text.split("\n")[0].slice(0, 24) || "Testo" : { rect: "Rettangolo", image: "Immagine", tiles: "Maioliche", line: "Linea" }[e.type];

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
  return <KImage image={img} {...rest} />;
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
const MAX_HISTORY = 100;
const THEME_KEY = "menudo:theme"; // el mismo que el editor principal
type History = { past: El[][][]; pages: El[][]; future: El[][][] }; // cada paso del historial guarda todas las páginas
const starter = (): El[] => [newText({ y: 20, width: 170, height: 20, text: "Menù", fontSize: 14, fontFamily: "display" })];

function load(): { paper: Paper; copies: Copies; pages: El[][]; tables: string[] } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    const copies = COPIES.includes(raw?.copies) ? raw.copies : 1;
    const tables: string[] = Array.isArray(raw?.tables) ? raw.tables.map((x: unknown) => (x == null ? "" : String(x))) : [];
    if (raw && raw.paper in PAPERS) {
      if (Array.isArray(raw.pages) && raw.pages.length && raw.pages.every(Array.isArray)) return { paper: raw.paper, copies, pages: raw.pages, tables };
      if (Array.isArray(raw.els)) return { paper: raw.paper, copies, pages: [raw.els], tables }; // formato de las fases 3-10: una sola página
    }
  } catch {}
  return { paper: "A4", copies: 1, pages: [starter()], tables: [] };
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

export default function CanvasEditor() {
  const [init] = useState(load);
  const [paper, setPaper] = useState<Paper>(init.paper);
  const [wanted, setCopies] = useState<Copies>(init.copies);
  const [tables, setTables] = useState<string[]>(init.tables); // número de mesa de cada copia
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
    lastKey.current = "";
    setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), pages: h.past[h.past.length - 1], future: [h.pages, ...h.future] } : h));
  };
  const redo = () => {
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
  const [tab, setTab] = useState<"canvas" | "tools">("canvas"); // solo en móvil; en escritorio se ven las dos
  const [multi, setMulti] = useState(false); // modo táctil: tocar suma elementos a la selección
  const addedOnTouch = useRef(false);
  const [coarse] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeFrom = useRef<{ x: number; y: number; add: boolean } | null>(null);
  const [fit, setFit] = useState(2); // px por mm que hacen caber la hoja en el ancho
  const [mul, setMul] = useState(1); // zoom del usuario sobre ese ajuste
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
    const ro = new ResizeObserver(([e]) => setFit(Math.max(0.3, (e.contentRect.width - 32) / w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);

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
    setMul((v) => Math.min(maxMul, Math.max(0.5, v * f)));
  };

  // El transformador sigue a los elementos seleccionados (los bloqueados quedan fuera)
  useEffect(() => {
    const nodes = sels.flatMap((id) => {
      const el = els.find((x) => x.id === id);
      const n = el && !el.locked && el.visible ? layerRef.current?.findOne("#" + id) : undefined;
      return n ? [n] : [];
    });
    trRef.current?.nodes(nodes);
    trRef.current?.getLayer()?.batchDraw();
  }, [sels, els]);

  // Guarda sola, un momento después del último cambio
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ paper, copies, pages: hist.pages, tables }));
        setSaveError(false);
      } catch {
        setSaveError(true); // normalmente: demasiadas imágenes para el límite del navegador
      }
    }, 400);
    return () => clearTimeout(t);
  }, [paper, copies, hist.pages, tables]);

  // `merge`: ediciones desde el panel (escribir, deslizadores) que deben deshacerse de una vez
  const patch = (id: string, p: Partial<El>, merge = true) =>
    setEls((a) => a.map((x) => (x.id === id ? ({ ...x, ...p } as El) : x)), merge ? `patch:${id}:${Object.keys(p).join()}` : undefined);
  const add = (e: El) => {
    setEls((a) => [...a, e]);
    setSel(e.id);
  };
  const cur = els.find((x) => x.id === sel);

  const selEls = els.filter((x) => sels.includes(x.id));

  // Clic en un elemento: se selecciona él y los de su grupo; con Maiusc/Ctrl se suma o se quita
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
    tr.visible(false);
    try {
      return { url: stage.toDataURL({ pixelRatio: (targetW * k) / (w * zoom), mimeType: "image/png" }), dpi: Math.round(DPI * k) };
    } finally {
      tr.visible(true);
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
      setExportError("Non sono riuscito a completare l'operazione. Prova con una carta più piccola o meno immagini.");
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
    designs.list().then(setSaved, () => setArchiveMsg("L'archivio non è disponibile su questo browser."));
  }, []);
  const refreshSaved = () => designs.list().then(setSaved);
  const saveDesign = async () => {
    const name = designName.trim() || "Senza nome";
    try {
      const same = saved.find((d) => d.name.toLowerCase() === name.toLowerCase());
      if (same && !confirm(`Esiste già «${same.name}». Sostituirlo?`)) return;
      await designs.save({ id: same?.id ?? uid(), name, savedAt: Date.now(), doc: { paper, copies, pages: hist.pages, tables } });
      setDesignName("");
      setArchiveMsg(`Salvato «${name}».`);
      await refreshSaved();
    } catch {
      setArchiveMsg("Non sono riuscito a salvare: forse manca spazio sul dispositivo.");
    }
  };
  const openDesign = (d: Design) => {
    if (!confirm(`Aprire «${d.name}»? Il lavoro attuale non salvato andrà perso.`)) return;
    setPaper(d.doc.paper);
    setCopies(COPIES.includes(d.doc.copies) ? d.doc.copies : 1);
    setTables(d.doc.tables ?? []);
    setPages(() => d.doc.pages);
    goPage(0);
    setMul(1);
    setArchiveMsg(`Aperto «${d.name}».`);
  };
  const removeDesign = async (d: Design) => {
    if (!confirm(`Eliminare «${d.name}» dall'archivio?`)) return;
    await designs.remove(d.id).catch(() => setArchiveMsg("Non sono riuscito a eliminarlo."));
    await refreshSaved();
  };

  // Rehace el lienzo a partir de la carta del editor principal; Annulla lo deshace
  const importMenu = () =>
    run(async () => {
      setImportMsg("");
      const menu = readSavedMenu();
      if (!menu) return setImportMsg("Nessun menù trovato: crealo prima nell'editor principale.");
      const pages = await menuToPages(menu, paper);
      setPages(() => pages);
      setTables(menu.tableNumbers.map(String).slice(0, 4));
      goPage(pages.length - 1); // la página del menú; la copertina es la anterior
      setImportMsg(pages.length > 1 ? "Menù importato, con la copertina." : "Menù importato.");
    });
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
      if (e.key === "Escape") setSels([]);
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
      if (sx !== 1 || sy !== 1) {
        u.width = Math.max(1, n.width() * sx);
        if (el.type === "text") (u as Partial<typeof el>).fontSize = Math.max(2, el.fontSize * sy);
        else if (el.type !== "line") u.height = Math.max(0.1, n.height() * sy);
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
  const properties = sels.length > 0 && (
          <Group title={sels.length === 1 ? "Elemento" : `${sels.length} elementi`} icon={ICONS.design} open>
            <div className="flex flex-wrap gap-1.5">
              {([["l", "Sx", "a sinistra"], ["c", "Ct", "al centro"], ["r", "Dx", "a destra"], ["t", "Alto", "in alto"], ["m", "Mezzo", "al centro in verticale"], ["b", "Basso", "in basso"]] as const).map(([m, t, d]) => (
                <button key={m} title={`Allinea ${d}`} aria-label={`Allinea ${d}`} className={small} onClick={() => align(m)}>{t}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {sels.length > 1 && <button className={secondary} onClick={group} title="Ctrl+G"><Icon d={ICONS.group} className="size-4" />Raggruppa</button>}
              {selEls.some((x) => x.group) && <button className={secondary} onClick={ungroup} title="Ctrl+Maiusc+G"><Icon d={ICONS.ungroup} className="size-4" />Separa</button>}
              <button className={secondary} onClick={duplicateSel} title="Ctrl+D"><Icon d={ICONS.copy} className="size-4" />Duplica</button>
              <button className={secondary} onClick={removeSel}><Icon d={ICONS.trash} className="size-4" />Elimina</button>
            </div>
            {cur && (
              <div className="space-y-3">
                {cur.type === "text" && (
                  <>
                    <textarea className={input} rows={3} value={cur.text} onChange={(e) => patch(cur.id, { text: e.target.value })} />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="size-4 accent-mare" checked={!!cur.table} onChange={(e) => patch(cur.id, { table: e.target.checked })} />
                      Numero di tavolo (diverso per ogni copia)
                    </label>
                    <select className={input} aria-label="Carattere" value={cur.fontFamily} onChange={(e) => patch(cur.id, { fontFamily: e.target.value as FontKey })}>
                      {FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button aria-pressed={cur.bold} className={`${iconBtn} font-bold ${cur.bold ? "bg-laguna/40 text-ink" : ""}`} aria-label="Grassetto" onClick={() => patch(cur.id, { bold: !cur.bold })}>B</button>
                      <button aria-pressed={cur.italic} className={`${iconBtn} italic ${cur.italic ? "bg-laguna/40 text-ink" : ""}`} aria-label="Corsivo" onClick={() => patch(cur.id, { italic: !cur.italic })}>I</button>
                      {(["left", "center", "right"] as const).map((al) => (
                        <button key={al} aria-pressed={cur.align === al} className={`${iconBtn} ${cur.align === al ? "bg-laguna/40 text-ink" : ""}`} aria-label={`Allinea testo ${al === "left" ? "a sinistra" : al === "center" ? "al centro" : "a destra"}`} onClick={() => patch(cur.id, { align: al })}>
                          <Icon d={al === "left" ? ICONS.alignLeft : al === "center" ? ICONS.alignCenter : ICONS.alignRight} className="size-[18px]" />
                        </button>
                      ))}
                    </div>
                    <Num label="Dimensione (mm)" value={cur.fontSize} min={2} onChange={(v) => patch(cur.id, { fontSize: v })} />
                    <Num label="Interlinea" value={cur.lineHeight ?? 1.2} min={0.5} onChange={(v) => patch(cur.id, { lineHeight: v })} />
                  </>
                )}
                {cur.type === "tiles" && <Num label="Dimensione maiolica" value={cur.k} min={0.1} onChange={(v) => patch(cur.id, { k: v })} />}
                {cur.type === "line" && (
                  <>
                    <Num label="Spessore (mm)" value={cur.thickness} min={0.1} onChange={(v) => patch(cur.id, { thickness: v })} />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="size-4 accent-mare" checked={cur.dash} onChange={(e) => patch(cur.id, { dash: e.target.checked })} />
                      Punteggiata
                    </label>
                  </>
                )}
                {cur.type === "rect" && <Num label="Angoli (mm)" value={cur.radius} min={0} onChange={(v) => patch(cur.id, { radius: v })} />}
                {cur.type !== "image" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-sm font-semibold">Colore</span>
                    {PALETTE.map((c) => (
                      <button key={c.hex} title={c.name} aria-label={c.name} aria-pressed={cur.fill.toLowerCase() === c.hex.toLowerCase()}
                        className={`size-7 rounded-full ring-1 ring-laguna ring-offset-2 ring-offset-surface aria-pressed:ring-2 aria-pressed:ring-mare ${focus}`}
                        style={{ background: c.hex }} onClick={() => patch(cur.id, { fill: c.hex })} />
                    ))}
                    <input type="color" aria-label="Altro colore" className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0" value={cur.fill} onChange={(e) => patch(cur.id, { fill: e.target.value })} />
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm font-semibold">
                  Opacità
                  <input type="range" className="flex-1 accent-mare" min={0} max={1} step={0.05} value={cur.opacity} onChange={(e) => patch(cur.id, { opacity: Number(e.target.value) })} />
                  <span className="w-10 text-right font-normal tabular-nums">{Math.round(cur.opacity * 100)}%</span>
                </label>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <Num label="X" value={cur.x} onChange={(v) => patch(cur.id, { x: v })} />
                  <Num label="Y" value={cur.y} onChange={(v) => patch(cur.id, { y: v })} />
                  <Num label="L" value={cur.width} min={1} onChange={(v) => patch(cur.id, { width: v })} />
                  {cur.type !== "text" && <Num label="A" value={cur.height} min={1} onChange={(v) => patch(cur.id, { height: v })} />}
                  <Num label="Rot°" value={cur.rotation} onChange={(v) => patch(cur.id, { rotation: v })} />
                </div>
              </div>
            )}
          </Group>
  );
  const hint = "Seleziona un elemento per modificarlo, oppure trascina sulla carta per selezionarne di più (Maiusc per aggiungere). Frecce per spostare (Maiusc = 5 mm).";

  return (
    <>
    {/* Medidas explícitas: los nombres A2 y A1 no son tamaños de página válidos en CSS */}
    <style>{`@page { size: ${sheet.w}mm ${sheet.h}mm; margin: 0; }`}</style>
    <div className="flex h-dvh flex-col bg-surface text-ink print:hidden">
      <header className="shrink-0 border-b border-laguna/60 bg-surface pt-[env(safe-area-inset-top)]">
        <div className="flex h-12 items-center gap-2 px-3 md:gap-3 md:px-4">
          <Tip label="Torna al menù" hint="Esci dall'editor libero. Le modifiche sono già salvate.">
            <Link href="/" className={`inline-flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold hover:bg-laguna/30 md:h-9 ${focus}`}>
              <Icon d={ICONS.left} className="size-[18px]" />
              Menù
            </Link>
          </Tip>
          <Link href="/" aria-label="Menudo" className={`hidden rounded-md sm:block ${focus}`}>
            <Brand />
          </Link>
          <p className="min-w-0 flex-1 truncate text-xs text-ink/70" aria-live="polite">
            Editor libero · Le modifiche si salvano da sole
          </p>
          <Tip label="Annulla" hint="Ctrl+Z">
            <button className={iconBtn} aria-label="Annulla" disabled={!hist.past.length} onClick={undo}>
              <Icon d={ICONS.undo} className="size-[18px]" />
            </button>
          </Tip>
          <Tip label="Ripeti" hint="Ctrl+Maiusc+Z">
            <button className={iconBtn} aria-label="Ripeti" disabled={!hist.future.length} onClick={redo}>
              <Icon d={ICONS.redo} className="size-[18px]" />
            </button>
          </Tip>
          <Tip label={dark ? "Tema chiaro" : "Tema scuro"} hint="Cambia l'aspetto dell'editor">
            <button className={iconBtn} aria-label={dark ? "Tema chiaro" : "Tema scuro"} onClick={toggleTheme}>
              <Icon d={dark ? ICONS.sun : ICONS.moon} className="size-[18px]" />
            </button>
          </Tip>
          <button
            className={`hidden h-9 shrink-0 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white lift hover:brightness-110 disabled:opacity-50 md:inline-flex ${focus}`}
            title="Stampa" disabled={busy} onClick={print}
          >
            <Icon d={ICONS.print} className="size-[18px]" />
            Stampa
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
      <aside aria-label="Strumenti" className={`${tab === "tools" ? "block" : "hidden"} w-full shrink-0 overflow-y-auto bg-surface pb-24 md:block md:w-[280px] md:border-r md:border-laguna/60 md:pb-0`}>
        <Group title="Documento" icon={ICONS.edit} open>
          <button className={`${primary} w-full`} disabled={busy} onClick={importMenu}>
            <Icon d={ICONS.edit} className="size-[18px]" />
            Importa il menù attuale
          </button>
          {importMsg && <p role="status" className="text-sm text-ink/65">{importMsg}</p>}
          <div className="flex flex-wrap gap-2">
            <button className={secondary} disabled={busy} onClick={exportPdf}><Icon d={ICONS.download} className="size-4" />PDF</button>
            <button className={secondary} disabled={busy} onClick={exportPng}><Icon d={ICONS.download} className="size-4" />PNG</button>
            <button className={secondary} disabled={busy} onClick={print}><Icon d={ICONS.print} className="size-4" />Stampa</button>
            <button className={secondary} onClick={() => { if (confirm("Cancellare tutto e ricominciare?")) { setPages(() => [starter()]); goPage(0); } }}><Icon d={ICONS.reset} className="size-4" />Nuovo</button>
          </div>
          {exportError && <p role="alert" className="rounded-lg bg-sabbia px-3 py-2 text-sm font-semibold">{exportError}</p>}
          {saveError && <p role="alert" className="rounded-lg bg-sabbia px-3 py-2 text-sm font-semibold">Non c&apos;è spazio per salvare: ci sono troppe immagini. Il lavoro non verrà ripristinato se ricarichi.</p>}
        </Group>

        <Group title="Pagine" icon={ICONS.pages}>
          <p className="text-sm font-semibold">Pagina {page + 1} di {hist.pages.length}</p>
          <div className="flex flex-wrap gap-1">
            <button className={iconBtn} aria-label="Nuova pagina" title="Nuova pagina" onClick={addPage}><Icon d={ICONS.plus} /></button>
            <button className={iconBtn} aria-label="Duplica pagina" title="Duplica pagina" onClick={duplicatePage}><Icon d={ICONS.copy} /></button>
            <button className={iconBtn} aria-label="Sposta indietro" title="Sposta indietro" disabled={page === 0} onClick={() => movePage(-1)}><Icon d={ICONS.left} /></button>
            <button className={iconBtn} aria-label="Sposta avanti" title="Sposta avanti" disabled={page === hist.pages.length - 1} onClick={() => movePage(1)}><Icon d={ICONS.right} /></button>
            <button className={iconBtn} aria-label="Elimina pagina" title="Elimina pagina" disabled={hist.pages.length < 2} onClick={deletePage}><Icon d={ICONS.trash} /></button>
          </div>
        </Group>

        <Group title="Foglio" icon={ICONS.sheet}>
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">Carta</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PAPERS) as Paper[]).map((p) => (
                <label key={p} className={pillOpt(paper === p)}>
                  <input type="radio" name="paper" className="sr-only" checked={paper === p} onChange={() => {
                    setPaper(p);
                    setMul(1);
                  }} />
                  {p} <span className="font-normal opacity-80">({PAPERS[p].w} × {PAPERS[p].h} mm)</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">Copie per foglio</legend>
            <div className="flex flex-wrap gap-2">
              {COPIES.map((n) => {
                const sh = sheetFor(paper, n);
                return (
                  <label key={n} className={`${pillOpt(copies === n)} ${sh ? "" : "pointer-events-none opacity-40"}`}>
                    <input type="radio" name="copies" className="sr-only" disabled={!sh} checked={copies === n} onChange={() => setCopies(n)} />
                    {n === 1 ? "1 copia" : `${n} copie`}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-sm text-ink/65">
              Foglio: {sheet.name} {sheet.landscape ? "orizzontale" : "verticale"} ({sheet.w} × {sheet.h} mm)
            </p>
          </fieldset>
          {hasTable && (
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-semibold">Numeri di tavolo</legend>
              {COPY_NAMES[copies].map((where, c) => (
                <label key={c} className="flex items-center justify-between gap-2 text-sm">
                  {where}
                  <input
                    className={`${input} w-24 text-center`} maxLength={4} inputMode="numeric" placeholder="a penna"
                    value={tables[c] ?? ""}
                    onChange={(e) => setTables((t) => Object.assign([...t], { [c]: e.target.value }))}
                  />
                </label>
              ))}
              <p className="text-sm text-ink/65">Lascia vuoto per scriverlo a penna. In pantalla il numero è solo un segnaposto.</p>
            </fieldset>
          )}
        </Group>

        <Group title="Aggiungi" icon={ICONS.plus} open>
          <div className="flex flex-wrap gap-2">
            <button className={secondary} onClick={() => add(newText())}><Icon d={ICONS.text} className="size-4" />Testo</button>
            <button className={secondary} onClick={() => add({ id: uid(), type: "rect", x: 20, y: 60, width: 60, height: 30, ...common, fill: PALETTE[2].hex, radius: 0 })}><Icon d={ICONS.rect} className="size-4" />Rettangolo</button>
            <label className={secondary}>
              <Icon d={ICONS.image} className="size-4" />
              Immagine
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => { addImage(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
        </Group>

        <div className="lg:hidden">{properties}</div>

        <Group title="Livelli" icon={ICONS.layers}>
          {sels.length === 0 && <p className="text-sm text-ink/65 lg:hidden">Seleziona un elemento per modificarlo, oppure trascina sulla carta per selezionarne di più (Maiusc per aggiungere). Frecce per spostare (Maiusc = 5 mm).</p>}
          <ul className="-mx-2 space-y-0.5">
            {[...els].reverse().map((e) => (
              <li key={e.id} className={`flex items-center gap-0.5 rounded-lg px-2 py-0.5 ${sels.includes(e.id) ? "bg-laguna/40" : ""}`}>
                <button className={`min-w-0 flex-1 truncate py-1.5 text-left text-sm ${focus} ${e.visible ? "" : "text-ink/40 line-through"}`} onClick={(ev) => pick(e.id, ev.shiftKey || ev.ctrlKey || ev.metaKey)}>
                  {label(e)}
                  {e.group && <span className="ml-1 text-xs text-ink/45">gruppo</span>}
                </button>
                <button title="Porta su" aria-label="Porta su" className="grid size-8 place-items-center rounded-md text-ink/60 hover:bg-laguna/30 hover:text-ink" onClick={() => move(e.id, 1)}><Icon d={ICONS.up} className="size-4" /></button>
                <button title="Porta giù" aria-label="Porta giù" className="grid size-8 place-items-center rounded-md text-ink/60 hover:bg-laguna/30 hover:text-ink" onClick={() => move(e.id, -1)}><Icon d={ICONS.down} className="size-4" /></button>
                <button title="Mostra o nascondi" aria-label="Mostra o nascondi" aria-pressed={!e.visible} className="grid size-8 place-items-center rounded-md text-ink/60 hover:bg-laguna/30 hover:text-ink" onClick={() => patch(e.id, { visible: !e.visible })}><Icon d={e.visible ? ICONS.eye : ICONS.eyeOff} className="size-4" /></button>
                <button title="Blocca o sblocca" aria-label="Blocca o sblocca" aria-pressed={e.locked} className="grid size-8 place-items-center rounded-md text-ink/60 hover:bg-laguna/30 hover:text-ink" onClick={() => patch(e.id, { locked: !e.locked })}><Icon d={e.locked ? ICONS.lock : ICONS.unlock} className="size-4" /></button>
              </li>
            ))}
          </ul>
        </Group>

        <Group title="Archivio" icon={ICONS.archive}>
          <div className="flex gap-2">
            <input
              aria-label="Nome del design" className={input} placeholder="Nome del design" value={designName}
              onChange={(e) => setDesignName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveDesign()}
            />
            <button className={secondary} onClick={saveDesign}><Icon d={ICONS.save} className="size-4" />Salva</button>
          </div>
          {archiveMsg && <p role="status" className="text-sm text-ink/65">{archiveMsg}</p>}
          <ul className="space-y-2">
            {saved.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 ring-1 ring-laguna/60">
                <button className={`min-w-0 flex-1 text-left ${focus}`} onClick={() => openDesign(d)} title={`Apri «${d.name}»`}>
                  <p className="truncate text-sm font-semibold">{d.name}</p>
                  <p className="text-xs text-ink/55">
                    {d.doc.paper} · {d.doc.pages.length} {d.doc.pages.length === 1 ? "pagina" : "pagine"} · {new Date(d.savedAt).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                  </p>
                </button>
                <button aria-label={`Elimina ${d.name}`} title="Elimina" className={iconBtn} onClick={() => removeDesign(d)}><Icon d={ICONS.trash} className="size-4" /></button>
              </li>
            ))}
          </ul>
        </Group>
      </aside>

      <main ref={wrap} className={`${tab === "canvas" ? "block" : "hidden"} canvas min-w-0 flex-1 overflow-auto px-4 pb-40 md:block md:px-6 md:pb-6`}>
        {/* sticky dentro de la zona que se desplaza (no fixed): las bolas quedan dentro de su caja, como en el editor principal */}
        <div className="pointer-events-none sticky top-1/2 z-20 -mb-5 h-0">
          <div role="group" aria-label={`Zoom ${pct}%`} className="pointer-events-auto absolute right-0 flex -translate-y-1/2 flex-col gap-2">
            <button className={ball} aria-label="Ingrandisci" title={`Ingrandisci · ${pct}%`} disabled={mul >= maxMul} onClick={() => zoomBy(1.25)}><Icon d={ICONS.zoomIn} /></button>
            <button className={`${ball} text-xs font-semibold tabular-nums`} aria-label="Adatta alla larghezza" title="Adatta alla larghezza" onClick={() => setMul(1)}>{pct}%</button>
            <button className={ball} aria-label="Riduci" title={`Riduci · ${pct}%`} disabled={mul <= 0.5} onClick={() => zoomBy(1 / 1.25)}><Icon d={ICONS.zoomOut} /></button>
          </div>
        </div>
        {hist.pages.length > 1 && (
          <div className="pointer-events-none sticky top-3 z-20 -mb-9 h-0">
            <div role="tablist" aria-label="Pagine" className="pointer-events-auto absolute left-0 flex max-w-[60%] flex-wrap gap-1.5">
              {hist.pages.map((_, i) => (
                <button key={i} role="tab" aria-selected={i === page} className={`grid size-9 place-items-center rounded-full text-sm font-semibold shadow-[0_8px_24px_-8px_rgb(14_26_43/0.45)] ring-1 ring-laguna/60 lift ${focus} ${i === page ? "bg-brand text-white" : "bg-surface"}`} onClick={() => goPage(i)}>{i + 1}</button>
              ))}
            </div>
          </div>
        )}
        {/* m-auto centra la hoja cuando cabe y deja desplazarse cuando es mayor que el área (justify-center la cortaría) */}
        <div className="flex min-h-full py-4 md:py-6">
        <div className="m-auto h-fit shrink-0 shadow-[0_18px_40px_-18px_rgb(14_26_43/0.45)]">
          <Stage
            ref={stageRef}
            width={w * zoom}
            height={h * zoom}
            scaleX={zoom}
            scaleY={zoom}
            onMouseDown={(e) => {
              if (!emptyHit(e)) return;
              const add = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
              const p = toMm(e.target.getStage()!);
              marqueeFrom.current = { ...p, add };
              setMarquee({ ...p, w: 0, h: 0 });
              if (!add) setSels([]);
            }}
            onMouseMove={(e) => {
              const from = marqueeFrom.current;
              if (!from) return;
              const p = toMm(e.target.getStage()!);
              setMarquee({ x: Math.min(from.x, p.x), y: Math.min(from.y, p.y), w: Math.abs(p.x - from.x), h: Math.abs(p.y - from.y) });
            }}
            onMouseUp={endMarquee}
            onMouseLeave={endMarquee}
            onTouchStart={(e) => (emptyHit(e) && !multi ? setSels([]) : undefined)}
          >
            <Layer ref={layerRef}>
              <Rect name="paper" width={w} height={h} fill="#fff" />
              {els.map((el) => {
                const props = {
                  id: el.id,
                  x: el.x,
                  y: el.y,
                  width: el.width,
                  height: el.height,
                  rotation: el.rotation,
                  opacity: el.opacity,
                  visible: el.visible,
                  draggable: !el.locked,
                  listening: !el.locked,
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
                    <Text key={el.id} {...props} name={el.table ? "table-number" : undefined} height={undefined} text={el.text} fontSize={el.fontSize} fill={el.fill} fontFamily={fontFamily(el.fontFamily)} align={el.align}
                      fontStyle={fontStyleOf(el)} lineHeight={el.lineHeight ?? 1.2} />
                  );
                if (el.type === "rect") return <Rect key={el.id} {...props} fill={el.fill} cornerRadius={el.radius} stroke={el.stroke} strokeWidth={el.strokeW} />;
                if (el.type === "tiles") return <TilesNode key={el.id} el={el} {...props} />;
                if (el.type === "line")
                  return <Line key={el.id} {...props} points={[0, 0, el.width, 0]} stroke={el.fill} strokeWidth={el.thickness} lineCap="round" dash={el.dash ? [0.01, el.thickness * 2] : undefined} hitStrokeWidth={4} />;
                return <ImageNode key={el.id} el={el} {...props} />;
              })}
              {guides.v.map((x) => <Line key={"v" + x} points={[x, 0, x, h]} stroke={PALETTE[1].hex} strokeWidth={1.2 / zoom} dash={[4 / zoom, 3 / zoom]} listening={false} />)}
              {guides.h.map((y) => <Line key={"h" + y} points={[0, y, w, y]} stroke={PALETTE[1].hex} strokeWidth={1.2 / zoom} dash={[4 / zoom, 3 / zoom]} listening={false} />)}
              {marquee && <Rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill={PALETTE[1].hex} opacity={0.18} stroke={PALETTE[1].hex} strokeWidth={1 / zoom} listening={false} />}
              <Transformer ref={trRef} borderStroke={PALETTE[1].hex} anchorStroke={PALETTE[1].hex} anchorFill="#fff" anchorSize={coarse ? 26 : 10} anchorCornerRadius={coarse ? 13 : 0} rotateAnchorOffset={coarse ? 40 : 50} rotateEnabled keepRatio={false} boundBoxFunc={(o, n) => (n.width < 5 || n.height < 5 ? o : n)} />
            </Layer>
          </Stage>
        </div>
        </div>
      </main>
      <aside aria-label="Proprietà" className="hidden w-[280px] shrink-0 overflow-y-auto border-l border-laguna/60 bg-surface lg:block">
        {properties}
        {sels.length === 0 && <p className="p-4 text-sm text-ink/70">{hint}</p>}
      </aside>
      </div>

      {/* Móvil: acciones de la selección y barra de pestañas, en la zona del pulgar */}
      {tab === "canvas" && sels.length > 0 && (
        <div className="fixed inset-x-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] flex flex-wrap justify-center gap-2 rounded-2xl bg-surface/95 p-2 shadow-lg ring-1 ring-laguna/60 backdrop-blur md:hidden">
          <button className={secondary} onClick={duplicateSel}><Icon d={ICONS.copy} className="size-4" />Duplica</button>
          {sels.length > 1 && <button className={secondary} onClick={group}><Icon d={ICONS.group} className="size-4" />Raggruppa</button>}
          {selEls.some((x) => x.group) && <button className={secondary} onClick={ungroup}><Icon d={ICONS.ungroup} className="size-4" />Separa</button>}
          <button className={secondary} onClick={removeSel}><Icon d={ICONS.trash} className="size-4" />Elimina</button>
        </div>
      )}
      <nav aria-label="Sezioni" className="fixed inset-x-0 bottom-0 grid grid-cols-5 border-t border-laguna/60 bg-surface/95 px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        {([["canvas", "Carta", ICONS.canvas], ["tools", "Strumenti", ICONS.tools]] as const).map(([id, t, icon]) => (
          <button key={id} aria-current={tab === id ? "page" : undefined} className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-xs ${focus} ${tab === id ? "font-semibold" : "text-ink/65"}`} onClick={() => setTab(id)}>
            <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${tab === id ? "bg-laguna/50" : ""}`}><Icon d={icon} /></span>
            {t}
          </button>
        ))}
        <button className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-xs text-ink/65 disabled:opacity-40 ${focus}`} disabled={!hist.past.length} onClick={undo}>
          <span className="grid h-7 w-12 place-items-center rounded-full"><Icon d={ICONS.undo} /></span>
          Annulla
        </button>
        <button aria-pressed={multi} className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-xs ${focus} ${multi ? "font-semibold" : "text-ink/65"}`} onClick={() => setMulti((v) => !v)}>
          <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${multi ? "bg-laguna/50" : ""}`}><Icon d={ICONS.select} /></span>
          Multi
        </button>
        <button className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-xs font-semibold disabled:opacity-50 ${focus}`} disabled={busy} onClick={print}>
          <span className="grid h-7 w-12 place-items-center rounded-full bg-brand text-white"><Icon d={ICONS.print} /></span>
          Stampa
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
