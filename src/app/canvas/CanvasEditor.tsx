"use client";

import { useEffect, useRef, useState } from "react";
import { Image as KImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";

/* Fase 1: lienzo con papel A2–A5, elementos básicos y transformador.
   Todas las medidas del modelo están en mm; el Stage se escala para mostrarlas. */

type Paper = "A2" | "A3" | "A4" | "A5";
const PAPERS: Record<Paper, { w: number; h: number }> = {
  A2: { w: 420, h: 594 },
  A3: { w: 297, h: 420 },
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
};

type Base = { id: string; x: number; y: number; width: number; height: number; rotation: number };
type El =
  | (Base & { type: "text"; text: string; fontSize: number; fill: string })
  | (Base & { type: "rect"; fill: string })
  | (Base & { type: "image"; src: string });

const uid = () => Math.random().toString(36).slice(2, 9);

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

const btn = "rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-40";

export default function CanvasEditor() {
  const [paper, setPaper] = useState<Paper>("A4");
  const [els, setEls] = useState<El[]>([
    { id: uid(), type: "text", x: 20, y: 20, width: 170, height: 20, rotation: 0, text: "Menù", fontSize: 14, fill: "#173033" },
  ]);
  const [sel, setSel] = useState<string | null>(null);
  const [zoom, setZoom] = useState(2); // px por mm
  const wrap = useRef<HTMLDivElement>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const { w, h } = PAPERS[paper];

  // Ajusta el zoom para que la hoja quepa en el ancho disponible
  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(([e]) => setZoom(Math.max(0.3, (e.contentRect.width - 32) / w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);

  // El transformador sigue al elemento seleccionado
  useEffect(() => {
    const node = sel ? layerRef.current?.findOne("#" + sel) : undefined;
    trRef.current?.nodes(node ? [node] : []);
    trRef.current?.getLayer()?.batchDraw();
  }, [sel, els]);

  // Suprimir borra el elemento (salvo si se está escribiendo en un campo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (sel && (e.key === "Delete" || e.key === "Backspace") && !/INPUT|TEXTAREA/.test(t.tagName)) {
        setEls((a) => a.filter((x) => x.id !== sel));
        setSel(null);
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

  const addImage = (file: File | undefined) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const src = String(r.result);
      const i = new window.Image();
      i.onload = () => {
        const width = Math.min(100, w - 20);
        add({ id: uid(), type: "image", src, x: 10, y: 10, width, height: (width * i.height) / i.width, rotation: 0 });
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
    <div className="flex min-h-screen flex-col bg-neutral-100 text-neutral-900 md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-b border-black/10 bg-white p-4 md:w-72 md:border-r md:border-b-0">
        <h1 className="text-lg font-semibold">Editor libero (prova)</h1>

        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1 text-sm font-medium">Carta</legend>
          {(Object.keys(PAPERS) as Paper[]).map((p) => (
            <label key={p} className={`cursor-pointer rounded-lg px-2 py-1 text-xs ring-1 ${paper === p ? "bg-neutral-900 text-white ring-neutral-900" : "ring-black/15"}`}>
              <input type="radio" name="paper" className="sr-only" checked={paper === p} onChange={() => setPaper(p)} />
              {p} ({PAPERS[p].w} × {PAPERS[p].h} mm)
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <button className={btn} onClick={() => add({ id: uid(), type: "text", x: 20, y: 40, width: 100, height: 10, rotation: 0, text: "Testo", fontSize: 8, fill: "#173033" })}>
            + Testo
          </button>
          <button className={btn} onClick={() => add({ id: uid(), type: "rect", x: 20, y: 60, width: 60, height: 30, rotation: 0, fill: "#9ccfd0" })}>
            + Rettangolo
          </button>
          <label className={`${btn} cursor-pointer`}>
            + Immagine
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => { addImage(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>

        {cur ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium">Elemento selezionato</p>
            {cur.type === "text" && (
              <>
                <textarea className="rounded-lg border border-black/15 p-2" rows={3} value={cur.text} onChange={(e) => patch(cur.id, { text: e.target.value })} />
                <label className="flex items-center gap-2">
                  Dimensione
                  <input type="number" min={2} className="w-20 rounded-lg border border-black/15 p-1" value={Math.round(cur.fontSize * 10) / 10} onChange={(e) => patch(cur.id, { fontSize: Number(e.target.value) || 2 })} />
                  mm
                </label>
              </>
            )}
            {cur.type !== "image" && (
              <label className="flex items-center gap-2">
                Colore
                <input type="color" value={cur.fill} onChange={(e) => patch(cur.id, { fill: e.target.value })} />
              </label>
            )}
            <div className="flex gap-2">
              <button className={btn} onClick={() => setEls((a) => [...a.filter((x) => x.id !== cur.id), cur])}>Porta avanti</button>
              <button className={btn} onClick={() => { setEls((a) => a.filter((x) => x.id !== cur.id)); setSel(null); }}>Elimina</button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">Seleziona un elemento per modificarlo. Trascina, ridimensiona e ruota con le maniglie.</p>
        )}
      </aside>

      <main ref={wrap} className="flex flex-1 justify-center overflow-auto p-4">
        <div className="h-fit shadow-xl">
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
                const common = {
                  id: el.id,
                  x: el.x,
                  y: el.y,
                  width: el.width,
                  height: el.height,
                  rotation: el.rotation,
                  draggable: true,
                  onClick: () => setSel(el.id),
                  onTap: () => setSel(el.id),
                  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => patch(el.id, { x: e.target.x(), y: e.target.y() }),
                  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => onTransformEnd(e, el),
                };
                if (el.type === "text") return <Text key={el.id} {...common} text={el.text} fontSize={el.fontSize} fill={el.fill} fontFamily="system-ui, sans-serif" />;
                if (el.type === "rect") return <Rect key={el.id} {...common} fill={el.fill} />;
                return <ImageNode key={el.id} el={el} {...common} />;
              })}
              <Transformer ref={trRef} rotateEnabled keepRatio={false} boundBoxFunc={(o, n) => (n.width < 5 || n.height < 5 ? o : n)} />
            </Layer>
          </Stage>
        </div>
      </main>
    </div>
  );
}
