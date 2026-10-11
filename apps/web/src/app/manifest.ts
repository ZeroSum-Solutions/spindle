import type { MetadataRoute } from "next";

/** The web app manifest: Spindle's name, Lab midnight and the cut-d icon on the signal tile (DESIGN.md › Brand). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Spindle",
    short_name: "Spindle",
    description: "Learn the body your clients bring in.",
    start_url: "/gyms",
    display: "standalone",
    background_color: "#0b0d12",
    theme_color: "#0b0d12",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
