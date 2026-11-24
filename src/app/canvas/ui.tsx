/* Estilo del editor libre: réplica de las piezas de Editor.tsx (Icon, ICONS, botones, Group, Brand) para que /canvas
   se vea igual que el resto de la página. Se duplican aquí, y no se importan del editor, para no arrastrar todo su
   código a esta ruta ni tocar un archivo que cambia a menudo: si cambia el estilo del editor, cambia aquí también. */

import { SHAPES, type ShapeKind } from "./model";

export const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
export const input = `w-full rounded-lg border border-laguna bg-surface px-3 py-2.5 text-base placeholder:text-ink/40 md:py-2 md:text-[0.95em] focus:border-mare focus:outline-2 focus:outline-offset-0 focus:outline-mare/40`;
export const primary = `inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 font-semibold text-white lift hover:brightness-110 ${focus}`;
// relative: contiene el input sr-only (absolute) del botón de subir imagen
export const secondary = `relative inline-flex cursor-pointer items-center gap-2 rounded-lg border border-mare bg-surface px-3 py-2 text-sm font-semibold lift hover:bg-laguna/25 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink disabled:pointer-events-none disabled:opacity-40`;
export const iconBtn = `grid size-11 shrink-0 place-items-center rounded-lg text-ink/70 lift hover:bg-laguna/30 hover:text-ink disabled:pointer-events-none disabled:opacity-25 md:size-9 ${focus}`;
// Opciones excluyentes (papel, copias): pastilla gris azulada, y con el degradado de la marca cuando está elegida
export const chip = `inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-laguna/30 px-3 py-1.5 text-sm font-semibold lift hover:bg-laguna/45 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink`;
export const chipOn = `inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white lift hover:brightness-110 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink`;

export const ICONS = {
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  left: "M15 6l-6 6 6 6",
  right: "M9 6l6 6-6 6",
  text: "M5 7V4h14v3M12 4v16M9 20h6",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  plus: "M12 5v14M5 12h14",
  print: "M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5a.5.5 0 1 0 0-1",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.6 7.6A17 17 0 0 0 2 12s4 6 10 6c1.4 0 2.700-.3 3.900-.8M9.900 9.900a3 3 0 0 0 4.200 4.200",
  lock: "M6 11h12v9H6zM8.500 11V8a3.500 3.500 0 0 1 7 0v3",
  unlock: "M6 11h12v9H6zM8.500 11V8a3.500 3.500 0 0 1 6.800-1.200",
  archive: "M3 4h18v4H3zM5 8v12h14V8M10 12h4",
  close: "M6 6l12 12M18 6L6 18",
  sun: "M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  reset: "M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4",
  zoomIn: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5M8 11h6M11 8v6",
  zoomOut: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5M8 11h6",
  alignLeft: "M4 6h16M4 10h10M4 14h16M4 18h10",
  alignCenter: "M4 6h16M7 10h10M4 14h16M7 18h10",
  alignRight: "M4 6h16M10 10h10M4 14h16M10 18h10",
  design: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  // Propios del editor libre
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  rect: "M4 6h16v12H4z",
  circle: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z",
  line: "M4 12h16",
  dots: "M4 12h.01M9 12h.01M14 12h.01M19 12h.01",
  pages: "M8 4h11v14H8zM5 7v14h11",
  copy: "M9 9h11v11H9zM5 15V4h11",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.500l9 5 9-5",
  save: "M5 4h12l3 3v13H5zM8 4v5h8V4M8 20v-6h8v6",
  sheet: "M4 4h16v16H4zM12 4v16M4 12h16",
  canvas: "M3 4h18v16H3zM3 9h18M9 9v11",
  tools: "M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M8 15v4",
  select: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
  group: "M4 4h7v7H4zM13 13h7v7h-7zM11 7.500h2.500a1.500 1.500 0 0 1 1.500 1.500v4",
  ungroup: "M4 4h7v7H4zM13 13h7v7h-7z",
};

export function ShapeIcon({ kind, className = "size-7" }: { kind: ShapeKind; className?: string }) {
  const sh = SHAPES[kind];
  return (
    <svg viewBox={`0 0 ${sh.vb} ${sh.vb}`} aria-hidden className={className} fill={sh.stroke ? "none" : "currentColor"} fillRule="evenodd" stroke={sh.stroke ? "currentColor" : "none"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={sh.d} />
    </svg>
  );
}

export function Icon({ d, className = "size-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function Brand() {
  return (
    <p className="flex shrink-0 items-center gap-2 text-[17px] leading-none font-semibold tracking-tight">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" className="size-7 rounded-md" />
      Menudo
    </p>
  );
}

// Sección plegable del panel, como las de Editor.tsx en pantallas estrechas
export function Group({ title, icon, open, children }: { title: string; icon: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="group border-b border-laguna/50" open={open}>
      <summary className={`flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-2.5 transition-colors hover:bg-laguna/15 [&::-webkit-details-marker]:hidden ${focus}`}>
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-laguna/25 text-mare transition-colors group-open:bg-brand group-open:text-white">
          <Icon d={icon} className="size-4" />
        </span>
        <h2 className="flex-1 text-[13px] leading-tight font-semibold">{title}</h2>
        <Icon d={ICONS.down} className="size-4 shrink-0 text-ink/50 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </details>
  );
}

// Bloque con título dentro del panel de propiedades: separa Azioni, Posizione, Testo, Colore y Aspetto
export function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b border-laguna/50 px-4 py-4">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export function Num({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs font-semibold md:text-[13px]">
      {label}
      <input
        type="number" step="any" min={min}
        className="w-20 rounded-lg border border-laguna bg-surface px-2 py-1.5 text-sm font-normal tabular-nums md:py-1 focus:border-mare focus:outline-2 focus:outline-offset-0 focus:outline-mare/40"
        value={Math.round(value * 10) / 10}
        onChange={(e) => onChange(Math.max(min ?? -Infinity, Number(e.target.value) || 0))}
      />
    </label>
  );
}
