"use client";

import dynamic from "next/dynamic";

// Konva necesita el DOM: solo cliente
const CanvasEditor = dynamic(() => import("./CanvasEditor"), { ssr: false });

export default function CanvasPage() {
  return <CanvasEditor />;
}
