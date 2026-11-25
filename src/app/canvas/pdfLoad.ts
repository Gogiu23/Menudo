import type { El, Paper } from "./model";
import { buildPage, nearestPaper, type PdfText } from "./pdfImport";

/* Lee un PDF en el navegador (nada sale del dispositivo): pinta cada página con pdfjs y saca sus textos.
   pdfjs se carga solo aquí, con import() dinámico, para que no pese en el resto del editor. */

export const MAX_PAGES = 10;
export const MAX_BYTES = 15 * 1024 * 1024;
const BG_PX = 1400; // ancho del fondo en px: nítido en pantalla y pequeño para localStorage

export type PdfError = "big" | "password" | "invalid";
export const pdfError = (code: PdfError) => Object.assign(new Error(code), { code });

// paper = null: se elige el papel A más parecido a la primera página
export async function readPdf(file: File, paper: Paper | null): Promise<{ pages: El[][]; paper: Paper; total: number; textless: boolean }> {
  if (file.size > MAX_BYTES) throw pdfError("big");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  let doc;
  try {
    // fontExtraProperties: sin él, pdfjs no da el nombre real de la fuente (lo necesitamos para elegir la del editor)
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), fontExtraProperties: true }).promise;
  } catch (e) {
    throw pdfError((e as Error)?.name === "PasswordException" ? "password" : "invalid");
  }
  try {
    const pages: El[][] = [];
    let target = paper;
    let textless = true;
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      target ??= nearestPaper(vp.width, vp.height);
      const scale = Math.min(BG_PX / vp.width, (BG_PX * 1.5) / vp.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width * scale);
      canvas.height = Math.round(vp.height * scale);
      await page.render({ canvas, viewport: page.getViewport({ scale }) }).promise;
      const tc = await page.getTextContent();
      // El nombre real de la fuente (p. ej. «Lora-Italic») está en el objeto de fuente cargado al pintar
      const fontOf = (id: string) => {
        try {
          const f = page.commonObjs.get(id) as { name?: string; bold?: boolean; black?: boolean; italic?: boolean } | null;
          // mapFont lee negrita y cursiva del nombre: se añaden si pdfjs las detectó por otra vía (flags de la fuente)
          return [f?.name || tc.styles[id]?.fontFamily || "", f?.bold || f?.black ? "Bold" : "", f?.italic ? "Italic" : ""].join(" ");
        } catch {
          return tc.styles[id]?.fontFamily || "";
        }
      };
      const items: PdfText[] = [];
      for (const it of tc.items) {
        if (!("str" in it) || !it.str.trim()) continue;
        const m = pdfjs.Util.transform(vp.transform, it.transform) as number[];
        if (Math.abs(m[1]) > 1e-3 || Math.abs(m[2]) > 1e-3) continue; // texto girado: se queda en el fondo
        items.push({ str: it.str, x: m[4], y: m[5], w: it.width, size: Math.abs(m[3]), font: fontOf(it.fontName) });
      }
      if (items.length) textless = false;
      const g = canvas.getContext("2d")!;
      const img = g.getImageData(0, 0, canvas.width, canvas.height);
      const src = canvas.toDataURL("image/jpeg", 0.75);
      pages.push(buildPage({ src, items, wPt: vp.width, hPt: vp.height, paper: target, px: img, scale }));
      page.cleanup();
      canvas.width = canvas.height = 0; // libera la memoria del canvas en Safari
    }
    return { pages, paper: target ?? "A4", total: doc.numPages, textless };
  } finally {
    void doc.loadingTask.destroy(); // cierra el worker y libera la memoria del documento
  }
}
