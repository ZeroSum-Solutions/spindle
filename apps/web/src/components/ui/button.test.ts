import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

const render = (loading: boolean) => renderToStaticMarkup(createElement(Button, { loading }, "Save answers"));

describe("Button", () => {
  it("keeps its label box while loading, so the width does not change (Sol R1)", () => {
    const idle = render(false);
    const busy = render(true);
    // The same label element in both states; loading only hides it visually and overlays the spinner.
    expect(idle).toContain(">Save answers</span>");
    expect(busy).toContain('<span class="inline-flex items-center gap-2 opacity-0">Save answers</span>');
    expect(busy).toMatch(/<span aria-hidden="true" data-button-spinner="true" class="absolute inset-0/);
    expect(busy).toContain('aria-busy="true"');
    expect(busy).toContain("disabled");
    expect(idle).not.toContain("data-button-spinner");
  });
});
