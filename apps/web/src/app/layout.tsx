import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Newsreader } from "next/font/google";
import "./globals.css";

// Spindle's own faces (SIL Open Font License 1.1; licences in docs/design/spindle/assets/), self-hosted
// by next/font at build time. Archivo carries headings (condensed through its width axis) and the UI,
// Newsreader carries long reading text, IBM Plex Mono carries numerals, eyebrows and identifiers.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], axes: ["opsz"], style: ["normal", "italic"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Spindle",
  description: "Learn the body your clients bring in.",
};

export const viewport: Viewport = {
  themeColor: "#f3efe6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${newsreader.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
