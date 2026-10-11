/**
 * Practice-media registry upkeep (D-09, ADR 0007). Needs SPINDLE_DB_URL and SPINDLE_PUBLISHER_ID.
 *   admit   --video <id> --start <s> --end <s> --rationale "<why>"   oEmbed preflight, admit, store metadata
 *   recheck                                                            oEmbed every active clip; a failure records a failed check and disables it
 *   refresh                                                            refresh provider metadata older than 25 days (served only under 30)
 *   retire  --media <id> --reason "<why>"                              retire a clip; its metadata is deleted
 * Segment reviews (the model check of the selected segment) are recorded separately; see the audiovisual capability notes.
 * Exit 0 ok, 1 something failed or was disabled, 2 error.
 */
import { createContext } from "../src/context";
import { requireUuid } from "../src/guards";
import { checkYouTubeEmbed, embedRecheckActions, METADATA_REFRESH_DAYS, YOUTUBE_ID } from "../src/media";
import { args, lit, main, publisherId, serviceValue, sql } from "./lib/cli";

const call = (fn: string, ...params: string[]) => serviceValue(`public.${fn}(${[lit(publisherId()), ...params].join(", ")})`);

function activeMedia(where = "true"): { id: string; video_id: string }[] {
  const rows = sql(`select coalesce(json_agg(json_build_object('id', m.id, 'video_id', m.video_id)), '[]') from public.practice_media m
    left join public.practice_media_metadata md on md.media_id = m.id
    where coalesce((select status from public.practice_media_status s where s.media_id = m.id order by seq desc limit 1), 'active') = 'active' and ${where}`);
  return JSON.parse(rows) as { id: string; video_id: string }[];
}

main(async () => {
  const a = args();
  const cmd = a.positional[0];
  const ctx = createContext();
  if (cmd === "admit") {
    const video = a.get("video") ?? "";
    if (!YOUTUBE_ID.test(video)) throw new Error("--video must be a YouTube video id");
    const check = await checkYouTubeEmbed(ctx, video);
    if (check.status !== "embeddable") {
      console.log(`not admitted: ${check.status} (${check.detail})`);
      return 1;
    }
    const body = { provider: "youtube", videoId: video, startSeconds: Number(a.get("start")), endSeconds: Number(a.get("end")), rationale: a.get("rationale") ?? "", embedCheckedAt: check.checkedAt };
    const id = call("publisher_admit_media", `${lit(JSON.stringify(body))}::jsonb`);
    call("publisher_refresh_media_metadata", lit(id), `${lit(JSON.stringify({ title: check.title.slice(0, 500), channel: check.channel.slice(0, 200), available: true, fetchedAt: check.checkedAt }))}::jsonb`);
    console.log(`admitted ${id} (${video} ${body.startSeconds}-${body.endSeconds}s). It still needs a passing segment review before any lesson can publish it.`);
    return 0;
  }
  if (cmd === "recheck") {
    let failed = 0;
    for (const m of activeMedia()) {
      const check = await checkYouTubeEmbed(ctx, m.video_id);
      const act = embedRecheckActions(check);
      call("publisher_record_media_check", lit(m.id), `${lit(JSON.stringify({ kind: "embed", outcome: act.outcome, checkedAt: check.checkedAt, notes: act.notes }))}::jsonb`);
      if (act.disable) {
        call("publisher_set_media_status", lit(m.id), `${lit(JSON.stringify({ status: "disabled", reason: act.notes.slice(0, 500) }))}::jsonb`);
        failed++;
      }
      console.log(`${m.id} ${m.video_id}: ${act.outcome}${act.disable ? " (disabled)" : ""}`);
    }
    return failed > 0 ? 1 : 0;
  }
  if (cmd === "refresh") {
    let failed = 0;
    for (const m of activeMedia(`(md.fetched_at is null or md.fetched_at < now() - interval '${METADATA_REFRESH_DAYS} days')`)) {
      const check = await checkYouTubeEmbed(ctx, m.video_id);
      if (check.status === "embeddable") {
        call("publisher_refresh_media_metadata", lit(m.id), `${lit(JSON.stringify({ title: check.title.slice(0, 500), channel: check.channel.slice(0, 200), available: true, fetchedAt: check.checkedAt }))}::jsonb`);
        console.log(`${m.id}: refreshed`);
      } else {
        failed++;
        console.log(`${m.id}: ${check.status}; not refreshed (run recheck)`);
      }
    }
    return failed > 0 ? 1 : 0;
  }
  if (cmd === "retire") {
    const id = requireUuid(a.get("media"), "--media");
    const reason = a.get("reason");
    if (!reason) throw new Error("--reason is required");
    call("publisher_set_media_status", lit(id), `${lit(JSON.stringify({ status: "retired", reason }))}::jsonb`);
    const left = sql(`select count(*) from public.practice_media_metadata where media_id = ${lit(id)}`);
    console.log(`retired ${id}; metadata rows left: ${left}`);
    return left === "0" ? 0 : 1;
  }
  throw new Error("usage: media.ts admit|recheck|refresh|retire …");
});
