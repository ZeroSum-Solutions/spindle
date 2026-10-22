/**
 * D-11 segment review for one registry clip. Fail closed at every step:
 *   1. the clip must be active with a passing embed check and embedded by a global lesson;
 *   2. a new description needs the clip undescribed and unsent for 90 days (database and ledger)
 *      and the spend cap ($5 per UTC month) to hold for this call's upper bound; both are checked
 *      and the call reserved under the ledger lock before anything is sent;
 *   3. Gemini (metered, approved lane) describes the segment from the video itself, with 15 s of
 *      context; the reservation is settled with the reported cost, or kept at its upper bound when
 *      the cost is unknown;
 *   4. a describer failure means not approved (nothing recorded); uncertain content records a failed
 *      segment check (playback stops), with the describer run;
 *   5. otherwise Sol reviews the description with the lessons that embed the clip now (their database
 *      hashes go into the packet and the recorder compares them again) and SAFETY.md; record the
 *      result with record-review.ts --dir <printed dir>.
 * After a lesson edit, --reuse <earlier packet dir> sends the same description to Sol again with the
 * current lessons, without a new describer call.
 *   … tsx scripts/segment-review.ts --media <id> --safety /path/SAFETY.md [--describe-only | --reuse <dir>]
 * Needs SPINDLE_DB_URL, SPINDLE_PUBLISHER_ID, SPINDLE_REVIEW_DIR, and GEMINI_API_KEY or GOOGLE_API_KEY
 * for a new description (sent only in a request header; never printed). Exit 0 reviewed, 1 not approved
 * or refused, 2 error.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requireUuid } from "../src/guards";
import { runReview } from "../src/review/harness";
import { assertPacket, buildSegmentPacket, packetDigest, type ReviewPacket, type SegmentDescriber } from "../src/review/packet";
import { reviewPrompt } from "../src/review/prompt";
import { codexRunner } from "../src/review/runner";
import { DESCRIBER_MODEL, describeSegment, estimateMaxCostUsd, type SegmentDescription, type SegmentRef } from "../src/video/describe";
import { DESCRIBE_INTERVAL_DAYS, releaseCall, reserveCall, settleCall } from "../src/video/ledger";
import { args, dir, lit, main, publisherId, serviceValue, sql, writeJson } from "./lib/cli";

type Described = { description: Pick<SegmentDescription, "spoken" | "visual" | "uncertain">; describer: SegmentDescriber };

/** The description and describer run from an earlier packet for this exact segment. */
function reuse(path: string, seg: SegmentRef): Described {
  const packet = JSON.parse(readFileSync(join(path, "packet.json"), "utf8")) as ReviewPacket;
  assertPacket(packet);
  const item = packet.items[0];
  if (packet.rubric !== "segments" || packet.items.length !== 1 || item?.kind !== "segment") throw new Error("--reuse needs a segment packet");
  const c = item.content as { registry: SegmentRef; description: Described["description"]; describer: SegmentDescriber };
  const r = c.registry;
  if (r.mediaId !== seg.mediaId || r.videoId !== seg.videoId || r.startSeconds !== seg.startSeconds || r.endSeconds !== seg.endSeconds || r.rationale !== seg.rationale) {
    throw new Error("--reuse packet describes another segment");
  }
  const age = Date.now() - Date.parse(c.describer.run.reviewedAt);
  if (!(age >= 0 && age < DESCRIBE_INTERVAL_DAYS * 86_400_000)) throw new Error(`--reuse description is not from the last ${DESCRIBE_INTERVAL_DAYS} days; describe the clip again`);
  return { description: { spoken: c.description.spoken, visual: c.description.visual, uncertain: [] }, describer: c.describer };
}

