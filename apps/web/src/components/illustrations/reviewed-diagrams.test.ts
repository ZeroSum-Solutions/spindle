import { readdirSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DRAWINGS, ReviewedDiagram, drawingFor, type ReviewedDiagramContent } from "../learn/diagrams";
import { Drawing, placeMarkers, type DrawingSpec } from "./primitives";
import { CUFF_GEOMETRY } from "./shoulder-cuff";

const render = (content: ReviewedDiagramContent) => renderToStaticMarkup(createElement(ReviewedDiagram, { content }));
const legendFor = (spec: DrawingSpec) => Object.keys(spec.anchors).map((key) => ({ key, label: `Synthetic ${key}`, text: "Synthetic text." }));
const entries = Object.entries(DRAWINGS);

// At a 320px screen the figure is about 256px wide; a 28px marker (radius 14px) is then this many drawing units.
const markerRadius = (spec: DrawingSpec) => 14 * (spec.view.width / 256);

describe("reviewed diagrams: geometry in code, words from the lesson", () => {
  it.each(entries)("%s draws no words of its own", (_, spec) => {
    const html = renderToStaticMarkup(createElement(Drawing, { spec, alt: "Synthetic alt", caption: "Synthetic caption", legend: [] }));
    expect(html).toContain('role="img"');
    // Title and description come from the block: the caption names it, the alt describes it.
    expect(html).toMatch(/<title id="[^"]+">Synthetic caption<\/title>/);
    expect(html).toMatch(/<desc id="[^"]+">Synthetic alt<\/desc>/);
    // Apart from those, the drawing has no text at all: no <text>, no second <desc>, no markers without a legend.
    const withoutTitle = html.replace(/<title[^>]*>[^<]*<\/title>/, "").replace(/<desc[^>]*>[^<]*<\/desc>/, "");
    expect(withoutTitle).not.toMatch(/<text|<desc|<title|data-marker/);
    expect(withoutTitle.replace(/<[^>]*>/g, "")).toBe("");
    // Drawn, not embedded, in the house stroke.
    expect(html).not.toMatch(/<image|href="http|url\(http/);
    expect(html).toMatch(/stroke-width="1.75"/);
    expect(html).toMatch(/vector-effect="non-scaling-stroke"/);
  });

  it.each(entries)("%s keeps every marker inside the drawing and clear of the others at 320px", (_, spec) => {
    const r = markerRadius(spec);
    const anchors = Object.values(spec.anchors);
    for (const a of anchors) {
      expect(a.x - r).toBeGreaterThanOrEqual(0);
      expect(a.x + r).toBeLessThanOrEqual(spec.view.width);
      expect(a.y - r).toBeGreaterThanOrEqual(0);
      expect(a.y + r).toBeLessThanOrEqual(spec.view.height);
    }
    for (const [i, a] of anchors.entries()) {
      for (const b of anchors.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 * r);
    }
  });

  it.each(entries)("%s numbers its markers in legend order, as HTML at label size", (_, spec) => {
    const legend = legendFor(spec).reverse();
    const html = renderToStaticMarkup(createElement(Drawing, { spec, alt: "Synthetic alt", legend }));
    const placed = [...html.matchAll(/data-marker="(\d+)" data-anchor="([^"]+)"[^>]*class="[^"]*text-label[^"]*"[^>]*>(\d+)</g)].map((m) => [m[2], Number(m[3])]);
    expect(placed).toEqual(legend.map((item, i) => [item.key, i + 1]));
  });

  it("gives no marker to a legend key the drawing does not have, and does not resolve inherited names", () => {
    const spec = DRAWINGS["rotation-record-position"]!;
    expect(placeMarkers(spec, [{ key: "toString", label: "x", text: "" }, { key: "towel", label: "y", text: "" }])).toMatchObject([{ key: "towel", n: 2 }]);
    expect(drawingFor("toString")).toBeUndefined();
    expect(drawingFor("constructor")).toBeUndefined();
  });

  it("draws a leader line only for an anchor the legend uses", () => {
    const spec = DRAWINGS["rotation-record-position"]!;
    const without = renderToStaticMarkup(createElement(Drawing, { spec, alt: "Synthetic alt", legend: [] }));
    const withTowel = renderToStaticMarkup(createElement(Drawing, { spec, alt: "Synthetic alt", legend: [{ key: "towel", label: "Synthetic", text: "" }] }));
    expect(without).not.toContain('data-leader="towel"');
    expect(withTowel).toContain('data-leader="towel"');
  });

  it("renders the block's caption and legend, and keeps them when the id has no drawing", () => {
    const content: ReviewedDiagramContent = {
      diagramId: "synthetic-missing",
      alt: "Synthetic alt",
      caption: "Synthetic caption.",
      legend: [{ key: "a", label: "Synthetic label.", text: "Synthetic legend text." }],
    };
    const html = render(content);
    expect(html).toContain("This diagram is not available yet.");
    expect(html).not.toContain('data-diagram="available"');
    expect(html).toMatch(/<figcaption[^>]*>Synthetic caption\.<\/figcaption>/);
    expect(html).toMatch(/data-legend="a"[\s\S]*Synthetic label\.[\s\S]*Synthetic legend text\./);
    const drawn = render({ ...content, diagramId: "screen-start-positions", legend: [{ key: "screen-2", label: "Synthetic label.", text: "" }] });
    expect(drawn).toContain('data-diagram="available"');
    expect(drawn).toContain('data-anchor="screen-2"');
  });

  it("draws a left shoulder in both cuff views: the humerus is lateral to the socket on the subject's left", () => {
    // From the front the subject's left is on the viewer's right; from behind, on the viewer's left.
    expect(CUFF_GEOMETRY.front.head.x).toBeGreaterThan(CUFF_GEOMETRY.front.glenoid.x);
    expect(CUFF_GEOMETRY.back.head.x).toBeLessThan(CUFF_GEOMETRY.back.glenoid.x);
  });

  it("names the four cuff muscles as anchors, each with a leader to its muscle, and nothing else muscular", () => {
    const spec = DRAWINGS["shoulder-cuff"]!;
    const muscles = ["subscapularis", "supraspinatus", "infraspinatus", "teres-minor"];
    for (const m of muscles) expect(spec.anchors[m]?.leader).toBeDefined();
    const html = renderToStaticMarkup(createElement(Drawing, { spec, alt: "Synthetic alt", legend: [] }));
    expect([...html.matchAll(/data-muscle="([^"]+)"/g)].map((m) => m[1]).sort()).toEqual([...muscles].sort());
  });
});

it("names a drawing by its alt text when the block has no caption", () => {
  const html = renderToStaticMarkup(createElement(Drawing, { spec: DRAWINGS["shoulder-cuff"]!, alt: "Synthetic alt", caption: " ", legend: [] }));
  expect(html).toMatch(/<title id="[^"]+">Synthetic alt<\/title>/);
  expect(html).toMatch(/aria-labelledby="[^"]+-t" aria-describedby="[^"]+-d"/);
});

describe("cuff leaders end inside what they name", () => {
  // A leader that stops in empty space points at nothing (Sol R1 on #35: teres minor ended 13 units outside).
  const html = renderToStaticMarkup(createElement(Drawing, { spec: DRAWINGS["shoulder-cuff"]!, alt: "Synthetic alt", legend: [] }));
  const polygon = (muscle: string) => {
    const d = new RegExp(`<path d="([^"]+)"[^>]*data-muscle="${muscle}"`).exec(html)?.[1];
    if (!d) throw new Error(`no path for ${muscle}`);
    return [...d.matchAll(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
  };
  const inside = (pt: { x: number; y: number }, poly: { x: number; y: number }[]) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]!, b = poly[j]!;
      if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };
  const anchors = DRAWINGS["shoulder-cuff"]!.anchors as Record<string, { leader?: { to: { x: number; y: number } } }>;

  it.each(["subscapularis", "supraspinatus", "infraspinatus", "teres-minor"])("the %s leader ends inside that muscle", (muscle) => {
    const to = anchors[muscle]!.leader!.to;
    expect(inside(to, polygon(muscle)), `${muscle} leader end (${to.x}, ${to.y})`).toBe(true);
  });

  it("the humeral head leader ends inside the head", () => {
    const to = anchors["humeral-head"]!.leader!.to;
    const head = CUFF_GEOMETRY.front.head;
    expect(Math.hypot(to.x - head.x, to.y - head.y)).toBeLessThan(head.r);
  });
});

describe("the shoulder drafts' diagram blocks", () => {
  // Every diagram in the base curriculum drafts names a drawing that exists, and every legend
  // key names one of its anchors, so no marker silently goes missing.
  const dir = `${__dirname}/../../../../../content/shoulder/drafts`;
  const blocks = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => (JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).lesson.blocks as { kind: string; content: ReviewedDiagramContent }[]).filter((b) => b.kind === "diagram"));

  it("are all reviewed blocks with a drawing", () => {
    expect(blocks.length).toBe(8);
    for (const b of blocks) {
      expect(b.content.alt, b.content.diagramId).toBeTruthy();
      expect(drawingFor(b.content.diagramId), b.content.diagramId).toBeDefined();
    }
  });

  it.each(blocks.map((b) => [b.content.diagramId, b.content] as const))("%s: every legend key is an anchor of its drawing", (_, content) => {
    const spec = drawingFor(content.diagramId)!;
    expect(content.legend.length).toBeGreaterThan(0);
    for (const item of content.legend) expect(Object.keys(spec.anchors), item.key).toContain(item.key);
  });

  it("use the drafts' joint names: no diagram says ball-and-socket (#33 dropped it from lesson 1)", () => {
    for (const b of blocks) {
      const words = [b.content.alt, b.content.caption, ...b.content.legend.flatMap((l) => [l.label, l.text])].join(" ");
      expect(words, b.content.diagramId).not.toMatch(/ball[- ]and[- ]socket/i);
    }
    const front = blocks.find((b) => b.content.diagramId === "shoulder-complex-front")!.content;
    expect(front.legend.find((l) => l.key === "glenohumeral")?.label).toBe("Glenohumeral joint.");
  });
});
