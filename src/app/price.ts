const EUR = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

// «6,50» / «6.5» / «12» → «6,50 €» / «12,00 €». Lo que no es un número («s.q.», «da 10») se deja tal cual.
// ponytail: «6.500» se lee como 6,5 (no como miles); con precios de carta no hace falta más
export function formatPrice(raw: string): string {
  const t = raw.replace(/€/g, "").trim();
  if (!t) return "";
  const norm = (t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t).replace(/\s/g, "");
  const n = Number(norm);
  return /\d/.test(t) && Number.isFinite(n) ? EUR.format(n) : raw.trim();
}
