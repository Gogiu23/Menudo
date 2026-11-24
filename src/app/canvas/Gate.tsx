"use client";

import Link from "next/link";
import { useState } from "react";
import CanvasEditor from "./CanvasEditor";

// La misma sesión que usa el editor principal (SESSION_KEY en Editor.tsx): sin ella no se abre el editor libre
const SESSION_KEY = "menudo:session";

export default function Gate() {
  const [logged] = useState(() => {
    try {
      return !!localStorage.getItem(SESSION_KEY);
    } catch {
      return false;
    }
  });
  if (logged) return <CanvasEditor />;
  return (
    <main className="grid min-h-screen place-items-center bg-surface p-6 text-center text-ink">
      <div className="max-w-sm space-y-4">
        <p>Accedi dall&apos;editor principale per usare l&apos;editor libero.</p>
        <p className="text-ink/65">Inicia sesión en el editor principal para usar el editor libre.</p>
        <Link href="/" className="inline-block rounded-lg bg-brand px-4 py-2 font-semibold text-white">
          Menudo
        </Link>
      </div>
    </main>
  );
}
