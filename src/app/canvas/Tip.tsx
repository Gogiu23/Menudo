"use client";

import { useRef, useState } from "react";

/* Tooltip al pasar el ratón o al enfocar con teclado. Va en `fixed` y se coloca al abrir: así los paneles con
   overflow (que recortarían un tooltip absoluto) no lo cortan. Envuelve un botón o enlace. */
export function Tip({ label, hint, side = "bottom", children }: { label: string; hint?: string; side?: "right" | "bottom"; children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const show = () => {
    const r = ref.current!.getBoundingClientRect();
    // Abajo: centrado, sin salirse de la ventana (el tooltip mide como mucho 220 px)
    setAt(side === "right" ? { x: r.right + 8, y: r.top + r.height / 2 } : { x: Math.min(Math.max(r.left + r.width / 2, 116), window.innerWidth - 116), y: r.bottom + 8 });
  };
  return (
    <span ref={ref} className="relative inline-flex" onMouseEnter={show} onMouseLeave={() => setAt(null)} onFocus={show} onBlur={() => setAt(null)}>
      {children}
      {at && (
        <span
          role="tooltip"
          style={{ left: at.x, top: at.y }}
          className={`pointer-events-none fixed z-50 w-max max-w-[220px] rounded-lg bg-ink px-3 py-2 text-xs leading-snug text-surface shadow-lg ${side === "right" ? "-translate-y-1/2" : "-translate-x-1/2"}`}
        >
          <span className="block font-semibold">{label}</span>
          {hint && <span className="mt-0.5 block opacity-80">{hint}</span>}
        </span>
      )}
    </span>
  );
}
