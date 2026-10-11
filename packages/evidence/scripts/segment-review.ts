/**
 * D-11 segment review for one registry clip. Fail closed at every step:
 *   1. the clip must be active with a passing embed check, embedded by a global lesson, and not described
 *      in the last 90 days;
 *   2. the spend cap ($5 per UTC month, private ledger) must hold for this call's upper bound;
 *   3. Gemini (metered, approved lane) describes the segment from the video itself, with 15 s of context;
 *      every call, failed or not, is logged to the ledger with its cost;
 *   4. a describer failure means not approved (nothing recorded); uncertain content records a failed
 *      segment check (playback stops), with the describer run;
 *   5. otherwise Sol reviews the description, the lessons and SAFETY.md (review.ts harness); record the
 *      result with record-review.ts --dir <printed dir>.
 *   … tsx scripts/segment-review.ts --media <id> --safety /path/SAFETY.md [--describe-only]
 * Needs SPINDLE_DB_URL, SPINDLE_PUBLISHER_ID, SPINDLE_REVIEW_DIR, and GEMINI_API_KEY or GOOGLE_API_KEY
 * (sent only in a request header; never printed). Exit 0 reviewed, 1 not approved or refused, 2 error.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requireUuid } from "../src/guards";
import { runReview } from "../src/review/harness";
import { buildSegmentPacket, packetDigest } from "../src/review/packet";
import { reviewPrompt } from "../src/review/prompt";
import { codexRunner } from "../src/review/runner";
import { describeSegment, estimateMaxCostUsd, type SegmentRef } from "../src/video/describe";
import { assertWithinCap, describeAllowed, ledgerLine, parseLedger } from "../src/video/ledger";
import { args, dir, lit, main, publisherId, serviceValue, sql, writeJson } from "./lib/cli";

main(async () => {
  const a = args();
  const mediaId = requireUuid(a.get("media"), "--media");
  const safetyPath = a.get("safety");
  if (!safetyPath) throw new Error("--safety <SAFETY.md> is required");
  const safety = readFileSync(safetyPath, "utf8");
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("set GEMINI_API_KEY or GOOGLE_API_KEY");
  const p = publisherId();
  const now = new Date();

  const row = JSON.parse(sql(`select coalesce((select json_build_object('mediaId', m.id, 'videoId', m.video_id, 'startSeconds', m.start_seconds,
      'endSeconds', m.end_seconds, 'rationale', m.rationale, 'status', private.media_publishable(m.id),
      'lastDescribedAt', (select max(c.described_at) from public.practice_media_checks c where c.media_id = m.id))
    from public.practice_media m where m.id = ${lit(mediaId)}), 'null')`)) as (SegmentRef & { status: string; lastDescribedAt: string | null }) | null;
  if (!row) throw new Error("no such media");
  if (row.status !== "ok" && row.status !== "segment-unchecked") {
    console.log(`refused: the clip is ${row.status}; recheck the embed or reactivate it first`);
    return 1;
  }
  if (!describeAllowed(row.lastDescribedAt, now)) {
    console.log(`refused: described at ${row.lastDescribedAt}; one description per clip per 90 days`);
    return 1;
  }
  const lessons = JSON.parse(sql(`select coalesce(json_agg(private.lesson_json(x.lesson_id)), '[]') from (select distinct b.lesson_id
    from public.lesson_blocks b where b.kind = 'video' and b.org_id is null and b.content ->> 'mediaId' = ${lit(mediaId)}) x`)) as unknown[];
  if (lessons.length === 0) {
    console.log("refused: no global lesson embeds this clip, so there is nothing to review it against");
    return 1;
  }

  const ledgerPath = join(dir("SPINDLE_REVIEW_DIR"), "gemini-spend.jsonl");
  const entries = existsSync(ledgerPath) ? parseLedger(readFileSync(ledgerPath, "utf8")) : [];
  const seg: SegmentRef = { mediaId: row.mediaId, videoId: row.videoId, startSeconds: row.startSeconds, endSeconds: row.endSeconds, rationale: row.rationale };
  assertWithinCap(entries, now, estimateMaxCostUsd(seg));

  const described = await describeSegment(seg, { fetch: (u, i) => fetch(u, i), apiKey, now: () => new Date() });
  appendFileSync(ledgerPath, ledgerLine({ at: new Date().toISOString(), mediaId, videoId: seg.videoId, model: "gemini-3.8-flash", costUsd: described.costUsd, ok: described.ok }), { mode: 0o600 });
  console.log(`describer cost $${described.costUsd.toFixed(6)}`);
  if (!described.ok) {
    console.log(`NOT APPROVED (nothing recorded): ${described.error}`);
    return 1;
  }
  const describer = { run: described.run, costUsd: described.costUsd };
  if (described.uncertain) {
    serviceValue(`public.publisher_record_media_check(${lit(p)}, ${lit(mediaId)}, ${lit(JSON.stringify({
      kind: "segment", outcome: "fail", checkedAt: described.run.reviewedAt, describer,
      notes: `describer reported uncertain content: ${described.description.uncertain.join("; ")}`.slice(0, 2000),
    }))}::jsonb)`);
    console.log("FAILED: the describer reported uncertain content; a failed segment check was recorded and playback stops");
    return 1;
  }

  const packet = buildSegmentPacket(seg, described.description, describer, lessons, safety, now.toISOString());
  const out = join(dir("SPINDLE_REVIEW_DIR"), packetDigest(packet));
  writeJson(join(out, "packet.json"), packet);
  writeFileSync(join(out, "prompt.txt"), reviewPrompt(packet), { mode: 0o600 });
  console.log(`packet ${packetDigest(packet)} -> ${out}`);
  if (a.has("describe-only")) return 0;
  const outcome = await runReview(packet, codexRunner());
  writeJson(join(out, "outcome.json"), outcome);
  if (!outcome.ok) {
    console.log("NOT APPROVED (nothing recorded):");
    for (const e of outcome.errors) console.log(`  - ${e}`);
    return 1;
  }
  for (const [id, item] of Object.entries(outcome.items)) console.log(`  ${id}: ${item.verdict} (${item.findings.length} findings)`);
  console.log(`record with record-review.ts --dir ${out}`);
  return 0;
});
