"use client";

import { useEffect, useRef, useState } from "react";
import { Image as KImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";

/* Fase 1: lienzo con papel A2–A5, elementos básicos y transformador.
   Fase 2: panel de propiedades completo y panel de capas (orden, ocultar, bloquear, duplicar).
   Todas las medidas del modelo están en mm; el Stage se escala para mostrarlas. */

import { common, Copies, COPIES, El, FONTS, FontKey, fontFamily, fontStyleOf, newText, PALETTE, PAPERS, Paper, sheetFor, tilePattern, tileScale, uid } from "./model";
import { menuToElements, readSavedMenu } from "./menuTemplate";

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

function Num({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-2">
      {label}
      <input type="number" step="any" min={min} className="w-20 rounded-lg border border-ink/20 p-1" value={Math.round(value * 10) / 10} onChange={(e) => onChange(Math.max(min ?? -Infinity, Number(e.target.value) || 0))} />
    </label>
  );
}

/* Fase 6: guías de alineación con imán (Alt las desactiva) y texto con altura automática.
   Fase 4: exportar a PNG y PDF a resolución de impresión, e imprimir.
   Fase 3: guardado automático en localStorage y deshacer/rehacer */
const STORAGE_KEY = "menudo:canvas:v1";
const MAX_HISTORY = 100;
type History = { past: El[][]; els: El[]; future: El[][] };
const starter = (): El[] => [newText({ y: 20, width: 170, height: 20, text: "Menù", fontSize: 14, fontFamily: "display" })];

function load(): { paper: Paper; copies: Copies; els: El[] } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (raw && raw.paper in PAPERS && Array.isArray(raw.els)) return { ...raw, copies: COPIES.includes(raw.copies) ? raw.copies : 1 };
  } catch {}
  return { paper: "A4", copies: 1, els: starter() };
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

const btn = "rounded-lg border border-ink/20 bg-white px-3 py-1.5 text-sm hover:bg-laguna/30 disabled:opacity-40";

