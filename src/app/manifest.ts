import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Menudo",
    short_name: "Menudo",
    description: "Crea e stampa il tuo menù",
    lang: "it",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#68A7AD",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      // Sin "maskable": el icono ya tiene esquinas redondeadas y el texto llega al borde; Android lo recortaría
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
