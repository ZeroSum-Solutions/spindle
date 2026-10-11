// The database's published snapshots must parse unchanged with the runtime
// schema the app uses (parseCourse), and every link the database accepts must
// pass isSafeContentUrl. Publication runs through the real RPCs inside one
// transaction that rolls back (fixtures/content-contract.sql). No page is used.
import { readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { expect, test } from "@playwright/test";
import { isSafeContentUrl, parseCourse, type Course } from "@spindle/schema";
import { sql } from "./helpers/local-supabase";
import urls from "./fixtures/content-urls.json";

const CLAIM = "__CLAIM__";
const id = (n: string) => `c2c2c2c2-0000-4000-8000-${n.padStart(12, "0")}`;

const lessonBase = {
  summary: "Synthetic contract fixture. Non-breaking space and emoji 🦴.",
  objectives: ["Name the parts", "Cue the movement 💪"],
  anatomyIds: ["UBERON:0001467", "UBERON:0002398"],
  resources: [
    { label: "Worksheet", href: "/media/v-1/sheet_2.pdf", type: "worksheet" as const },
    { label: "Reference", href: "https://cdn.example.org:8443/a/b.png?v=2#top", type: "reference" as const },
  ],
};

/** A global course with every block kind and edge-case values. */
const base: Course = {
  id: id("c01"),
  slug: "c2-contract-base",
  layer: "base",
  title: "Contract base course",
  subtitle: "Every block kind",
  description: "Synthetic course for the database to runtime contract.",
  level: "foundation",
  outcomes: ["Read every block kind"],
  parts: [
    {
      id: id("c11"),
      ordinal: 1,
      title: "Part one",
      summary: "",
      lessons: [
        {
          ...lessonBase,
          id: id("c12"),
          slug: "every-block",
          title: "Every block kind",
          durationMinutes: 600,
          format: "article",
          blocks: [
            { kind: "heading", content: "The cuff 🦴" },
            { kind: "paragraph", content: "Four muscles form the cuff.", support: "science", claimIds: [CLAIM] },
            { kind: "callout", content: { label: "Note", text: "Synthetic callout." }, support: "science", claimIds: [CLAIM] },
            {
              kind: "image",
              content: {
                kind: "image",
                src: "/media/content/c2/cuff_1.png",
                alt: "Shoulder",
                caption: "",
                provenanceId: "prov:c2.cuff-1",
              },
            },
            { kind: "checklist", content: ["Stand tall", "Breathe 🫁"], support: "practice-based", claimIds: [] },
            {
              kind: "diagram",
              content: {
                diagramId: "diagram.shoulder_1",
                alt: "Synthetic diagram of the shoulder 🦴",
                caption: "Synthetic diagram",
                legend: [{ key: "scapula", label: "Shoulder blade", text: "Synthetic legend text." }],
              },
              support: "science",
              claimIds: [CLAIM],
            },
            {
              kind: "quiz",
              content: { prompt: "How many cuff muscles?", options: ["Three", "Four"], answerIndex: 1, explanation: "Four." },
              support: "science",
              claimIds: [CLAIM],
            },
          ],
          media: [
            { kind: "image", src: "/media/content/v-1/clip_2.png", alt: "Clip still", caption: "Synthetic still", provenanceId: "c2-clip" },
            { kind: "diagram", src: "/media/content/C2/diagram.x", alt: "Diagram", caption: "", provenanceId: "C2.Diagram:1" },
          ],
        },
      ],
    },
    {
      id: id("c13"),
      ordinal: 2,
      title: "Part two",
      summary: "Second part.",
      lessons: [
        {
          ...lessonBase,
          id: id("c14"),
          slug: "practice",
          title: "Practice",
          durationMinutes: 1,
          format: "practice",
          anatomyIds: [],
          blocks: [{ kind: "paragraph", content: "Cue a tall posture.", support: "practice-based", claimIds: [] }],
          media: [],
          resources: [],
        },
      ],
    },
  ],
};

/** A gym method course: practice-based only. */
const method: Course = {
  id: id("c02"),
  slug: "c2-contract-method",
  layer: "method",
  title: "Contract method course",
  subtitle: "",
  description: "",
  level: "advanced",
  outcomes: [],
  parts: [
    {
      id: id("c21"),
      ordinal: 1,
      title: "Our method",
      summary: "",
      lessons: [
        {
          ...lessonBase,
          id: id("c22"),
          slug: "our-cues",
          title: "Our cues",
          durationMinutes: 15,
          format: "quiz",
          blocks: [
            { kind: "heading", content: "Our cues" },
            { kind: "paragraph", content: "We cue ribs down.", support: "practice-based", claimIds: [] },
            { kind: "callout", content: { label: "Gym", text: "House rule." }, support: "practice-based", claimIds: [] },
            { kind: "checklist", content: ["Brace"], support: "practice-based", claimIds: [] },
            { kind: "image", content: { kind: "image", src: "/media/org/c2c2c2c2-0000-4000-8000-0000000000b1/cuff.png", alt: "Cuff", caption: "", provenanceId: "gym-1" } },
            { kind: "diagram", content: { diagramId: "d1", alt: "House diagram", caption: "", legend: [] }, support: "practice-based", claimIds: [] },
            {
              kind: "quiz",
              content: { prompt: "Which cue?", options: ["Ribs down", "Chin up", "Toes out"], answerIndex: 0, explanation: "House cue." },
              support: "practice-based",
              claimIds: [],
            },
          ],
          media: [],
        },
      ],
    },
  ],
};

// Each placeholder sits inside a $c2json$ dollar quote, which no fixture value contains.
function fixtureScript(): string {
  const json = (value: unknown) => {
    const text = JSON.stringify(value);
    if (text.includes("$c2json$")) throw new Error("fixture JSON contains the SQL quote tag");
    return text;
  };
  return readFileSync(path.join(__dirname, "fixtures", "content-contract.sql"), "utf8")
    .replace("__BASE__", () => json(base))
    .replace("__METHOD__", () => json(method))
    .replace("__URLS__", () => json(urls.map((u) => u.url)));
}

test("database-published snapshots and accepted links satisfy the runtime schema", () => {
  const lines = sql(fixtureScript()).map((row) => row.join("\t"));
  const take = (tag: string) => lines.filter((l) => l.startsWith(tag)).map((l) => l.slice(tag.length));
  const [claim] = take("@@CLAIM@@");
  expect(claim).toMatch(/^[0-9a-f-]{36}$/);

  const [titleReceipt] = take("@@TITLERECEIPT@@");
  expect(titleReceipt, "the admitted title's receipt").toMatch(/^[0-9a-f-]{36}$/);
  const expected = JSON.parse(JSON.stringify([base, { ...method, titleReceiptId: titleReceipt }]).replaceAll(CLAIM, claim!)) as Course[];
  const snapshots = take("@@SNAPSHOT@@").map((s) => JSON.parse(s) as unknown);
  expect(snapshots).toHaveLength(2);
  for (const [i, snapshot] of snapshots.entries()) {
    const parsed = parseCourse(snapshot);
    expect(isDeepStrictEqual(parsed, snapshot), `${expected[i]!.slug} parses unchanged`).toBe(true);
    expect(snapshot, `${expected[i]!.slug} is stored as authored`).toEqual(expected[i]);
  }
  const kinds = (c: Course) => new Set(c.parts.flatMap((p) => p.lessons.flatMap((l) => l.blocks.map((b) => b.kind))));
  const allKinds = ["heading", "paragraph", "callout", "image", "checklist", "diagram", "quiz"];
  expect([...kinds(expected[0]!)].sort()).toEqual([...allKinds].sort());
  expect([...kinds(expected[1]!)].sort()).toEqual([...allKinds].sort());

  const probes = take("@@URL@@").map((s) => JSON.parse(s) as { url: string; accepted: boolean; error: string | null });
  expect(probes.map((p) => p.url)).toEqual(urls.map((u) => u.url));
  expect(probes).toHaveLength(37);
  for (const [i, probe] of probes.entries()) {
    expect(probe.accepted, `SQL verdict for ${JSON.stringify(probe.url)}`).toBe(urls[i]!.sqlAccepts);
    if (probe.accepted) expect(isSafeContentUrl(probe.url), `runtime accepts ${JSON.stringify(probe.url)}`).toBe(true);
    else expect(probe.error, `rejected by the link rule: ${JSON.stringify(probe.url)}`).toContain("must be an https URL or a site path");
  }
  const feff = probes.filter((p) => p.url.includes("﻿"));
  expect(feff).toHaveLength(2);
  for (const p of feff) expect([p.accepted, isSafeContentUrl(p.url)]).toEqual([false, false]);
});
