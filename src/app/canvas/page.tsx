"use client";

import dynamic from "next/dynamic";

// Konva necesita el DOM: solo cliente
const Gate = dynamic(() => import("./Gate"), { ssr: false });

export default function CanvasPage() {
  return <Gate />;
}
