/**
 * The founder publishing entry point (plan section 7: retraction status is rechecked before every
 * publish). Rechecks every source cited by the global course draft with verifySource, records any
 * retraction through publisher_record_retraction, and refuses to publish while any cited paper is
 * retracted, unknown or uncheckable (no DOI). Only then calls publisher_publish_course, whose
 * database gate repeats every receipt check.
 *   SPINDLE_CONTACT_EMAIL=… SPINDLE_DB_URL=… SPINDLE_PUBLISHER_ID=… tsx scripts/publish.ts --course <id>
 * Exit 0 published, 1 refused, 2 error.
 */
import { createContext } from "../src/context";
import { requireUuid } from "../src/guards";
import { prepublishDecision, type CitedSource } from "../src/retraction";
import type { SourceCheck } from "../src/types";
import { verifySource } from "../src/verify";
import { args, lit, main, publisherId, serviceValue, sql } from "./lib/cli";

main(async () => {
  const course = requireUuid(args().get("course"), "--course");
  const p = publisherId();
  const ctx = createContext();
  ctx.requireEmail();
  if (sql(`select count(*) from public.courses where id = ${lit(course)} and org_id is null`) !== "1") throw new Error("no such global course");
  const sources = JSON.parse(sql(`select coalesce(json_agg(distinct jsonb_build_object('id', s.id, 'doi', s.doi, 'kind', s.kind)), '[]')
    from public.lessons l join public.lesson_blocks b on b.lesson_id = l.id join public.block_claims bc on bc.block_id = b.id
    join public.claim_sources cs on cs.claim_id = bc.claim_id join public.sources s on s.id = cs.source_id
    where l.course_id = ${lit(course)}`)) as CitedSource[];
  const checks = new Map<string, SourceCheck>();
  for (const s of sources) if (s.doi) checks.set(s.id, await verifySource(ctx, s.doi));
  const d = prepublishDecision(sources, checks);
  for (const r of d.record) {
    const flagged = serviceValue(`public.publisher_record_retraction(${lit(p)}, ${lit(r.sourceId)}, ${lit(JSON.stringify(r.notice))}::jsonb)`);
    console.log(`RETRACTED source ${r.sourceId}: recorded; versions flagged ${flagged}`);
  }
  for (const u of d.unknown) console.log(`UNKNOWN source ${u.sourceId}: ${u.issues.join("; ")}`);
  for (const id of d.unverifiable) console.log(`UNCHECKABLE source ${id}: a paper without a DOI cannot be rechecked`);
  if (!d.publish) {
    console.log(`refused: ${sources.length} cited sources rechecked; not publishing`);
    return 1;
  }
  console.log(`${sources.length} cited sources rechecked: none retracted`);
  console.log(`published version ${serviceValue(`public.publisher_publish_course(${lit(p)}, ${lit(course)})`)}`);
  return 0;
});
