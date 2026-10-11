import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DIAGRAMS, DiagramFigure } from "../learn/diagrams";
import { LayerStack } from "./layer-stack";
import { SHOULDER_GEOMETRY, SHOULDER_MARKERS } from "./shoulder";

const drawings: Record<string, string> = {
  ...Object.fromEntries(Object.entries(DIAGRAMS).map(([id, entry]) => [id, renderToStaticMarkup(createElement(DiagramFigure, { entry }))])),
  "layer-stack": renderToStaticMarkup(createElement(LayerStack, { brandName: "Acme Strength" })),
};

describe("original illustrations", () => {
  it.each(Object.entries(drawings))("%s is an accessible, self-contained SVG", (_, html) => {
    const svg = html.match(/<svg[^>]*>/)![0];
    expect(svg).toContain('role="img"');
    const [titleId, descId] = svg.match(/aria-labelledby="([^"]+)"/)![1]!.split(" ");
    expect(html).toMatch(new RegExp(`<title id="${titleId}">[^<]{10,}</title>`));
    expect(html).toMatch(new RegExp(`<desc id="${descId}">[^<]{40,}</desc>`));
    // Drawn, not embedded: no raster images, no external references.
    expect(html).not.toMatch(/<image|href="http|url\(http/);
    // Lucide-style strokes at a constant 1.75px.
    expect(html).toMatch(/stroke-width="1.75"/);
    expect(html).toMatch(/vector-effect="non-scaling-stroke"/);
  });

  it("numbers every marker in the shoulder diagram as HTML at label size, and keys each in the legend", () => {
    const html = drawings["shoulder-complex-front"]!;
    const markers = [...html.matchAll(/data-marker="(\d)"[^>]*class="[^"]*text-label[^"]*"[^>]*>(\d)</g)].map((m) => m[2]);
    expect(markers).toEqual(["1", "2", "3", "4"]);
    // No number is set inside the SVG, where it would shrink with the drawing.
    expect(html).not.toMatch(/<text[^>]*>\d<\/text>/);
    expect(html.match(/<li[ >]/g)).toHaveLength(4);
  });

  it("says which shoulder it is: the subject's left, seen from the front", () => {
    expect(drawings["shoulder-complex-front"]).toMatch(/<title[^>]*>The shoulder complex, left shoulder seen from the front<\/title>/);
  });

  it("makes no claim that the shoulder blade glides over the ribs", () => {
    expect(drawings["shoulder-complex-front"]).not.toMatch(/glid/i);
  });

  it("keeps the layer-stack notes out of the SVG, as HTML text at label size", () => {
    const html = drawings["layer-stack"]!;
    const svg = html.slice(html.indexOf("<svg"), html.indexOf("</svg>"));
    expect(svg).not.toContain("Your cues, your system, your name");
    expect(html).toMatch(/<dl class="[^"]*text-label[^"]*"[\s\S]*Your cues, your system, your name/);
  });

  it("names the brand it is given", () => {
    expect(drawings["layer-stack"]).toContain("Acme Strength base");
  });

  it("keeps marker 3 clear of the socket and the ball at the 320px scale, with a leader line", () => {
    // At 320px the drawing is about 256px wide; a 28px marker (radius 14px) is then about 24 drawing units.
    const unitsPerPx = SHOULDER_GEOMETRY.view.width / 256;
    const markerRadius = 14 * unitsPerPx;
    const m3 = SHOULDER_MARKERS.find((m) => m.n === 3)!;
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    expect(dist(m3, SHOULDER_GEOMETRY.glenoidMid)).toBeGreaterThan(markerRadius + 20);
    expect(dist(m3, SHOULDER_GEOMETRY.ball) - SHOULDER_GEOMETRY.ball.r).toBeGreaterThan(markerRadius);
    expect(m3.x + markerRadius).toBeLessThanOrEqual(SHOULDER_GEOMETRY.view.width);
    expect(drawings["shoulder-complex-front"]).toContain('data-leader="3"');
  });
});
