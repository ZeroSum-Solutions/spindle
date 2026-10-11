import { describe, expect, it } from "vitest";
import { fixture, testContext } from "./testing";
import { verifySource } from "./verify";

const DOI = "10.1177/0269215520934147";
type Json = Record<string, unknown>;
const notFound = () => new Response("Resource not found.", { status: 404 });
const failed = () => new Response("", { status: 400 });

const cr = fixture<Json>("crossref-work");
const oa = fixture<Json>("openalex-work");
const up = fixture<Json>("unpaywall");
const crMsg = cr.message as Json;

const variants = {
  crossref: {
    ok: cr,
    notFound,
    error: failed,
    mismatch: { message: { ...crMsg, DOI: "10.1000/different" } },
    retracted: { message: { ...crMsg, "updated-by": [{ type: "retraction", DOI: "10.1000/n" }] } },
    withdrawn: { message: { ...crMsg, "updated-by": [{ type: "withdrawal", DOI: "10.1000/n" }] } },
  },
  openalex: {
    ok: oa,
    notFound,
    error: failed,
    mismatch: { ...oa, doi: "https://doi.org/10.1000/different" },
    missingFlag: { ...oa, is_retracted: null },
    retracted: { ...oa, is_retracted: true },
  },
  unpaywall: {
    ok: up,
    notFound,
    error: failed,
    mismatch: { ...up, doi: "10.1000/different" },
  },
} as const;

async function run(c: keyof typeof variants.crossref, o: keyof typeof variants.openalex, u: keyof typeof variants.unpaywall) {
  const { ctx } = testContext([
    ["api.crossref.org", variants.crossref[c]],
    ["api.openalex.org", variants.openalex[o]],
    ["api.unpaywall.org", variants.unpaywall[u]],
  ]);
  return verifySource(ctx, DOI);
}

