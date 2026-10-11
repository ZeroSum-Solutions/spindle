/**
 * The fail-closed review step. Builds a bounded packet from the database targets and the
 * private evidence files, runs the reviewer (codex exec, GPT-6.1 Sol, credential-free), and
 * writes packet, prompt and outcome to a private directory. It records nothing: run
 * record-review.ts on the output directory as the trusted step.
 *   … tsx scripts/review.ts --claims <id,id> | --course <id> --safety /path/SAFETY.md [--dry-run]
 * Needs SPINDLE_DB_URL, SPINDLE_PUBLISHER_ID, SPINDLE_REVIEW_DIR (and SPINDLE_EVIDENCE_DIR for claims).
 * Exit 0 every item answered and valid, 1 not approved (see errors), 2 error.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requireUuid } from "../src/guards";
import { runReview } from "../src/review/harness";
import { buildContentPacket, evidenceEntrySchema, requireCompleteClaimPacket, packetDigest, type ClaimTarget, type ContentTargets, type EvidenceEntry, type ReviewPacket } from "../src/review/packet";
import { reviewPrompt } from "../src/review/prompt";
import { codexRunner } from "../src/review/runner";
import { args, dir, evidencePath, lit, main, publisherId, readJson, serviceValue, sourceIdentities, writeJson } from "./lib/cli";


function claimTarget(p: string, id: string): ClaimTarget {
  return JSON.parse(serviceValue(`public.publisher_claim_target(${lit(p)}, ${lit(requireUuid(id, "claim id"))})`)) as ClaimTarget;
}

main(async () => {
  const a = args();
  const p = publisherId();
  const now = new Date();
  let packet: ReviewPacket;
  if (a.get("claims")) {
    const claims = a.get("claims")!.split(",").map((id) => claimTarget(p, id.trim()));
    const evidence = new Map<string, EvidenceEntry>();
    for (const s of new Set(claims.flatMap((c) => c.sourceIds))) {
      if (!existsSync(evidencePath(s))) continue;
      const entry = evidenceEntrySchema.parse(readJson<unknown>(evidencePath(s)));
      if (entry.sourceId !== s) throw new Error(`evidence file for ${s} names source ${entry.sourceId}`);
      evidence.set(s, entry);
    }
    const built = requireCompleteClaimPacket(claims, evidence, now.toISOString(), sourceIdentities([...new Set(claims.flatMap((c) => c.sourceIds))]));
    for (const b of built.blocked) console.log(`blocked ${b.claimId}: ${b.reason}`);
    if (!built.packet) {
      console.log("refused: every requested claim must be reviewable; fix or drop the blocked ones and run again");
      return 1;
    }
    packet = built.packet;
  } else if (a.get("course")) {
    const safety = a.get("safety");
    if (!safety) throw new Error("--safety <SAFETY.md> is required for a content review");
    const targets = JSON.parse(serviceValue(`public.publisher_review_targets(${lit(p)}, ${lit(requireUuid(a.get("course"), "course id"))})`)) as ContentTargets;
    const ids = new Set(targets.lessons.flatMap((l) => l.claimIds));
    const claims = new Map([...ids].map((id) => {
      const c = claimTarget(p, id);
      return [id, { statement: c.statement, population: c.population }] as const;
    }));
    packet = buildContentPacket(targets, claims, readFileSync(safety, "utf8"), now.toISOString());
  } else {
    throw new Error("pass --claims <ids> or --course <id>");
  }

  const digest = packetDigest(packet);
  const out = join(dir("SPINDLE_REVIEW_DIR"), digest);
  writeJson(join(out, "packet.json"), packet);
  writeFileSync(join(out, "prompt.txt"), reviewPrompt(packet), { mode: 0o600 });
  console.log(`packet ${digest}: ${packet.items.length} items -> ${out}`);
  if (a.has("dry-run")) return 0;

  const outcome = await runReview(packet, codexRunner({ timeoutMs: Number(a.get("timeout-ms") ?? 30 * 60_000) }));
  writeJson(join(out, "outcome.json"), outcome);
  if (!outcome.ok) {
    console.log("NOT APPROVED (nothing will be recorded):");
    for (const e of outcome.errors) console.log(`  - ${e}`);
    return 1;
  }
  console.log(`reviewed by ${outcome.run.model}, session ${outcome.run.session}; record with record-review.ts --dir ${out}`);
  for (const [id, item] of Object.entries(outcome.items)) console.log(`  ${id}: ${item.verdict} (${item.findings.length} findings)`);
  return 0;
});
