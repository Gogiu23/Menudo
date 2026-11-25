"use client";

import { useEffect, useId, useState } from "react";
import Konva from "konva";
import { El, fontFamily, fontStyleOf, Grad, gradEnd, gradPoints, PAPERS, Paper, SHAPES, tilePattern, tileScale } from "./model";

/* Una página del editor libre dibujada en SVG (en mm), para el editor normal: vista previa, impresión y miniaturas.
   Reproduce lo que pinta Konva en el lienzo: los renglones del texto los calcula el propio Konva (mismo corte de línea)
   y se colocan en su misma línea base. SVG y no un <canvas>: nítido con cualquier zoom y al imprimir. */

// Se vuelve a medir cuando terminan de cargar las fuentes (si no, los renglones se calcularían con la de reserva)
function useFontsTick() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const bump = () => alive && setN((x) => x + 1);
    document.fonts.ready.then(bump);
    document.fonts.addEventListener("loadingdone", bump);
    return () => {
      alive = false;
      document.fonts.removeEventListener("loadingdone", bump);
    };
  }, []);
  return n;
}

const tileUrls = new Map<string, string>();
const tileUrl = (color: string) => {
  let u = tileUrls.get(color);
  if (!u) tileUrls.set(color, (u = tilePattern(color).toDataURL()));
  return u;
};

// Degradado lineal en coordenadas de la caja (como fillGrad/strokeGrad de model.ts)
function LinearGrad({ id, color, g, w, h, oy = 0 }: { id: string; color: string; g: Grad; w: number; h: number; oy?: number }) {
  const { start, end } = gradPoints(w, h, g.angle);
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={start.x} y1={start.y + oy} x2={end.x} y2={end.y + oy}>
      <stop offset={g.from ?? 0} stopColor={color} />
      <stop offset={1} stopColor={gradEnd(color, g.to)} />
    </linearGradient>
  );
}

type Metrics = { fontBoundingBoxAscent?: number; fontBoundingBoxDescent?: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number };

function TextSvg({ el, uid, table }: { el: Extract<El, { type: "text" }>; uid: string; table?: string }) {
  const text = el.table && table !== undefined ? table : el.text;
  const lh = el.lineHeight ?? 1.2;
  const font = fontFamily(el.fontFamily);
  // Konva parte el texto con sus propias medidas: se le pide el resultado
  const k = new Konva.Text({ text, width: el.width, fontSize: el.fontSize, fontFamily: font, fontStyle: fontStyleOf(el), lineHeight: lh, align: el.align });
  const lines = k.textArr;
  const m = (k as unknown as { measureSize: (s: string) => Metrics }).measureSize("M");
  k.destroy();
  const lhPx = lh * el.fontSize;
  const base = ((m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent) - (m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent)) / 2 + lhPx / 2;
  const gid = `${uid}g`;
  return (
    <>
      {el.grad && <defs><LinearGrad id={gid} color={el.fill} g={el.grad} w={el.width} h={lhPx * Math.max(1, text.split("\n").length)} /></defs>}
      <text
        fill={el.grad ? `url(#${gid})` : el.fill} fontFamily={font} fontSize={el.fontSize} fontWeight={el.bold ? 700 : 400} fontStyle={el.italic ? "italic" : "normal"}
        textDecoration={el.underline ? "underline" : undefined} xmlSpace="preserve"
      >
        {lines.map((l, i) => (
          <tspan key={i} x={el.align === "right" ? el.width - l.width : el.align === "center" ? (el.width - l.width) / 2 : 0} y={base + i * lhPx}>
            {l.text}
          </tspan>
        ))}
      </text>
    </>
  );
}