export default function CanvasEditor() {
  const [init] = useState(load);
  const [paper, setPaper] = useState<Paper>(init.paper);
  const [wanted, setCopies] = useState<Copies>(init.copies);
  // Si el papel elegido no admite esas copias (p. ej. 4 × A3), se vuelve a 1
  const copies: Copies = sheetFor(paper, wanted) ? wanted : 1;
  const sheet = sheetFor(paper, copies)!;
  const [hist, setHist] = useState<History>({ past: [], els: init.els, future: [] });
  const [saveError, setSaveError] = useState(false);
  const els = hist.els;
  const lastKey = useRef("");
  const lastTime = useRef(0);

  // Cambia los elementos guardando el estado anterior para deshacer. Con `key`, los cambios seguidos
  // sobre lo mismo (escribir, mover un deslizador) se funden en un solo paso.
  const setEls = (f: El[] | ((a: El[]) => El[]), key?: string) => {
    const now = Date.now();
    const merge = !!key && key === lastKey.current && now - lastTime.current < 1000;
    lastKey.current = key ?? "";
    lastTime.current = now;
    setHist((h) => {
      const next = typeof f === "function" ? f(h.els) : f;
      if (next === h.els) return h;
      return { past: merge ? h.past : [...h.past, h.els].slice(-MAX_HISTORY), els: next, future: [] };
    });
  };
  const undo = () => {
    lastKey.current = "";
    setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), els: h.past[h.past.length - 1], future: [h.els, ...h.future] } : h));
  };
  const redo = () => {
    lastKey.current = "";
    setHist((h) => (h.future.length ? { past: [...h.past, h.els], els: h.future[0], future: h.future.slice(1) } : h));
  };
  const [, setFontsReady] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [zoom, setZoom] = useState(2); // px por mm
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const wrap = useRef<HTMLDivElement>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [printSrc, setPrintSrc] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const { w, h } = PAPERS[paper];

  // Las fuentes web se descargan al usarse en el DOM: se piden aquí y se repinta el lienzo al llegar
  useEffect(() => {
    Promise.allSettled(FONTS.flatMap((f) => ["400", "700"].map((w) => document.fonts.load(`${w} 16px ${fontFamily(f.key)}`)))).then(() => setFontsReady((n) => n + 1));
  }, []);

  // Ajusta el zoom para que la hoja quepa en el ancho disponible
  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(([e]) => setZoom(Math.max(0.3, (e.contentRect.width - 32) / w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);

  // El transformador sigue al elemento seleccionado
  useEffect(() => {
    const locked = els.find((x) => x.id === sel)?.locked;
    const node = sel && !locked ? layerRef.current?.findOne("#" + sel) : undefined;
    trRef.current?.nodes(node ? [node] : []);
    trRef.current?.getLayer()?.batchDraw();
  }, [sel, els]);

  // Guarda sola, un momento después del último cambio
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ paper, copies, els }));
        setSaveError(false);
      } catch {
        setSaveError(true); // normalmente: demasiadas imágenes para el límite del navegador
      }
    }, 400);
    return () => clearTimeout(t);
  }, [paper, copies, els]);

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
        return;
      }
      if (!sel || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        setEls((a) => a.filter((x) => x.id !== sel));
        setSel(null);
      }
      const step = e.shiftKey ? 5 : 1;
      const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (d[e.key]) {
        e.preventDefault();
        setEls((a) => a.map((x) => (x.id === sel && !x.locked ? { ...x, x: x.x + d[e.key][0], y: x.y + d[e.key][1] } : x)), "nudge:" + sel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  // `merge`: ediciones desde el panel (escribir, deslizadores) que deben deshacerse de una vez
  const patch = (id: string, p: Partial<El>, merge = true) =>
    setEls((a) => a.map((x) => (x.id === id ? ({ ...x, ...p } as El) : x)), merge ? `patch:${id}:${Object.keys(p).join()}` : undefined);
  const add = (e: El) => {
    setEls((a) => [...a, e]);
    setSel(e.id);
  };
  const cur = els.find((x) => x.id === sel);

  const duplicate = (e: El) => add({ ...e, id: uid(), x: e.x + 5, y: e.y + 5, locked: false });
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
    const { url, dpi } = render(sheet.cols * sheet.rows);
    if (copies === 1) return { url, dpi };
    const im = new window.Image();
    im.src = url;
    await im.decode();
    const c = document.createElement("canvas");
    c.width = im.width * sheet.cols;
    c.height = im.height * sheet.rows;
    const g = c.getContext("2d")!;
    for (let r = 0; r < sheet.rows; r++) for (let q = 0; q < sheet.cols; q++) g.drawImage(im, q * im.width, r * im.height);
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
  const exportPng = () => run(async () => download((await compose()).url, `menu-${paper}-x${copies}.png`));
  const exportPdf = () =>
    run(async () => {
      const { PDFDocument } = await import("pdf-lib");
      const png = await fetch((await compose()).url).then((r) => r.arrayBuffer());
      const doc = await PDFDocument.create();
      const pt = (mm: number) => (mm / MM_PER_INCH) * 72;
      const page = doc.addPage([pt(sheet.w), pt(sheet.h)]);
      page.drawImage(await doc.embedPng(png), { x: 0, y: 0, width: pt(sheet.w), height: pt(sheet.h) });
      const bytes = await doc.save();
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      download(url, `menu-${paper}-x${copies}.pdf`);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
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

  // Rehace el lienzo a partir de la carta del editor principal; Annulla lo deshace
  const importMenu = () =>
    run(async () => {
      setImportMsg("");
      const menu = readSavedMenu();
      if (!menu) return setImportMsg("Nessun menù trovato: crealo prima nell'editor principale.");
      setEls(await menuToElements(menu, paper));
      setSel(null);
      setImportMsg(menu.coverOn ? "Importata la pagina del menù (la copertina non è inclusa)." : "Menù importato.");
    });
  const print = () =>
    run(async () => {
      const { url } = await compose();
      const im = new window.Image();
      im.src = url;
      await im.decode();
      setPrintSrc(url);
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      window.print();
    });

  // Al terminar de transformar, la escala pasa a width/height para no acumularla
  const onTransformEnd = (e: Konva.KonvaEventObject<Event>, el: El) => {
    const n = e.target;
    const sx = n.scaleX();
    const sy = n.scaleY();
    n.scaleX(1);
    n.scaleY(1);
    const base = { x: n.x(), y: n.y(), rotation: n.rotation(), width: Math.max(5, n.width() * sx), height: Math.max(5, n.height() * sy) };
    patch(el.id, el.type === "text" ? { ...base, fontSize: Math.max(2, el.fontSize * sy), height: base.height } : base, false);
  };

  return (
    <>
    <style>{`@page { size: ${sheet.name} ${sheet.landscape ? "landscape" : "portrait"}; margin: 0; }`}</style>
    <div className="flex min-h-screen flex-col bg-laguna/35 text-ink md:flex-row print:hidden">
      <aside className="flex shrink-0 flex-col gap-4 md:sticky md:top-0 md:h-screen md:overflow-y-auto border-b border-laguna/60 bg-white p-4 md:w-72 md:border-r md:border-b-0">
        <h1 className="font-display text-lg font-semibold">Editor libero (prova)</h1>

        <div className="flex flex-wrap items-center gap-2">
          <button className={btn} disabled={!hist.past.length} onClick={undo} title="Ctrl+Z">↶ Annulla</button>
          <button className={btn} disabled={!hist.future.length} onClick={redo} title="Ctrl+Maiusc+Z">↷ Ripeti</button>
          <button className={btn} onClick={() => { if (confirm("Cancellare tutto e ricominciare?")) { setEls(starter()); setSel(null); } }}>Nuovo</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={`${btn} bg-mare font-semibold hover:bg-mare`} disabled={busy} onClick={print}>Stampa</button>
          <button className={btn} disabled={busy} onClick={exportPdf}>PDF</button>
          <button className={btn} disabled={busy} onClick={exportPng}>PNG</button>
        </div>
        <div className="flex flex-col gap-1">
          <button className={btn} disabled={busy} onClick={importMenu}>Importa il menù attuale</button>
          {importMsg && <p role="status" className="text-sm text-ink/65">{importMsg}</p>}
        </div>
        {exportError && <p role="alert" className="rounded-lg bg-limone/60 p-2 text-sm">{exportError}</p>}
        {saveError && <p role="alert" className="rounded-lg bg-limone/60 p-2 text-sm">Non c&apos;è spazio per salvare: ci sono troppe immagini. Il lavoro non verrà ripristinato se ricarichi.</p>}

        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 text-sm font-medium">Carta</legend>
          {(Object.keys(PAPERS) as Paper[]).map((p) => (
            <label key={p} className={`cursor-pointer rounded-lg px-2 py-1 text-xs ring-1 ${paper === p ? "bg-mare font-semibold text-ink ring-mare" : "ring-ink/20"}`}>
              <input type="radio" name="paper" className="sr-only" checked={paper === p} onChange={() => setPaper(p)} />
              {p} ({PAPERS[p].w} × {PAPERS[p].h} mm)
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">Copie per foglio</legend>
          <div className="flex flex-wrap gap-2">
            {COPIES.map((n) => {
              const sh = sheetFor(paper, n);
              return (
                <label key={n} className={`rounded-lg px-2 py-1 text-xs ring-1 ${!sh ? "cursor-not-allowed opacity-40 ring-ink/20" : copies === n ? "cursor-pointer bg-mare font-semibold text-ink ring-mare" : "cursor-pointer ring-ink/20"}`}>
                  <input type="radio" name="copies" className="sr-only" disabled={!sh} checked={copies === n} onChange={() => setCopies(n)} />
                  {n === 1 ? "1 copia" : `${n} copie`}
                </label>
              );
            })}
          </div>
          <p className="text-xs text-ink/65">
            Foglio: {sheet.name} {sheet.landscape ? "orizzontale" : "verticale"} ({sheet.w} × {sheet.h} mm)
          </p>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <button className={btn} onClick={() => add(newText())}>
            + Testo
          </button>
          <button className={btn} onClick={() => add({ id: uid(), type: "rect", x: 20, y: 60, width: 60, height: 30, ...common, fill: PALETTE[2].hex, radius: 0 })}>
            + Rettangolo
          </button>
          <label className={`${btn} cursor-pointer`}>
            + Immagine
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => { addImage(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>

        {cur ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium">Proprietà</p>
            {cur.type === "text" && (
              <>
                <textarea className="rounded-lg border border-ink/20 p-2" rows={3} value={cur.text} onChange={(e) => patch(cur.id, { text: e.target.value })} />
                <select className="rounded-lg border border-ink/20 p-1.5" value={cur.fontFamily} onChange={(e) => patch(cur.id, { fontFamily: e.target.value as FontKey })}>
                  {FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button aria-pressed={cur.bold} className={`${btn} font-bold ${cur.bold ? "bg-mare text-ink font-semibold hover:bg-mare" : ""}`} onClick={() => patch(cur.id, { bold: !cur.bold })}>B</button>
                  <button aria-pressed={cur.italic} className={`${btn} italic ${cur.italic ? "bg-mare text-ink font-semibold hover:bg-mare" : ""}`} onClick={() => patch(cur.id, { italic: !cur.italic })}>I</button>
                  {(["left", "center", "right"] as const).map((al) => (
                    <button key={al} aria-pressed={cur.align === al} className={`${btn} ${cur.align === al ? "bg-mare text-ink font-semibold hover:bg-mare" : ""}`} onClick={() => patch(cur.id, { align: al })}>
                      {al === "left" ? "Sx" : al === "center" ? "Ct" : "Dx"}
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
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="size-4 accent-mare" checked={cur.dash} onChange={(e) => patch(cur.id, { dash: e.target.checked })} />
                  Punteggiata
                </label>
              </>
            )}
            {cur.type === "rect" && <Num label="Angoli (mm)" value={cur.radius} min={0} onChange={(v) => patch(cur.id, { radius: v })} />}
            {cur.type !== "image" && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1">Colore</span>
                {PALETTE.map((c) => (
                  <button key={c.hex} title={c.name} aria-label={c.name} aria-pressed={cur.fill.toLowerCase() === c.hex.toLowerCase()}
                    className="size-7 rounded-full ring-1 ring-ink/20 ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-ink"
                    style={{ background: c.hex }} onClick={() => patch(cur.id, { fill: c.hex })} />
                ))}
                <input type="color" aria-label="Altro colore" className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0" value={cur.fill} onChange={(e) => patch(cur.id, { fill: e.target.value })} />
              </div>
            )}
            <label className="flex items-center gap-2">
              Opacità
              <input type="range" className="accent-mare" min={0} max={1} step={0.05} value={cur.opacity} onChange={(e) => patch(cur.id, { opacity: Number(e.target.value) })} />
              {Math.round(cur.opacity * 100)}%
            </label>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <Num label="X" value={cur.x} onChange={(v) => patch(cur.id, { x: v })} />
              <Num label="Y" value={cur.y} onChange={(v) => patch(cur.id, { y: v })} />
              <Num label="L" value={cur.width} min={1} onChange={(v) => patch(cur.id, { width: v })} />
              {cur.type !== "text" && <Num label="A" value={cur.height} min={1} onChange={(v) => patch(cur.id, { height: v })} />}
              <Num label="Rot°" value={cur.rotation} onChange={(v) => patch(cur.id, { rotation: v })} />
            </div>
            <div className="flex gap-2">
              <button className={btn} onClick={() => duplicate(cur)}>Duplica</button>
              <button className={btn} onClick={() => { setEls((a) => a.filter((x) => x.id !== cur.id)); setSel(null); }}>Elimina</button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink/65">Seleziona un elemento per modificarlo. Trascina, ridimensiona e ruota con le maniglie; frecce per spostare (Maiusc = 5 mm).</p>
        )}

        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">Livelli</p>
          {[...els].reverse().map((e) => (
            <div key={e.id} className={`flex items-center gap-1 rounded-lg px-1.5 py-1 ${e.id === sel ? "bg-laguna/50" : ""}`}>
              <button className={`min-w-0 flex-1 truncate text-left ${e.visible ? "" : "text-ink/40 line-through"}`} onClick={() => setSel(e.id)}>
                {label(e)}
              </button>
              <button title="Su" aria-label="Porta su" className="px-1 hover:bg-laguna/30" onClick={() => move(e.id, 1)}>↑</button>
              <button title="Giù" aria-label="Porta giù" className="px-1 hover:bg-laguna/30" onClick={() => move(e.id, -1)}>↓</button>
              <button title="Mostra/nascondi" aria-label="Mostra o nascondi" aria-pressed={!e.visible} className="px-1 hover:bg-laguna/30" onClick={() => patch(e.id, { visible: !e.visible })}>{e.visible ? "👁" : "—"}</button>
              <button title="Blocca" aria-label="Blocca o sblocca" aria-pressed={e.locked} className="px-1 hover:bg-laguna/30" onClick={() => patch(e.id, { locked: !e.locked })}>{e.locked ? "🔒" : "🔓"}</button>
            </div>
          ))}
        </div>
      </aside>

      <main ref={wrap} className="flex flex-1 justify-center overflow-auto p-4">
        <div className="h-fit shadow-[0_18px_40px_-18px_rgb(23_48_51/0.45)]">
          <Stage
            ref={stageRef}
            width={w * zoom}
            height={h * zoom}
            scaleX={zoom}
            scaleY={zoom}
            onMouseDown={(e) => e.target === e.target.getStage() || e.target.name() === "paper" ? setSel(null) : undefined}
            onTouchStart={(e) => e.target === e.target.getStage() || e.target.name() === "paper" ? setSel(null) : undefined}
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
                  onClick: () => setSel(el.id),
                  onTap: () => setSel(el.id),
                  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => snap(e, el.id),
                  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
                    setGuides({ v: [], h: [] });
                    patch(el.id, { x: e.target.x(), y: e.target.y() }, false);
                  },
                  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => onTransformEnd(e, el),
                };
                if (el.type === "text")
                  return (
                    <Text key={el.id} {...props} height={undefined} text={el.text} fontSize={el.fontSize} fill={el.fill} fontFamily={fontFamily(el.fontFamily)} align={el.align}
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
              <Transformer ref={trRef} borderStroke={PALETTE[1].hex} anchorStroke={PALETTE[1].hex} anchorFill="#fff" rotateEnabled keepRatio={false} boundBoxFunc={(o, n) => (n.width < 5 || n.height < 5 ? o : n)} />
            </Layer>
          </Stage>
        </div>
      </main>
    </div>
    {/* Solo al imprimir: la hoja renderizada a alta resolución, a tamaño real */}
    {/* eslint-disable-next-line @next/next/no-img-element -- data URL local, no hay nada que optimizar */}
    <div className="hidden print:block">{printSrc && <img src={printSrc} alt="" style={{ width: `${sheet.w}mm`, height: `${sheet.h}mm`, display: "block" }} />}</div>
    </>
  );
}
