import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DIAGRAMS, DiagramFigure } from "../learn/diagrams";
import { LayerStack } from "./layer-stack";

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

  it("numbers every marker in the shoulder diagram and keys each in the legend", () => {
    const html = drawings["shoulder-complex-front"]!;
    const markers = [...html.matchAll(/<text[^>]*>(\d)<\/text>/g)].map((m) => m[1]);
    expect(markers).toEqual(["1", "2", "3", "4"]);
    expect(html.match(/<li/g)).toHaveLength(4);
  });

  it("names the brand it is given", () => {
    expect(drawings["layer-stack"]).toContain("Acme Strength base");
  });
});
