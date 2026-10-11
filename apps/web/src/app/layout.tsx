import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { ThemeScript } from "@/components/theme/theme-script";
import "./globals.css";

// Spindle's Lab faces (SIL Open Font License 1.1; licences in docs/design/spindle/assets/), self-hosted
// by next/font at build time. Archivo carries headings at its widest (the width axis), IBM Plex Sans
// carries the UI and long reading text, IBM Plex Mono carries numerals, readouts and eyebrows.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Spindle",
  description: "Learn the body your clients bring in.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d12" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The head script may set data-theme before React hydrates, so <html> is allowed to differ from the server render.
    <html lang="en" suppressHydrationWarning className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
