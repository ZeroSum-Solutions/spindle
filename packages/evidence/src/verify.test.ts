import { describe, expect, it } from "vitest";
import { fixture, testContext } from "./testing";
import { verifySource } from "./verify";

const DOI = "10.1177/0269215520934147";
const clean = () => [
  ["api.crossref.org", fixture("crossref-work")],
  ["api.openalex.org", fixture("openalex-work")],
  ["api.unpaywall.org", fixture("unpaywall")],
] as const;

describe("verifySource", () => {
  it("builds a verified receipt for a clean open-access DOI", async () => {
    const { ctx } = testContext([...clean()]);
    const check = await verifySource(ctx, `https://doi.org/${DOI.toUpperCase()}`);
    expect(check).toMatchObject({
      doi: DOI,
      status: "verified",
      exists: true,
      retracted: false,
      retractionSources: [],
      oa: { isOa: true },
      answered: { crossref: true, openalex: true, unpaywall: true },
      checkedAt: "2026-01-01T00:00:00.000Z",
      issues: [],
    });
    expect(check.title).toMatch(/rotator cuff/i);
  });

  it("flags a retraction found by Crossref", async () => {
    const { ctx } = testContext([
      ["api.crossref.org", fixture("crossref-retracted")],
      ["api.openalex.org", fixture("openalex-work")],
      ["api.unpaywall.org", new Response("", { status: 404 })],
    ]);
    const check = await verifySource(ctx, "10.1016/s0140-6736(97)11096-0");
    expect(check).toMatchObject({ status: "flagged", retracted: true, retractionSources: ["crossref"] });
  });

  it("flags a retraction found only by OpenAlex", async () => {
    const oa = { ...fixture<Record<string, unknown>>("openalex-work"), is_retracted: true };
    const { ctx } = testContext([
      ["api.crossref.org", fixture("crossref-work")],
      ["api.openalex.org", oa],
      ["api.unpaywall.org", fixture("unpaywall")],
    ]);
    expect(await verifySource(ctx, DOI)).toMatchObject({ status: "flagged", retractionSources: ["openalex"] });
  });

  it("never reads a failed service as clean", async () => {
    const { ctx } = testContext([
      ["api.crossref.org", new Response("", { status: 400 })],
      ["api.openalex.org", fixture("openalex-work")],
      ["api.unpaywall.org", fixture("unpaywall")],
    ]);
    const check = await verifySource(ctx, DOI);
    expect(check.status).toBe("unverified");
    expect(check.exists).toBe(false);
    expect(check.issues.join(" ")).toMatch(/crossref failed/);
  });

  it("reports a missing DOI as unverified", async () => {
    const nf = () => new Response("Resource not found.", { status: 404 });
    const { ctx } = testContext([
      ["api.crossref.org", nf],
      ["api.openalex.org", nf],
      ["api.unpaywall.org", nf],
    ]);
    const check = await verifySource(ctx, "10.1000/none");
    expect(check).toMatchObject({ status: "unverified", exists: false, retracted: false });
  });

  it("throws on an invalid DOI or a missing contact email", async () => {
    await expect(verifySource(testContext([]).ctx, "nope")).rejects.toThrow(/valid DOI/);
    await expect(verifySource(testContext([], {}).ctx, DOI)).rejects.toThrow(/SPINDLE_CONTACT_EMAIL/);
  });
});
