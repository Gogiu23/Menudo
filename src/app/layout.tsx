import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Titillium_Web } from "next/font/google";
import "./globals.css";

const bodoni = Bodoni_Moda({ variable: "--font-bodoni", subsets: ["latin"], style: ["normal", "italic"] });
const titillium = Titillium_Web({
  variable: "--font-titillium",
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Menudo",
  description: "Crea e stampa il tuo menù",
  appleWebApp: { capable: true, title: "Menudo", statusBarStyle: "default" },
};

// viewport-fit=cover: necesario para env(safe-area-inset-*) en iPhone con notch/Dynamic Island
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#68A7AD",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      className={`${bodoni.variable} ${titillium.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
