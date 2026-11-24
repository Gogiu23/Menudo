import { useEffect, type RefObject } from "react";

/* Brillo que sigue al ratón: cada elemento con la clase `glow` (ver globals.css) recibe la posición del cursor en sus
   variables --gx/--gy y se ilumina (borde y fondo) cuando el cursor está cerca, incluso desde fuera. Un solo listener en
   el contenedor, que además guarda la posición para el foco de luz de los fondos (.glow-bg). No se activa con pantalla táctil ni con «reducir movimiento». */
export function useGlow(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || matchMedia("(hover: none), (prefers-reduced-motion: reduce)").matches) return;
    const REACH = 140; // px de distancia a los que ya se nota el brillo
    let raf = 0;
    const glows = () => el.querySelectorAll<HTMLElement>(".glow");
    const onMove = (e: PointerEvent) => {
      // foco de luz de los fondos: coordenadas de la ventana, una sola vez
      el.style.setProperty("--px", `${e.clientX}px`);
      el.style.setProperty("--py", `${e.clientY}px`);
      el.style.setProperty("--po", "1");
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        glows().forEach((n) => {
          const r = n.getBoundingClientRect();
          const x = e.clientX - r.left;
          const y = e.clientY - r.top;
          const near = x > -REACH && x < r.width + REACH && y > -REACH && y < r.height + REACH;
          n.style.setProperty("--gx", `${x}px`);
          n.style.setProperty("--gy", `${y}px`);
          n.style.setProperty("--go", near ? "1" : "0");
        });
      });
    };
    const off = () => {
      el.style.setProperty("--po", "0");
      glows().forEach((n) => n.style.setProperty("--go", "0"));
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", off);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", off);
    };
  }, [root]);
}
