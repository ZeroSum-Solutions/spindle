import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DRAWINGS } from "../learn/diagrams";
import { LayerStack } from "./layer-stack";
import { Drawing } from "./primitives";
import { SHOULDER_GEOMETRY } from "./shoulder";

describe("the landing layer stack", () => {
  const html = renderToStaticMarkup(createElement(LayerStack, { brandName: "Acme Strength" }));

  it("keeps the notes out of the SVG, as HTML text at label size", () => {
    const svg = html.slice(html.indexOf("<svg"), html.indexOf("</svg>"));
    expect(svg).not.toContain("Your cues, your system, your name");
    expect(html).toMatch(/<dl class="[^"]*text-label[^"]*"[\s\S]*Your cues, your system, your name/);
  });

  it("names the brand it is given", () => {
    expect(html).toContain("Acme Strength base");
  });
});

describe("the shoulder complex drawing", () => {
  const spec = DRAWINGS["shoulder-complex-front"]!;
  const legend = ["sternoclavicular", "acromioclavicular", "glenohumeral", "scapula"].map((key) => ({ key, label: `Synthetic ${key}`, text: "" }));

  it("numbers its four places from the block's legend, with a leader to the ball and socket", () => {
    const html = renderToStaticMarkup(createElement(Drawing, { spec, alt: "Synthetic alt", legend }));
    expect([...html.matchAll(/data-marker="(\d)" data-anchor="([a-z]+)"/g)].map((m) => [m[1], m[2]])).toEqual(legend.map((l, i) => [String(i + 1), l.key]));
    expect(html).toContain('data-leader="glenohumeral"');
    // No number is set inside the SVG, where it would shrink with the drawing.
    expect(html).not.toMatch(/<text[^>]*>\d<\/text>/);
  });

  it("keeps the glenohumeral marker clear of the socket and the ball at the 320px scale", () => {
    // At 320px the drawing is about 256px wide; a 28px marker (radius 14px) is then about 24 drawing units.
    const markerRadius = 14 * (SHOULDER_GEOMETRY.view.width / 256);
    const m = spec.anchors.glenohumeral!;
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    expect(dist(m, SHOULDER_GEOMETRY.glenoidMid)).toBeGreaterThan(markerRadius + 20);
    expect(dist(m, SHOULDER_GEOMETRY.ball) - SHOULDER_GEOMETRY.ball.r).toBeGreaterThan(markerRadius);
    expect(m.x + markerRadius).toBeLessThanOrEqual(SHOULDER_GEOMETRY.view.width);
  });
});
