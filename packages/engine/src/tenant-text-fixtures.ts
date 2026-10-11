// One fixture list for both admission implementations. tenant-text.test.ts runs it through
// admitTenantText; apps/web/src/lib/tenant-text-sync.test.ts checks that
// supabase/tests/database/tenant_text.test.sql carries the same list (rendered by renderSqlFixtures),
// so the SQL function is tested on exactly these inputs.
import type { AdmissionReason } from "./tenant-text";

export interface TenantTextFixture {
  slot: string;
  text: string;
  /** "ok", or the refusal reason. */
  expect: "ok" | AdmissionReason;
  /** For "ok": the stored text. For "denied": the reserved term found. For "claim": the pattern name. */
  detail?: string;
}

const ok = (slot: string, text: string, stored?: string): TenantTextFixture => ({ slot, text, expect: "ok", ...(stored === undefined ? {} : { detail: stored }) });
const no = (slot: string, text: string, expect: AdmissionReason, detail?: string): TenantTextFixture => ({ slot, text, expect, ...(detail === undefined ? {} : { detail }) });

export const TENANT_TEXT_FIXTURES: readonly TenantTextFixture[] = [
  // Ordinary coaching text passes: whole tokens only, years and percentages allowed.
  ok("brand_name", "Andrew Fitness"),
  ok("course_title", "Quadriceps cues"),
  ok("welcome", "We start with drills for the hips."),
  ok("welcome", "I'm excited to coach you."),
  ok("welcome", "Extra resources are in each lesson."),
  ok("coach_role", "Acclaimed strength coach"),
  ok("course_summary", "Hard rows, then easy rows."),
  ok("welcome", "Coaching here since 2015. Work at 70% of your best set, 3 times a week."),
  ok("welcome", "Week 1: squats at 10:30, sets of 5."),
  ok("welcome", "Address the bar, then drive."),
  ok("coach_name", "Dr\u00e9 Adams"),
  ok("course_summary", ""),
  ok("brand_name", "  Andrew Fitness \n", "Andrew Fitness"),
  ok("brand_name", "Cafe\u0301 Barbell", "Caf\u00e9 Barbell"),
  ok("brand_name", "Iron\u3164Yard"),
  ok("catalog_tagline", "Strong at 40, 50 and 60+."),
  ok("welcome", "Coaching since 2012."),
  ok("brand_name", "Est. 2015 Barbell"),
  ok("course_summary", "Work up to 80% of 1RM."),
  ok("catalog_tagline", "Open 24/7"),
  ok("welcome", "Lower the bar by 2 inches."),
  // Reserved words, however they are disguised.
  no("catalog_tagline", "Backed by science", "denied", "science"),
  no("brand_name", "PT reviewed", "denied", "reviewed"),
  no("brand_name", "Spindle certified", "denied", "spindle"),
  no("catalog_headline", "Sc1ence first", "denied", "science"),
  no("catalog_headline", "5cience first", "denied", "science"),
  no("catalog_headline", "$CIENCE", "denied", "science"),
  no("catalog_headline", "Science!", "denied", "science"),
  no("catalog_headline", "s c i e n c e", "denied", "science"),
  no("catalog_headline", "s.c.i.e.n.c.e", "denied", "science"),
  no("catalog_headline", "\uff53\uff43\uff49\uff45\uff4e\uff43\uff45", "denied", "science"),
  no("catalog_headline", "\u0455\u0441\u0456\u0435n\u0441\u0435", "denied", "science"),
  no("catalog_headline", "Sc\u00edenc\u00e9", "denied", "science"),
  no("catalog_headline", "Sci\u3164ence", "denied", "science"),
  no("catalog_headline", "BackedByScience", "denied", "science"),
  no("catalog_tagline", "Evidence-based plans", "denied", "evidence"),
  no("catalog_tagline", "Peer-reviewed programs", "denied", "peer reviewed"),
  no("catalog_tagline", "Practice-based only", "denied", "practice based"),
  no("welcome", "If it hurts, stop and refer.", "denied", "stop and refer"),
  no("coach_role", "Physical therapist", "denied", "physical therapist"),
  no("welcome", "As Smith et al showed", "denied", "et al"),
  no("coach_name", "Dr. Lee", "denied", "dr"),
  no("coach_name", "D R Lee", "denied", "dr"),
  no("course_title", "We cure back pain", "denied", "cure"),
  no("course_title", "Treat knee pain", "denied", "treat"),
  no("welcome", "See pmid 12345", "denied", "pmid"),
  no("catalog_tagline", "Clinically proven", "denied", "clinically"),
  no("brand_name", "Base Curriculum Gym", "denied", "base curriculum"),
  // Links, addresses and markup.
  no("welcome", "javascript:alert(1)", "link"),
  no("welcome", "mailto:coach", "link"),
  no("welcome", "\uff4a\uff41\uff56\uff41\uff53\uff43\uff52\uff49\uff50\uff54\uff1ax", "link"),
  no("welcome", "Visit www.example.org", "link"),
  no("welcome", "Visit example.org today", "link"),
  no("welcome", "//example", "link"),
  no("welcome", "coach@example", "link"),
  no("brand_name", "<b>Gym</b>", "link"),
  no("welcome", "See doi 10.1000/182", "link"),
  // Citation and outcome shapes.
  no("welcome", "Squats help (Smith, 2019).", "claim", "citation"),
  no("welcome", "As shown (2019), squats help.", "claim", "citation"),
  no("course_summary", "This reduces pain by 30%", "claim", "outcome claim"),
  no("catalog_tagline", "Clients get 30% stronger in 8 weeks", "claim", "outcome claim"),
  no("welcome", "Improves your squat by 12.5 %", "claim", "outcome claim"),
  // Hidden characters (the #34 core's rules) and blanks.
  no("brand_name", "Sci\u200bence", "control"),
  no("brand_name", "Gym\u202e", "control"),
  no("brand_name", "Gym\u2060Yard", "control"),
  no("brand_name", "Gym\u00adYard", "control"),
  no("welcome", "Line\u2028break", "control"),
  no("welcome", "Tab\tinside", "control"),
  // String.prototype.trim (the #34 core's zod .trim()) removes a byte-order mark at either end.
  ok("brand_name", "\ufeffGym", "Gym"),
  no("brand_name", "G\ufeffym", "control"),
  no("brand_name", "\u3164", "blank"),
  no("brand_name", "\u2800\u2800", "blank"),
  no("brand_name", "\u0301", "blank"),
  // Length per slot, in code points after normalization.
  no("brand_name", "", "length"),
  no("brand_name", "x".repeat(61), "length"),
  ok("brand_name", "\u{1F3CB}".repeat(60)),
  no("welcome", "a".repeat(281), "length"),
  no("nope", "Andrew Fitness", "unknown-slot"),
];

/** SQL string literal for any text: printable ASCII kept, everything else as \u or \U escapes. */
export function sqlLiteral(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (ch === "'") out += "''";
    else if (ch === "\\") out += "\\\\";
    else if (cp >= 0x20 && cp < 0x7f) out += ch;
    else out += cp > 0xffff ? `\\U${cp.toString(16).padStart(8, "0")}` : `\\u${cp.toString(16).padStart(4, "0")}`;
  }
  return `E'${out}'`;
}

/** The values list tenant_text.test.sql must carry, between its fixture markers. */
export function renderSqlFixtures(fixtures: readonly TenantTextFixture[] = TENANT_TEXT_FIXTURES): string {
  return fixtures
    .map((f, i) => `  (${i + 1}, ${sqlLiteral(f.slot)}, ${sqlLiteral(f.text)}, ${sqlLiteral(f.expect)}, ${f.detail === undefined ? "null" : sqlLiteral(f.detail)})`)
    .join(",\n");
}
