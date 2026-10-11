import { sql, type PlayerWorld } from "../player-fixtures";

// Synthetic practice-media registry clips for browser tests (ADR 0007). Clips are admitted,
// checked and described through the real publisher RPCs, with a synthetic review run: no
// model is called and no real video is published. Cleanup removes exactly these rows.

const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const asService = `select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true);`;

export interface ClipSpec {
  videoId: string;
  startSeconds: number;
  endSeconds: number;
  rationale: string;
}

export class PracticeMedia {
  readonly ids: string[] = [];

  constructor(private readonly world: PlayerWorld) {}

  /** Admits a clip that version_media will report as playable, with fresh provider metadata. */
  playable(spec: ClipSpec, metadata: { title: string; channel: string; available: boolean }): string {
    const p = lit(this.world.publisherId);
    const n = this.ids.length + 1;
    const run = JSON.stringify({ model: "synthetic-fixture", session: `ci-media-${this.world.run}-${n}`, packetDigest: "0".repeat(63) + "5", reviewedAt: "2026-10-01T00:00:00Z" });
    const now = new Date().toISOString();
    const id = sql(`begin; ${asService}
      select public.publisher_admit_media(${p}, ${lit(JSON.stringify({ provider: "youtube", ...spec, embedCheckedAt: now }))}::jsonb);
      commit;`)
      .split("\n")
      .at(-1)!;
    this.ids.push(id);
    sql(`begin; ${asService}
      select public.publisher_record_media_check(${p}, ${lit(id)}, ${lit(JSON.stringify({ kind: "segment", outcome: "pass", checkedAt: now, run: JSON.parse(run) }))}::jsonb);
      select public.publisher_refresh_media_metadata(${p}, ${lit(id)}, ${lit(JSON.stringify({ ...metadata, fetchedAt: now }))}::jsonb);
      commit;`);
    return id;
  }

  /** Switches a clip off at once, for every version. */
  disable(id: string): void {
    sql(`begin; ${asService}
      select public.publisher_set_media_status(${lit(this.world.publisherId)}, ${lit(id)}, '{"status": "disabled", "reason": "synthetic e2e"}'::jsonb);
      commit;`);
  }

  /** The video block a lesson embeds: it must equal the registry entry. */
  block(id: string, spec: ClipSpec) {
    return { kind: "video", content: { mediaId: id, provider: "youtube", ...spec, caption: "" } };
  }

  /** Run before the world's cleanup, which removes the review runs these checks point to. */
  cleanup(): void {
    if (this.ids.length === 0) return;
    const ids = this.ids.map(lit).join(", ");
    const tables = ["practice_media", "practice_media_checks", "practice_media_status", "practice_media_metadata"];
    sql(`begin;
      ${tables.map((t) => `alter table public.${t} disable trigger user;`).join("\n")}
      delete from public.practice_media_metadata where media_id in (${ids});
      delete from public.practice_media_status where media_id in (${ids});
      delete from public.practice_media_checks where media_id in (${ids});
      delete from public.practice_media where id in (${ids});
      ${tables.map((t) => `alter table public.${t} enable trigger user;`).join("\n")}
      commit;`);
    const left = sql(`select count(*) from public.practice_media where id in (${ids})`);
    if (left !== "0") throw new Error(`media cleanup left ${left} clips`);
  }
}
