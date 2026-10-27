import type { NextRequest } from "next/server";

// Pixabay: imágenes con fondo transparente, uso comercial sin atribución. Clave gratis en pixabay.com/api/docs
type Hit = { id: number; previewURL: string; webformatURL: string };

export async function GET(req: NextRequest) {
  const key = process.env.PIXABAY_KEY;
  if (!key) return Response.json({ error: "nokey" }, { status: 503 });
  const p = req.nextUrl.searchParams;

  // ?img=: copia la imagen elegida a nuestro origen (el canvas no puede leer imágenes de otro dominio)
  const img = p.get("img");
  if (img) {
    let url: URL;
    try {
      url = new URL(img);
    } catch {
      return new Response(null, { status: 400 });
    }
    // Solo Pixabay: si no, cualquiera podría usar esta ruta para pedir URLs arbitrarias
    if (url.protocol !== "https:" || !["pixabay.com", "cdn.pixabay.com"].includes(url.hostname)) return new Response(null, { status: 400 });
    const r = await fetch(url, { redirect: "error" });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("image/")) return new Response(null, { status: 502 });
    return new Response(r.body, { headers: { "content-type": type, "cache-control": "public, max-age=86400" } });
  }

  const q = (p.get("q") ?? "").trim().slice(0, 100);
  if (!q) return Response.json([]);
  const api = new URL("https://pixabay.com/api/");
  api.search = new URLSearchParams({
    key,
    q,
    lang: p.get("lang") === "es" ? "es" : "it",
    colors: "transparent",
    safesearch: "true",
    per_page: "30",
  }).toString();
  const r = await fetch(api);
  if (!r.ok) return Response.json({ error: "upstream" }, { status: 502 });
  const { hits } = (await r.json()) as { hits: Hit[] };
  // Pixabay pide guardar en caché las búsquedas 24 h
  return Response.json(
    hits.map((h) => ({ id: h.id, thumb: h.previewURL, src: h.webformatURL })),
    { headers: { "cache-control": "public, s-maxage=86400" } },
  );
}