function ElSvg({ el, uid, table }: { el: El; uid: string; table?: string }) {
  const gid = `${uid}g`;
  switch (el.type) {
    case "text":
      return <TextSvg el={el} uid={uid} table={table} />;
    case "rect": {
      const paint = el.grad ? `url(#${gid})` : el.fill;
      return (
        <>
          {el.grad && <defs><LinearGrad id={gid} color={el.fill} g={el.grad} w={el.width} h={el.height} /></defs>}
          {el.hollow ? (
            <rect width={el.width} height={el.height} rx={el.radius} fill="none" stroke={paint} strokeWidth={el.borderW ?? 1} />
          ) : (
            <rect width={el.width} height={el.height} rx={el.radius} fill={paint} stroke={el.stroke} strokeWidth={el.stroke ? el.strokeW : undefined} />
          )}
        </>
      );
    }
    case "line":
      return (
        <>
          {el.grad && <defs><LinearGrad id={gid} color={el.fill} g={el.grad} w={el.width} h={el.thickness} oy={-el.thickness / 2} /></defs>}
          <line x1={0} y1={0} x2={el.width} y2={0} stroke={el.grad ? `url(#${gid})` : el.fill} strokeWidth={el.thickness} strokeLinecap="round" strokeDasharray={el.dash ? `0.01 ${el.thickness * 2}` : undefined} />
        </>
      );
    case "shape": {
      const d = SHAPES[el.kind];
      if (!d) return null;
      const paint = el.grad ? `url(#${gid})` : el.fill;
      // mismo grosor que ShapeNode: 1,7 en los iconos de línea; el borde de las huecas, de mm a unidades del trazado
      const sw = d.stroke ? 1.7 : el.hollow ? Math.max(0.2, (el.borderW ?? 1) / ((el.width + el.height) / 2 / d.vb)) : 0;
      return (
        <g transform={`scale(${el.width / d.vb} ${el.height / d.vb})`}>
          {el.grad && <defs><LinearGrad id={gid} color={el.fill} g={el.grad} w={d.vb} h={d.vb} /></defs>}
          <path d={d.d} fillRule="evenodd" fill={d.stroke || el.hollow ? "none" : paint} stroke={sw ? paint : undefined} strokeWidth={sw || undefined} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    }
    case "image": {
      const r = Math.max(0, Math.min(el.radius ?? 0, el.width / 2, el.height / 2));
      return (
        <>
          {r > 0 && <defs><clipPath id={`${uid}c`}><rect width={el.width} height={el.height} rx={r} /></clipPath></defs>}
          <image href={el.src} width={el.width} height={el.height} preserveAspectRatio="none" clipPath={r > 0 ? `url(#${uid}c)` : undefined} />
        </>
      );
    }
    case "tiles": {
      const c = tilePattern(el.fill);
      const sc = tileScale(el.k);
      return (
        <>
          <defs>
            <pattern id={`${uid}p`} patternUnits="userSpaceOnUse" width={c.width * sc} height={c.height * sc}>
              <image href={tileUrl(el.fill)} width={c.width * sc} height={c.height * sc} />
            </pattern>
          </defs>
          <rect width={el.width} height={el.height} fill={`url(#${uid}p)`} />
        </>
      );
    }
  }
}

/** Una página del diseño libre. Ocupa todo el ancho y alto de su caja (viewBox en mm del papel).
 *  table: texto de los números de mesa de esta copia (sin él se ve el marcador tenue, como en el lienzo). */
export function FreeSvg({ page, paper, bg, bgGrad, table, className }: { page: El[]; paper: Paper; bg: string; bgGrad?: Grad; table?: string; className?: string }) {
  useFontsTick();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { w, h } = PAPERS[paper];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className={className} style={{ display: "block", width: "100%", height: "100%" }} aria-hidden>
      {bgGrad && <defs><LinearGrad id={`${id}bg`} color={bg} g={bgGrad} w={w} h={h} /></defs>}
      <rect width={w} height={h} fill={bgGrad ? `url(#${id}bg)` : bg} />
      {page.map((el, i) =>
        el.visible ? (
          <g key={el.id} transform={`translate(${el.x} ${el.y})${el.rotation ? ` rotate(${el.rotation})` : ""}`} opacity={el.type === "text" && el.table && table !== undefined ? 1 : el.opacity}>
            <ElSvg el={el} uid={`${id}e${i}`} table={table} />
          </g>
        ) : null,
      )}
    </svg>
  );
}
