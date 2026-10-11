/**
 * Monthly retraction recheck. Runs verifySource for every DOI source cited by a claim, records
 * any retraction through publisher_record_retraction (which flags published versions), and
 * reports every source whose status is unknown. Unknown is never "not retracted": the run
 * exits 1 until each unknown source is resolved.
 *   SPINDLE_CONTACT_EMAIL=… SPINDLE_DB_URL=… SPINDLE_PUBLISHER_ID=… tsx scripts/retraction-recheck.ts [--dry-run]
 * Exit 0 all verified, 1 retractions recorded or unknowns remain, 2 error.
 */
import { createContext } from "../src/context";
import { recheckAction } from "../src/retraction";
import { verifySource } from "../src/verify";
import { args, lit, main, publisherId, serviceValue, sql } from "./lib/cli";

main(async () => {
  const dry = args().has("dry-run");
  const ctx = createContext();
  ctx.requireEmail();
  const sources = JSON.parse(sql(`select coalesce(json_agg(json_build_object('id', s.id, 'doi', s.doi) order by s.doi), '[]') from public.sources s
    where s.doi is not null and exists (select 1 from public.claim_sources cs where cs.source_id = s.id)
      and not exists (select 1 from public.source_retractions r where r.source_id = s.id)`)) as { id: string; doi: string }[];
  const noDoi = sql(`select count(*) from public.sources s where s.doi is null and exists (select 1 from public.claim_sources cs where cs.source_id = s.id)
    and not exists (select 1 from public.source_retractions r where r.source_id = s.id)`);
  let recorded = 0;
  let unknown = 0;
  for (const s of sources) {
    const action = recheckAction(await verifySource(ctx, s.doi));
    if (action.action === "clear") console.log(`ok       ${s.doi}`);
    else if (action.action === "unknown") {
      unknown++;
      console.log(`UNKNOWN  ${s.doi}: ${action.issues.join("; ")}`);
    } else {
      recorded++;
      const flagged = dry ? "dry run" : serviceValue(`public.publisher_record_retraction(${lit(publisherId())}, ${lit(s.id)}, ${lit(JSON.stringify(action.notice))}::jsonb)`);
      console.log(`RETRACTED ${s.doi}: recorded (${action.notice.origin}); versions flagged: ${flagged}`);
    }
  }
  if (noDoi !== "0") console.log(`${noDoi} cited sources have no DOI (textbook or nomenclature): check them by hand`);
  console.log(`checked ${sources.length}: ${recorded} retracted, ${unknown} unknown`);
  return recorded > 0 || unknown > 0 ? 1 : 0;
});
