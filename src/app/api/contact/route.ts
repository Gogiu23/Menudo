import type { NextRequest } from "next/server";

// Formulario «Contactar»: el correo sale del servidor con Resend (integración de Vercel, RESEND_API_KEY).
// El destinatario solo vive aquí: nunca llega al navegador
const TO = "dominicigiuliano@bookdeundes.com";
// Sin dominio verificado en Resend, solo se puede enviar desde su remitente de pruebas
const FROM = process.env.CONTACT_FROM ?? "Menudo <onboarding@resend.dev>";

// ponytail: límite por IP en memoria de la instancia (Fluid Compute la reutiliza); se reinicia con cada
// instancia nueva. Si llega spam de verdad, pasar a Vercel Firewall (rate limiting) o a un KV
const hits = new Map<string, number[]>();
const LIMIT = 5;
const HOUR = 60 * 60 * 1000;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: NextRequest) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return Response.json({ error: "nokey" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad" }, { status: 400 });
  }
  // Campo trampa: invisible para las personas, los bots lo rellenan. Se responde «ok» sin enviar nada
  if (clean(body.website, 200)) return Response.json({ ok: true });

  const name = clean(body.name, 100).replace(/[\r\n]+/g, " ");
  const email = clean(body.email, 200);
  const message = clean(body.message, 5000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 5) return Response.json({ error: "bad" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "?";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < HOUR);
  if (recent.length >= LIMIT) return Response.json({ error: "limit" }, { status: 429 });
  hits.set(ip, [...recent, now]);

  // Texto plano: lo que escribe el usuario nunca se interpreta como HTML
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [TO],
      reply_to: email,
      subject: `Menudo · ${name || email}`,
      text: `${message}\n\n— ${name || "(sin nombre)"} <${email}>`,
    }),
  });
  if (!r.ok) return Response.json({ error: "upstream" }, { status: 502 });
  return Response.json({ ok: true });
}
