"use client";

import { useRef, useState } from "react";
import type { Tr } from "./i18n";
import { focus, Icon, ICONS, input, primary } from "./ui";

/* Busca PNG transparentes en Pixabay (vía /api/images, la misma ruta del editor principal) y entrega el elegido como archivo.
   Va sin <form> porque las secciones del carril ya están dentro de uno. */
type Hit = { id: number; thumb: string; src: string };
const MSG = {
  searching: "Cerco…",
  noResults: "Nessun risultato. Prova con un'altra parola.",
  searchError: "Ricerca non riuscita. Riprova tra poco.",
  addError: "Non sono riuscito ad aggiungere l'immagine.",
  nokey: "La ricerca di immagini non è attiva: manca la chiave PIXABAY_KEY nel server.",
};

export function ImageSearch({ onPick, tr, lang }: { onPick: (f: File) => void; tr: Tr; lang: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [status, setStatus] = useState<keyof typeof MSG | "">("");
  const [adding, setAdding] = useState<number | null>(null);

  const last = useRef(0); // número de la última búsqueda: una respuesta atrasada no pisa a la nueva
  const search = async () => {
    if (!q.trim() || status === "searching") return;
    const n = ++last.current;
    setStatus("searching");
    try {
      const r = await fetch(`/api/images?lang=${lang}&q=${encodeURIComponent(q)}`);
      const data = await r.json();
      if (n !== last.current) return;
      if (!r.ok) return setStatus(data.error === "nokey" ? "nokey" : "searchError");
      setHits(data);
      setStatus(data.length ? "" : "noResults");
    } catch {
      if (n === last.current) setStatus("searchError");
    }
  };

  const pick = async (h: Hit) => {
    setAdding(h.id);
    try {
      const r = await fetch(`/api/images?img=${encodeURIComponent(h.src)}`);
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      onPick(new File([blob], "immagine", { type: blob.type }));
    } catch {
      setStatus("addError");
    }
    setAdding(null);
  };

  return (
    <div role="search" className="space-y-3">
      <div className="flex gap-2">
        <div className="glow glow-soft min-w-0 flex-1 rounded-lg">
          <Icon d={ICONS.search} className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink/50" />
        <input
          className={`${input} pl-9`} type="search" aria-label={tr("Cerca immagini")} placeholder={tr("Es. pizza")} value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }}
        />
        </div>
        <button type="button" className={`${primary} px-3`} disabled={status === "searching"} onClick={search}>{tr("Cerca")}</button>
      </div>
      <p className="text-sm text-ink/70" aria-live="polite">{status && tr(MSG[status])}</p>
      {hits.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {hits.map((h) => (
              <button
                key={h.id} type="button" aria-label={tr("Aggiungi immagine")} disabled={adding !== null} onClick={() => pick(h)}
                className={`glow glow-soft aspect-square rounded-lg bg-[repeating-conic-gradient(#e5eef0_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-1 ring-1 ring-laguna transition hover:ring-2 hover:ring-mare disabled:opacity-40 ${focus}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de Pixabay, no hay nada que optimizar */}
                <img src={h.thumb} alt="" loading="lazy" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
          {/* Pixabay exige indicar el origen junto a los resultados */}
          <a href="https://pixabay.com/" target="_blank" rel="noreferrer" className="text-sm text-ink/70 underline underline-offset-2">{tr("Immagini da Pixabay")}</a>
        </>
      )}
    </div>
  );
}