main(async () => {
  const a = args();
  const mediaId = requireUuid(a.get("media"), "--media");
  const safetyPath = a.get("safety");
  if (!safetyPath) throw new Error("--safety <SAFETY.md> is required");
  const safety = readFileSync(safetyPath, "utf8");
  const p = publisherId();
  const reviewDir = dir("SPINDLE_REVIEW_DIR");

  // Only real describer calls count toward the 90 days: a retired fixture description never blocks one.
  const row = JSON.parse(sql(`select coalesce((select json_build_object('mediaId', m.id, 'videoId', m.video_id, 'startSeconds', m.start_seconds,
      'endSeconds', m.end_seconds, 'rationale', m.rationale, 'status', private.media_publishable(m.id),
      'lastDescribedAt', private.segment_last_described_at(m.id))
    from public.practice_media m where m.id = ${lit(mediaId)}), 'null')`)) as (SegmentRef & { status: string; lastDescribedAt: string | null }) | null;
  if (!row) throw new Error("no such media");
  if (row.status !== "ok" && row.status !== "segment-unchecked") {
    console.log(`refused: the clip is ${row.status}; recheck the embed or reactivate it first`);
    return 1;
  }
  // Lessons and their hashes in one statement, so the hashes are of exactly these lessons.
  const ctx = JSON.parse(sql(`select json_build_object('lessons', coalesce((select json_agg(private.lesson_json(x.lesson_id) order by x.lesson_id)
      from (select distinct b.lesson_id from public.lesson_blocks b where b.kind = 'video' and b.org_id is null
            and b.content ->> 'mediaId' = ${lit(mediaId)}) x), '[]'), 'context', private.segment_context(${lit(mediaId)}))`)) as {
    lessons: unknown[];
    context: { lessonId: string; hash: string }[];
  };
  if (ctx.lessons.length === 0) {
    console.log("refused: no global lesson embeds this clip, so there is nothing to review it against");
    return 1;
  }
  const seg: SegmentRef = { mediaId: row.mediaId, videoId: row.videoId, startSeconds: row.startSeconds, endSeconds: row.endSeconds, rationale: row.rationale };

  let got: Described;
  if (a.get("reuse")) {
    got = reuse(a.get("reuse")!, seg);
    console.log("reusing the earlier description; no describer call");
  } else {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("set GEMINI_API_KEY or GOOGLE_API_KEY");
    const ledgerPath = join(reviewDir, "gemini-spend.jsonl");
    const now = new Date();
    let reservation;
    try {
      reservation = reserveCall(ledgerPath, { mediaId, videoId: seg.videoId, model: DESCRIBER_MODEL, maxUsd: estimateMaxCostUsd(seg, now), lastDescribedAt: row.lastDescribedAt, now });
    } catch (e) {
      console.log(e instanceof Error ? e.message : String(e));
      return 1;
    }
    const described = await describeSegment(seg, { fetch: (u, i) => fetch(u, i), apiKey, now: () => now });
    if (!described.ok && "refusal" in described) {
      // A documented non-billable refusal (refusal.ts): release the reservation, so it neither
      // costs budget nor blocks the clip for 90 days. Nothing is recorded; the clip stays disabled.
      releaseCall(ledgerPath, reservation, described.refusal, new Date());
      console.log(`the describer refused the call (HTTP ${described.refusal}); the reservation is released and the clip may be tried again`);
    } else {
      settleCall(ledgerPath, reservation, described.costUsd, described.ok, new Date());
      console.log(described.costUsd === null ? `describer cost unknown; $${reservation.maxUsd.toFixed(6)} stays reserved` : `describer cost $${described.costUsd.toFixed(6)}`);
    }
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
    got = { description: described.description, describer };
  }

  const packet = buildSegmentPacket(seg, got.description, got.describer, ctx.lessons, ctx.context, safety, new Date().toISOString());
  const out = join(reviewDir, packetDigest(packet));
  writeJson(join(out, "packet.json"), packet);
  writeFileSync(join(out, "prompt.txt"), reviewPrompt(packet), { mode: 0o600 });
  console.log(`packet ${packetDigest(packet)} -> ${out}`);
  if (a.has("describe-only")) return 0;
  const outcome = await runReview(packet, codexRunner());
  writeJson(join(out, "outcome.json"), outcome);
  if (!outcome.ok) {
    console.log("NOT APPROVED (nothing recorded):");
    for (const e of outcome.errors) console.log(`  - ${e}`);
    if (outcome.rawAnswer) console.log(`  the reviewer's raw answer is kept in ${join(out, "outcome.json")} (private)`);
    return 1;
  }
  for (const [id, item] of Object.entries(outcome.items)) console.log(`  ${id}: ${item.verdict} (${item.findings.length} findings)`);
  console.log(`record with record-review.ts --dir ${out}`);
  return 0;
});
