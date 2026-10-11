import { describe, expect, it } from "vitest";
import { normalizeCrossref } from "./crossref";
import { stripTags } from "./doi";
import { fixture } from "./testing";

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

  it("drops XML comments, processing instructions and doctypes (Sol R01)", () => {
    expect(stripTags("<!-- note -->RETRACTED: Synthetic review")).toBe("RETRACTED: Synthetic review");
    expect(stripTags("a<!-- p < 0.05 > x -->b")).toBe("a b");
    expect(stripTags('<?xml version="1.0"?><!DOCTYPE x>Text')).toBe("Text");
  });

  it("keeps a CDATA body as literal text (Sol R02)", () => {
    expect(stripTags("<![CDATA[P < 0.05]]>")).toBe("P < 0.05");
    expect(stripTags("a <![CDATA[x<y and z>0]]> b")).toBe("a x<y and z>0 b");
    expect(stripTags("<![CDATA[&lt; stays encoded]]>")).toBe("&lt; stays encoded");
  });

  it("ends a tag only at a > outside quoted attributes (Sol R03)", () => {
    expect(stripTags('<jats:p specific-use="x > y">Result</jats:p>')).toBe("Result");
    expect(stripTags("<jats:p specific-use='x > y'>Result</jats:p>")).toBe("Result");
    expect(stripTags('a<img alt="1 > 0"/>b')).toBe("a b");
  });

  it("removes escaped markup but keeps escaped comparisons, decoding once (Sol R04)", () => {
    expect(stripTags("&lt;jats:p&gt;Result&lt;/jats:p&gt;")).toBe("Result");
    expect(stripTags('&lt;p class="x"&gt;A&lt;/p&gt; &lt;i&gt;B&lt;/i&gt;')).toBe("A B");
    expect(stripTags("x &lt;y and z &gt; 0")).toBe("x <y and z > 0");
    expect(stripTags("&amp;lt;p&amp;gt;")).toBe("&lt;p&gt;");
  });

  it("keeps a comment from hiding a Crossref retraction marker (Sol R01)", () => {
    const work = fixture<{ message: Parameters<typeof normalizeCrossref>[0] }>("crossref-work");
    const out = normalizeCrossref({ ...work.message, title: ["<!-- note -->RETRACTED: Synthetic review"], "updated-by": [], relation: {} });
    expect(out.isRetracted).toBe(true);
    expect(out.retractionEvidence).toContain("title:retraction");
  });

  it("removes escaped markup written with numeric delimiters or unnamespaced JATS names (Sol R2 R04)", () => {
    expect(stripTags("A&lt;break/&gt;B")).toBe("A B");
    expect(stripTags("&#60;jats:p&#62;Result&#60;/jats:p&#62;")).toBe("Result");
    expect(stripTags("&#x3C;italic&#x3E;Result&#x3c;/italic&#x3e;")).toBe("Result");
    expect(stripTags('&lt;named-content content-type=&#34;x&#34;&gt;Text&lt;/named-content&gt;')).toBe("Text");
    expect(stripTags("a &#60; b and c &#62; d")).toBe("a < b and c > d");
  });

  it("keeps text that only looks like a tag (Sol R2 R05)", () => {
    expect(stripTags("P<alpha; pooled effect>0.5. Conclusion.")).toBe("P<alpha; pooled effect>0.5. Conclusion.");
    expect(stripTags("risk<x and y>0 remained")).toBe("risk<x and y>0 remained");
    expect(stripTags("n<5 vs n>10")).toBe("n<5 vs n>10");
    expect(stripTags('<sec id="s1"><title>Methods</title></sec>')).toBe("Methods");
  });

  it("removes a processing instruction through its ?> (Sol R2 R06)", () => {
    expect(stripTags("a<?tex x > y?>b")).toBe("a b");
    expect(stripTags("a <?unterminated x > y")).toBe("a <?unterminated x > y");
  });
});

