import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Dancing_Script, Great_Vibes, IBM_Plex_Sans, Lora, Montserrat, Playfair_Display, Titillium_Web } from "next/font/google";
import "./globals.css";

// Letra de la interfaz del editor
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600"] });
const bodoni = Bodoni_Moda({ variable: "--font-bodoni", subsets: ["latin"], style: ["normal", "italic"] });
const titillium = Titillium_Web({
  variable: "--font-titillium",
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  style: ["normal", "italic"],
});
// Tipos de letra que se pueden elegir en el menú (FONTS en Editor.tsx)
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], style: ["normal", "italic"] });
const lora = Lora({ variable: "--font-lora", subsets: ["latin"], style: ["normal", "italic"] });
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], style: ["normal", "italic"] });
const greatVibes = Great_Vibes({ variable: "--font-greatvibes", subsets: ["latin"], weight: "400" });
const dancing = Dancing_Script({ variable: "--font-dancing", subsets: ["latin"] });
const fonts = [plex, bodoni, titillium, playfair, lora, montserrat, greatVibes, dancing].map((f) => f.variable).join(" ");

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
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      className={`${fonts} h-full antialiased`}
    >
      <head>
        {/* beforeinstallprompt llega una sola vez y puede hacerlo antes de que cargue el editor (va en un chunk aparte):
            se recoge aquí, lo primero, y el aviso de instalación lo lee de window.__installEvent (Editor.tsx) */}
        <script
          dangerouslySetInnerHTML={{
            __html: 'addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__installEvent=e});',
          }}
        />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
