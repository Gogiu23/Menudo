"use client";

import { useEffect, useRef, useState } from "react";
import { Image as KImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";

/* Fase 1: lienzo con papel A2–A5, elementos básicos y transformador.
   Fase 2: panel de propiedades completo y panel de capas (orden, ocultar, bloquear, duplicar).
   Todas las medidas del modelo están en mm; el Stage se escala para mostrarlas. */

type Paper = "A2" | "A3" | "A4" | "A5";
const PAPERS: Record<Paper, { w: number; h: number }> = {
  A2: { w: 420, h: 594 },
  A3: { w: 297, h: 420 },
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
};

type Base = { id: string; x: number; y: number; width: number; height: number; rotation: number; opacity: number; visible: boolean; locked: boolean };
type El =
  | (Base & { type: "text"; text: string; fontSize: number; fill: string; fontFamily: FontKey; bold: boolean; italic: boolean; align: "left" | "center" | "right" })
  | (Base & { type: "rect"; fill: string; radius: number })
  | (Base & { type: "image"; src: string });

const uid = () => Math.random().toString(36).slice(2, 9);

// Misma paleta y tipografías que el editor principal (ver globals.css y layout.tsx)
const INK = "#173033";
const PALETTE = [
  { name: "Inchiostro", hex: INK },
  { name: "Mare", hex: "#68A7AD" },
  { name: "Laguna", hex: "#99C4C8" },
  { name: "Sabbia", hex: "#E5CB9F" },
  { name: "Limone", hex: "#EEE4AB" },
  { name: "Bianco", hex: "#FFFFFF" },
];
const FONTS = [
  { label: "Titillium", key: "sans", cssVar: "--font-titillium", fallback: "system-ui, sans-serif" },
  { label: "Bodoni", key: "display", cssVar: "--font-bodoni", fallback: "Georgia, serif" },
] as const;
type FontKey = (typeof FONTS)[number]["key"];

// Canvas no entiende var(): se lee el nombre real de la fuente que next/font define en <html>
function fontFamily(key: FontKey) {
  const f = FONTS.find((x) => x.key === key)!;
  const v = getComputedStyle(document.documentElement).getPropertyValue(f.cssVar).trim();
  return v ? `${v}, ${f.fallback}` : f.fallback;
}

const common = { rotation: 0, opacity: 1, visible: true, locked: false };
const newText = (o: Partial<Extract<El, { type: "text" }>> = {}): El => ({
  id: uid(), type: "text", x: 20, y: 40, width: 100, height: 10, ...common,
  text: "Testo", fontSize: 8, fill: INK, fontFamily: "sans", bold: false, italic: false, align: "left", ...o,
});
const label = (e: El) => (e.type === "text" ? e.text.split("\n")[0].slice(0, 24) || "Testo" : e.type === "rect" ? "Rettangolo" : "Immagine");

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

function Num({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-2">
      {label}
      <input type="number" step="any" min={min} className="w-20 rounded-lg border border-ink/20 p-1" value={Math.round(value * 10) / 10} onChange={(e) => onChange(Math.max(min ?? -Infinity, Number(e.target.value) || 0))} />
    </label>
  );
}

const btn = "rounded-lg border border-ink/20 bg-white px-3 py-1.5 text-sm hover:bg-laguna/30 disabled:opacity-40";

export default function CanvasEditor() {
  const [paper, setPaper] = useState<Paper>("A4");
  const [els, setEls] = useState<El[]>(() => [newText({ y: 20, width: 170, height: 20, text: "Menù", fontSize: 14, fontFamily: "display" })]);
  const [, setFontsReady] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [zoom, setZoom] = useState(2); // px por mm
  const wrap = useRef<HTMLDivElement>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const { w, h } = PAPERS[paper];

  // Las fuentes web se descargan al usarse en el DOM: se piden aquí y se repinta el lienzo al llegar
  useEffect(() => {
    Promise.all(FONTS.flatMap((f) => ["400", "700"].map((w) => document.fonts.load(`${w} 16px ${fontFamily(f.key)}`)))).then(() => setFontsReady((n) => n + 1));
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

  // Suprimir borra el elemento (salvo si se está escribiendo en un campo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (!sel || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        setEls((a) => a.filter((x) => x.id !== sel));
        setSel(null);
      }
      const step = e.shiftKey ? 5 : 1;
      const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (d[e.key]) {
        e.preventDefault();
        setEls((a) => a.map((x) => (x.id === sel && !x.locked ? { ...x, x: x.x + d[e.key][0], y: x.y + d[e.key][1] } : x)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  const patch = (id: string, p: Partial<El>) => setEls((a) => a.map((x) => (x.id === id ? ({ ...x, ...p } as El) : x)));
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
    r.onload = () => {
      const src = String(r.result);
      const i = new window.Image();
      i.onload = () => {
        const width = Math.min(100, w - 20);
        add({ id: uid(), type: "image", src, x: 10, y: 10, width, height: (width * i.height) / i.width, ...common });
      };
      i.src = src;
    };
    r.readAsDataURL(file);
  };

  // Al terminar de transformar, la escala pasa a width/height para no acumularla
  const onTransformEnd = (e: Konva.KonvaEventObject<Event>, el: El) => {
    const n = e.target;
    const sx = n.scaleX();
    const sy = n.scaleY();
    n.scaleX(1);
    n.scaleY(1);
    const base = { x: n.x(), y: n.y(), rotation: n.rotation(), width: Math.max(5, n.width() * sx), height: Math.max(5, n.height() * sy) };
    patch(el.id, el.type === "text" ? { ...base, fontSize: Math.max(2, el.fontSize * sy), height: base.height } : base);
  };

  return (
    <div className="flex min-h-screen flex-col bg-laguna/35 text-ink md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 md:sticky md:top-0 md:h-screen md:overflow-y-auto border-b border-laguna/60 bg-white p-4 md:w-72 md:border-r md:border-b-0">
        <h1 className="font-display text-lg font-semibold">Editor libero (prova)</h1>

        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 text-sm font-medium">Carta</legend>
          {(Object.keys(PAPERS) as Paper[]).map((p) => (
            <label key={p} className={`cursor-pointer rounded-lg px-2 py-1 text-xs ring-1 ${paper === p ? "bg-mare font-semibold text-ink ring-mare" : "ring-ink/20"}`}>
              <input type="radio" name="paper" className="sr-only" checked={paper === p} onChange={() => setPaper(p)} />
              {p} ({PAPERS[p].w} × {PAPERS[p].h} mm)
            </label>
          ))}
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
              <Num label="A" value={cur.height} min={1} onChange={(v) => patch(cur.id, { height: v })} />
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
                  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => patch(el.id, { x: e.target.x(), y: e.target.y() }),
                  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => onTransformEnd(e, el),
                };
                if (el.type === "text")
                  return (
                    <Text key={el.id} {...props} text={el.text} fontSize={el.fontSize} fill={el.fill} fontFamily={fontFamily(el.fontFamily)} align={el.align}
                      fontStyle={`${el.italic ? "italic " : ""}${el.bold ? "bold" : "normal"}`} />
                  );
                if (el.type === "rect") return <Rect key={el.id} {...props} fill={el.fill} cornerRadius={el.radius} />;
                return <ImageNode key={el.id} el={el} {...props} />;
              })}
              <Transformer ref={trRef} borderStroke={PALETTE[1].hex} anchorStroke={PALETTE[1].hex} anchorFill="#fff" rotateEnabled keepRatio={false} boundBoxFunc={(o, n) => (n.width < 5 || n.height < 5 ? o : n)} />
            </Layer>
          </Stage>
        </div>
      </main>
    </div>
  );
}
