import type { MetadataRoute } from "next";

/** The web app manifest: Spindle's name, Pressroom colours and the cut-disc icon (DESIGN.md › Brand). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Spindle",
    short_name: "Spindle",
    description: "Learn the body your clients bring in.",
    start_url: "/gyms",
    display: "standalone",
    background_color: "#f3efe6",
    theme_color: "#f3efe6",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
