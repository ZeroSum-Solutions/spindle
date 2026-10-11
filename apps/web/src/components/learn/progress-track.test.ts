import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressTrack, segmentsOf } from "./progress-track";

const html = (segments: Parameters<typeof ProgressTrack>[0]["segments"]) => renderToStaticMarkup(createElement(ProgressTrack, { segments }));

describe("ProgressTrack", () => {
  it("marks done lessons, the open lesson and the rest, in order", () => {
    const s = segmentsOf([{ state: "done" }, { state: "todo" }, { state: "credited" }, { state: "new" }], 1);
    expect(s).toEqual(["done", "current", "done", "rest"]);
    const out = html(s);
    expect(out).toContain("02 / 04");
    expect(out).toContain("50%");
    expect(out).toContain("Lesson 2 of 4, 2 done");
  });

  it("reads total of total when every lesson is done, never one past the end", () => {
    const out = html(segmentsOf([{ state: "done" }, { state: "done" }, { state: "credited" }]));
    expect(out).toContain("03 / 03");
    expect(out).toContain("3 of 3 lessons done");
    expect(out).not.toContain('data-segment="current"');
  });

  it("keeps the numbers for assistive technology and hides the decoration", () => {
    const out = html(["current", "rest"]);
    expect(out.match(/aria-hidden="true"/g)).toHaveLength(3);
    expect(out).toContain('class="sr-only">Lesson 1 of 2, 0 done');
  });

  it("keeps completion separate from position: revisiting a done lesson still counts it (Sol R1 on #53)", () => {
    const out = html(segmentsOf([{ state: "done" }, { state: "done" }, { state: "credited" }, { state: "done" }], 1));
    expect(out).toContain("02 / 04");
    expect(out).toContain("100%");
    expect(out).toContain("Lesson 2 of 4, 4 done");
    // The open lesson still shows as the current place.
    expect(out.match(/data-current="true"/g)).toHaveLength(1);
  });
});