describe("verifySource", () => {
  it("builds a verified receipt for a clean open-access DOI", async () => {
    const check = await run("ok", "ok", "ok");
    expect(check).toMatchObject({
      doi: DOI,
      status: "verified",
      exists: true,
      retracted: false,
      retractionSources: [],
      oa: { isOa: true },
      licenseStatus: "unknown", // green repository copy: Unpaywall has no license
      answered: { crossref: true, openalex: true, unpaywall: true },
      checkedAt: "2026-01-01T00:00:00.000Z",
      issues: [],
    });
    expect(check.title).toMatch(/rotator cuff/i);
  });

  const unverified: [string, Parameters<typeof run>][] = [
    ["crossref error", ["error", "ok", "ok"]],
    ["crossref 404", ["notFound", "ok", "ok"]],
    ["crossref mismatched DOI", ["mismatch", "ok", "ok"]],
    ["openalex error", ["ok", "error", "ok"]],
    ["openalex 404", ["ok", "notFound", "ok"]],
    ["openalex mismatched DOI", ["ok", "mismatch", "ok"]],
    ["openalex missing is_retracted", ["ok", "missingFlag", "ok"]],
    ["unpaywall error", ["ok", "ok", "error"]],
    ["unpaywall mismatched DOI", ["ok", "ok", "mismatch"]],
    ["all services 404", ["notFound", "notFound", "notFound"]],
  ];
  it.each(unverified)("is unverified: %s", async (_name, args) => {
    const check = await run(...args);
    expect(check.status).toBe("unverified");
    expect(check.issues.length).toBeGreaterThan(0);
    expect(check.issues.join(" ")).not.toContain("example.org");
  });

  it("keeps a mismatched record out of the receipt", async () => {
    const check = await run("mismatch", "ok", "ok");
    expect(check).toMatchObject({ exists: false, answered: { crossref: false } });
    expect(check.title).not.toContain("different");
  });

  it("sanitizes a hostile mismatched DOI before it reaches issues", async () => {
    const hostile = { ...up, doi: "10.1000/x?email=me@example.org&api_key=SECRET" };
    const { ctx } = testContext([["api.crossref.org", cr], ["api.openalex.org", oa], ["api.unpaywall.org", hostile]]);
    const check = await verifySource(ctx, DOI);
    expect(check.status).toBe("unverified");
    expect(JSON.stringify(check)).not.toMatch(/example\.org|SECRET/);
  });

  it("reports license unknown when Unpaywall 404s, errors or mismatches, even if OpenAlex has one", async () => {
    const licensed = { ...oa, best_oa_location: { license: "cc-by", landing_page_url: "https://x.test" } };
    for (const unpaywall of [notFound, failed, variants.unpaywall.mismatch]) {
      const { ctx } = testContext([["api.crossref.org", cr], ["api.openalex.org", licensed], ["api.unpaywall.org", unpaywall]]);
      const check = await verifySource(ctx, DOI);
      expect(check.licenseStatus).toBe("unknown");
      expect(check.oa.license).toBeUndefined();
      expect(check.openalexLicense).toBe("cc-by");
    }
  });

  it("treats an Unpaywall 404 as unknown license, recorded as an issue, not an error", async () => {
    const check = await run("ok", "ok", "notFound");
    expect(check).toMatchObject({ status: "verified", licenseStatus: "unknown", answered: { unpaywall: false } });
    expect(check.issues.join(" ")).toMatch(/unpaywall has no record/);
  });

  const flagged: [string, Parameters<typeof run>, string[]][] = [
    ["crossref retraction", ["retracted", "ok", "ok"], ["crossref"]],
    ["crossref withdrawal", ["withdrawn", "ok", "ok"], ["crossref"]],
    ["openalex only", ["ok", "retracted", "ok"], ["openalex"]],
    ["both, others failing", ["retracted", "retracted", "error"], ["crossref", "openalex"]],
    ["retracted but openalex 404", ["retracted", "notFound", "notFound"], ["crossref"]],
  ];
  it.each(flagged)("flagged wins: %s", async (_name, args, sources) => {
    const check = await run(...args);
    expect(check).toMatchObject({ status: "flagged", retracted: true, retractionSources: sources });
  });

  it("flags a real retracted DOI from the recorded Crossref fixture", async () => {
    const { ctx } = testContext([
      ["api.crossref.org", fixture("crossref-retracted")],
      ["api.openalex.org", { ...oa, doi: "https://doi.org/10.1016/s0140-6736(97)11096-0" }],
      ["api.unpaywall.org", notFound],
    ]);
    expect(await verifySource(ctx, "10.1016/S0140-6736(97)11096-0")).toMatchObject({ status: "flagged", retractionSources: ["crossref"] });
  });

  it("flags a DOI that is itself a retraction notice", async () => {
    const notice = { message: { ...crMsg, "update-to": [{ type: "retraction", DOI: "10.1000/orig" }] } };
    const { ctx } = testContext([["api.crossref.org", notice], ["api.openalex.org", oa], ["api.unpaywall.org", up]]);
    const check = await verifySource(ctx, DOI);
    expect(check.status).toBe("flagged");
    expect(check.issues.join(" ")).toMatch(/retraction notice/);
  });

  it("never stores the contact email in issues, even for transport errors", async () => {
    const { ctx } = testContext([
      ["api.crossref.org", () => { throw new Error("boom https://api.crossref.org/x?mailto=test@example.org"); }],
      ["api.openalex.org", oa],
      ["api.unpaywall.org", () => { throw new Error("boom email=test%40example.org"); }],
    ]);
    const check = await verifySource(ctx, DOI);
    expect(JSON.stringify(check)).not.toContain("example.org");
  });

  it("throws on an invalid DOI or a missing contact email", async () => {
    await expect(verifySource(testContext([]).ctx, "nope")).rejects.toThrow(/valid DOI/);
    await expect(verifySource(testContext([], {}).ctx, DOI)).rejects.toThrow(/SPINDLE_CONTACT_EMAIL/);
  });
});
