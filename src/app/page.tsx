"use client";

import dynamic from "next/dynamic";

// Solo cliente: el editor lee localStorage al iniciar
const Editor = dynamic(() => import("./Editor"), { ssr: false });

export default function Home() {
  return <Editor />;
}
