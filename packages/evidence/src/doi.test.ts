import { describe, expect, it } from "vitest";
import { stripTags } from "./doi";

describe("stripTags", () => {
  it("removes markup but keeps comparison signs in the text", () => {
    // Europe PMC abstracts carry raw < and > next to real <h4> tags (PMID 31937577, 27475532).
    const raw = "swimmers with low (<93°) or high (>100°) rotation (p < 0.05).<h4>Conclusion</h4>Screening <i>may</i> help.";
    expect(stripTags(raw)).toBe("swimmers with low (<93°) or high (>100°) rotation (p < 0.05). Conclusion Screening may help.");
  });

  it("keeps a sentence that sits between a bare < and a later tag", () => {
    const raw = "insufficiency (throwing arm <5° greater) was associated with injury (p<0.01).<h4>Conclusion</h4>Done.";
    expect(stripTags(raw)).toBe("insufficiency (throwing arm <5° greater) was associated with injury (p<0.01). Conclusion Done.");
  });

  it("removes namespaced JATS tags and decodes entities", () => {
    const raw = "<jats:sec><jats:title>Results</jats:title><jats:p>P &lt; 0.001 &amp; d &gt; 0.5</jats:p></jats:sec>";
    expect(stripTags(raw)).toBe("Results P < 0.001 & d > 0.5");
  });

  it("strips tags with attributes and self-closing tags", () => {
    expect(stripTags('a<sup class="x">2</sup> b<br/>c')).toBe("a 2 b c");
  });
});
