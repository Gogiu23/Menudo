/* Tooltip solo con CSS: aparece al pasar el ratón o al enfocar con teclado. Envuelve un botón o enlace. */
export function Tip({ label, hint, side = "bottom", children }: { label: string; hint?: string; side?: "right" | "bottom"; children: React.ReactNode }) {
  const pos = side === "right" ? "left-full top-1/2 ml-2 -translate-y-1/2" : "top-full left-1/2 mt-2 -translate-x-1/2";
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 w-max max-w-[220px] rounded-lg bg-ink px-3 py-2 text-xs leading-snug text-surface opacity-0 shadow-lg transition-opacity duration-150 group-focus-within/tip:opacity-100 group-hover/tip:opacity-100 ${pos}`}
      >
        <span className="block font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block opacity-80">{hint}</span>}
      </span>
    </span>
  );
}
