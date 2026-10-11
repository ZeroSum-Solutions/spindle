// Synthetic fixtures for the learner-flow browser tests. Test-only: host psql
// against the local (or ephemeral CI) database provisions a synthetic publisher
// and drives the named publisher and tenant RPCs as those actors. The app under
// test never gets a service key. Every id is owned by one run and removed by
// targeted cleanup, which asserts that nothing it created is left.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const MAILPIT = "http://127.0.0.1:54324";

/** Fixtures write synthetic rows; they only ever talk to this machine. */
export function assertLoopback(url: string, what: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`player fixtures refuse an unparsable ${what} URL`);
  }
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]") {
    throw new Error(`player fixtures refuse a non-local ${what} (${host})`);
  }
}

const PLAIN_NAME = /^[A-Za-z0-9_]{1,63}$/;

/**
 * psql arguments and environment built only from validated parts of a database URL.
 * psql would otherwise honour host/hostaddr/service query parameters in the URI and
 * PGHOST, PGHOSTADDR, PGSERVICE and friends in the environment, any of which could
 * point it at another machine. So: no query string, a loopback host, a numeric port,
 * plain user and database names, and a child environment with every PG* variable
 * removed except the ones set here.
 */
export function psqlConnection(url: string, env: Record<string, string | undefined>): { args: string[]; env: Record<string, string> } {
  assertLoopback(url, "database");
  const u = new URL(url);
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") throw new Error("player fixtures need a postgresql:// database URL");
  if (u.search || u.hash) throw new Error("player fixtures refuse database URL parameters");
  const port = u.port || "5432";
  const user = decodeURIComponent(u.username) || "postgres";
  const database = decodeURIComponent(u.pathname.slice(1)) || "postgres";
  if (!/^\d{1,5}$/.test(port) || !PLAIN_NAME.test(user) || !PLAIN_NAME.test(database)) {
    throw new Error("player fixtures refuse an unusual database port, user or name");
  }
  const clean = Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => !e[0].startsWith("PG") && e[1] !== undefined));
  return {
    args: ["-h", u.hostname.replace(/^\[(.*)\]$/, "$1"), "-p", port, "-U", user, "-d", database, "-w"],
    env: {
      ...clean,
      PGPASSWORD: decodeURIComponent(u.password),
      PGCONNECT_TIMEOUT: "5",
      PGOPTIONS: "-c statement_timeout=20s -c lock_timeout=10s",
    },
  };
}
const DB = psqlConnection(DB_URL, process.env);

/** Runs SQL as the database owner and returns trimmed, unaligned output. Never logs values. */
export function sql(text: string): string {
  return execFileSync("psql", [...DB.args, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-At"], { input: text, encoding: "utf8", env: DB.env as NodeJS.ProcessEnv }).trim();
}

const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const asUser = (id: string) =>
  `select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${lit(JSON.stringify({ sub: id, role: "authenticated" }))}, true);`;
const asService = `select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true);`;

/**
 * A synthetic review run (ADR 0007): CI records receipts through the real RPCs and never calls
 * a model. The session is unique per test run, so each run's cleanup removes only its own run row.
 */
const runReceipt = (run: string) =>
  `${lit(JSON.stringify({ model: "synthetic-fixture", session: `ci-player-${run}`, packetDigest: "0".repeat(63) + "4", reviewedAt: "2026-10-01T00:00:00Z" }))}::jsonb`;

/** The app's public Supabase settings: CI exports them; locally they come from the ignored .env.local. */
export function publicEnv(): { url: string; key: string } {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    const local = Object.fromEntries(
      readFileSync(join(__dirname, "../.env.local"), "utf8")
        .split("\n")
        .flatMap((line) => (/^\s*([A-Z_]+)=(.*)$/.exec(line) ? [[RegExp.$1, RegExp.$2.trim()]] : [])),
    );
    url ??= local.NEXT_PUBLIC_SUPABASE_URL;
    key ??= local.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and _PUBLISHABLE_KEY are required");
  assertLoopback(url, "Supabase API");
  return { url, key };
}

// ---- Sign-in codes -----------------------------------------------------------------

async function messageIds(email: string): Promise<Set<string>> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=50`);
  const { messages } = (await res.json()) as { messages: { ID: string }[] };
  return new Set(messages.map((m) => m.ID));
}

/** Waits for a sign-in code that arrived after `before` was taken, so a stale code is never reused. */
export async function codeAfter(email: string, before: Set<string>): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=5`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    const fresh = messages.find((m) => !before.has(m.ID));
    if (fresh) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${fresh.ID}`)).json()) as { Text: string };
      const code = /\b(\d{6})\b/.exec(msg.Text)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("no new sign-in code arrived");
}

export { messageIds };

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Signs a synthetic user in through real Auth (creating them on first use) and returns a user client. */
export async function userClient(email: string): Promise<{ client: SupabaseClient; id: string }> {
  const { url, key } = publicEnv();
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const before = await messageIds(email);
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw new Error(`could not request a code: ${error.message}`);
  const { data, error: verifyError } = await client.auth.verifyOtp({ email, token: await codeAfter(email, before), type: "email" });
  if (verifyError || !data.user) throw new Error(`could not verify the code: ${verifyError?.message}`);
  await pause(1100); // Auth allows one code per address per second.
  return { client, id: data.user.id };
}

// ---- Synthetic curriculum ------------------------------------------------------------

type Json = Record<string, unknown>;

export interface LessonSpec {
  id: string;
  slug: string;
  title: string;
  blocks: Json[];
  media?: Json[];
  resources?: Json[];
}

export function courseJson(id: string, partId: string, layer: "base" | "method", title: string, lessons: LessonSpec[]): Json {
  return {
    id,
    slug: `synthetic-${id.slice(0, 8)}`,
    layer,
    title,
    subtitle: "Synthetic test course",
    description: "Synthetic.",
    level: "foundation",
    outcomes: [],
    parts: [
      {
        id: partId,
        ordinal: 1,
        title: "Synthetic part",
        summary: "",
        lessons: lessons.map((l) => ({
          id: l.id,
          slug: l.slug,
          title: l.title,
          summary: "Synthetic lesson.",
          durationMinutes: 5,
          format: "article",
          objectives: ["Synthetic objective"],
          anatomyIds: [],
          blocks: l.blocks,
          media: l.media ?? [],
          resources: l.resources ?? [],
        })),
      },
    ],
  };
}

export const practice = (text: string): Json => ({ kind: "paragraph", content: text, support: "practice-based", claimIds: [] });

// ---- Run-owned world -------------------------------------------------------------------

export interface Actor {
  email: string;
  id: string;
}

/** Everything one test run creates. Cleanup removes exactly these rows. */
export class PlayerWorld {
  readonly run = Date.now().toString(36);
  readonly publisherId = randomUUID();
  readonly actors = new Map<string, Actor>();
  readonly orgs = new Map<string, { id: string; slug: string }>();
  readonly courses: string[] = [];
  readonly uploads: { client: SupabaseClient; bucket: string; name: string }[] = [];
  readonly doi: string;

  constructor() {
    this.doi = `10.5555/spindle-e2e.${this.run}.a-deliberately-long-synthetic-suffix-that-must-wrap-0123456789abcdef`;
  }

  email(name: string): string {
    return `${name}-${this.run}@player.test`;
  }

  /** Creates the synthetic publisher, who never signs in to the app. */
  publisher(): void {
    sql(`
      insert into auth.users (id, email, email_confirmed_at) values (${lit(this.publisherId)}, ${lit(this.email("publisher"))}, now());
      insert into private.content_publishers (user_id, note) values (${lit(this.publisherId)}, 'synthetic player e2e');
    `);
  }

  async actor(name: string): Promise<Actor & { client: SupabaseClient }> {
    const email = this.email(name);
    const { client, id } = await userClient(email);
    this.actors.set(name, { email, id });
    return { email, id, client };
  }

  /** The owner creates a gym through the tenant RPC. */
  gym(key: string, owner: Actor): { id: string; slug: string } {
    const slug = `player-${key}-${this.run}`;
    const id = sql(`begin; ${asUser(owner.id)} select public.create_org(${lit(`Synthetic gym ${key.toUpperCase()}`)}, ${lit(slug)}); commit;`)
      .split("\n")
      .at(-1)!;
    this.orgs.set(key, { id, slug });
    return { id, slug };
  }

  /** Adds a member through the invite RPCs, as the owner and then the invitee. */
  join(org: { id: string }, owner: Actor, member: Actor): void {
    const token = sql(`begin; ${asUser(owner.id)} select public.create_invite(${lit(org.id)}, ${lit(member.email)}, 'trainer'); commit;`)
      .split("\n")
      .at(-1)!;
    sql(`begin; ${asUser(member.id)} select public.accept_invite(${lit(token)}); commit;`);
  }

  /** An approved synthetic claim with one synthetic source. Returns [claimId, sourceId]. */
  claim(): [string, string] {
    const out = sql(`begin; ${asService}
      select public.publisher_add_source(${lit(this.publisherId)}, ${lit(JSON.stringify({ kind: "systematic_review", title: `Synthetic review ${this.run}`, doi: this.doi, license: "Synthetic test record" }))});
      select public.publisher_add_claim(${lit(this.publisherId)}, jsonb_build_object('statement', ${lit(`Synthetic claim ${this.run}.`)},
        'evidenceLevel', 'Synthetic level', 'population', 'Synthetic population',
        'sourceIds', jsonb_build_array((select id from public.sources where doi = ${lit(this.doi)}))));
      select public.publisher_review_claim(${lit(this.publisherId)}, c.id,
        jsonb_build_object('decision', 'approved', 'expiresAt', to_char(now() + interval '1 year', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'expectedHash', public.publisher_claim_target(${lit(this.publisherId)}, c.id) ->> 'hash', 'run', ${runReceipt(this.run)},
          'receipt', '{"existenceCheckedAt": "2026-10-01T00:00:00Z", "faithfulness": "faithful", "retractionCheckedAt": "2026-10-01T00:00:00Z"}'::jsonb))
      from public.claims c where c.statement = ${lit(`Synthetic claim ${this.run}.`)};
      commit;`).split("\n");
    const claim = sql(`select id from public.claims where statement = ${lit(`Synthetic claim ${this.run}.`)}`);
    const source = sql(`select id from public.sources where doi = ${lit(this.doi)}`);
    if (out.length === 0 || !claim || !source) throw new Error("claim fixture failed");
    return [claim, source];
  }

  /**
   * Saves and publishes a global course as the publisher, recording synthetic block, lesson
   * and course receipts against the hashes and claim sets the database reports. Returns the version id.
   */
  publishGlobal(course: Json): string {
    if (!this.courses.includes(String(course.id))) this.courses.push(String(course.id));
    const p = lit(this.publisherId);
    const c = lit(String(course.id));
    return sql(`begin; ${asService}
      select public.publisher_save_course_draft(${p}, ${lit(JSON.stringify(course))}::jsonb);
      select public.publisher_review_block(${p}, (b ->> 'blockId')::uuid, jsonb_build_object('verdict', 'supported',
          'expectedHash', b -> 'hash', 'claimIds', b -> 'claimIds', 'run', ${runReceipt(this.run)}))
        from jsonb_path_query(public.publisher_review_targets(${p}, ${c}), '$.lessons[*].blocks[*] ? (@.claimIds.size() > 0)') b;
      select public.publisher_review_lesson(${p}, (l ->> 'lessonId')::uuid, jsonb_build_object('verdict', 'clean',
          'expectedHash', l -> 'hash', 'claimIds', l -> 'claimIds', 'checks', '{"safety": "pass", "originality": "pass"}'::jsonb,
          'findings', '[]'::jsonb, 'run', ${runReceipt(this.run)}))
        from jsonb_path_query(public.publisher_review_targets(${p}, ${c}), '$.lessons[*]') l;
      select public.publisher_review_course(${p}, ${c}, jsonb_build_object('verdict', 'clean',
          'expectedHash', public.publisher_review_targets(${p}, ${c}) -> 'course' -> 'hash',
          'checks', '{"safety": "pass", "originality": "pass"}'::jsonb, 'findings', '[]'::jsonb, 'run', ${runReceipt(this.run)}));
      select public.publisher_publish_course(${p}, ${c});
      commit;`)
      .split("\n")
      .at(-1)!;
  }

  /** Saves and publishes a gym method course as its owner or lead. Returns the version id. */
  publishMethod(org: { id: string }, author: Actor, course: Json): string {
    if (!this.courses.includes(String(course.id))) this.courses.push(String(course.id));
    return sql(`begin; ${asUser(author.id)}
      select public.save_course_draft(${lit(org.id)}, ${lit(JSON.stringify(course))}::jsonb);
      select public.publish_course(${lit(String(course.id))});
      commit;`)
      .split("\n")
      .at(-1)!;
  }

  /** Assigns a version through the tenant RPC, as the gym's owner. Returns the assignment id. */
  assign(org: { id: string }, owner: Actor, versionId: string, learner: Actor): string {
    return sql(`begin; ${asUser(owner.id)} select public.assign_version(${lit(org.id)}, ${lit(versionId)}, ${lit(learner.id)}); commit;`)
      .split("\n")
      .at(-1)!;
  }

  retract(sourceId: string): void {
    sql(`begin; ${asService}
      select public.publisher_record_retraction(${lit(this.publisherId)}, ${lit(sourceId)},
        '{"origin": "manual", "reference": "synthetic e2e notice", "detectedAt": "2026-10-11T00:00:00Z"}'::jsonb);
      commit;`);
  }

  completions(learner: Actor, org: { id: string }): { id: string; version_id: string; lesson_id: string; content_hash: string; completed_at: string; origin_completion_id: string | null }[] {
    const out = sql(`select coalesce(json_agg(row_to_json(c) order by c.completed_at, c.id), '[]') from (
      select id, version_id, lesson_id, content_hash, to_char(completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"') as completed_at, origin_completion_id
      from public.lesson_completions where user_id = ${lit(learner.id)} and org_id = ${lit(org.id)}) c`);
    return JSON.parse(out);
  }

  manifest(versionId: string): { versionId: string; lessons: { lessonId: string; contentHash: string }[] } {
    const out = sql(`select coalesce(json_agg(json_build_object('lessonId', lesson_id, 'contentHash', content_hash) order by ordinal), '[]')
      from public.version_lessons where version_id = ${lit(versionId)}`);
    return { versionId, lessons: JSON.parse(out) };
  }

  /** Removes exactly this run's rows and asserts none remain. Immutable-history triggers are paused only inside this transaction. */
  async cleanup(): Promise<void> {
    for (const u of this.uploads) await u.client.storage.from(u.bucket).remove([u.name]);
    const users = [this.publisherId, ...[...this.actors.values()].map((a) => a.id)].map(lit).join(", ");
    const orgs = [...this.orgs.values()].map((o) => lit(o.id)).join(", ") || "null";
    const courses = this.courses.map(lit).join(", ") || "null";
    const p = lit(this.publisherId);
    const tables = ["sources", "claims", "claim_sources", "claim_reviews", "source_retractions", "binding_reviews", "lesson_reviews", "course_reviews", "review_runs", "curriculum_versions", "version_lessons", "version_claims", "version_flags"];
    sql(`begin;
      ${tables.map((t) => `alter table public.${t} disable trigger user;`).join("\n")}
      delete from public.orgs where id in (${orgs});
      delete from public.courses where id in (${courses});
      delete from public.binding_reviews where reviewer = ${p};
      delete from public.lesson_reviews where reviewer = ${p};
      delete from public.course_reviews where reviewer = ${p};
      delete from public.claim_reviews where reviewer = ${p};
      delete from public.version_flags where source_id in (select id from public.sources where created_by = ${p});
      delete from public.source_retractions where recorded_by = ${p};
      delete from public.claim_sources where claim_id in (select id from public.claims where created_by = ${p});
      delete from public.claims where created_by = ${p};
      delete from public.sources where created_by = ${p};
      delete from public.review_runs where recorded_by = ${p};
      delete from private.content_audit where actor in (${users});
      delete from auth.users where id in (${users});
      ${tables.map((t) => `alter table public.${t} enable trigger user;`).join("\n")}
      commit;`);
    const left = sql(`select (select count(*) from auth.users where id in (${users}))
      + (select count(*) from public.orgs where id in (${orgs}))
      + (select count(*) from public.courses where id in (${courses}))
      + (select count(*) from public.sources where created_by = ${p})
      + (select count(*) from public.claims where created_by = ${p})
      + (select count(*) from public.claim_reviews where reviewer = ${p})
      + (select count(*) from public.binding_reviews where reviewer = ${p})
      + (select count(*) from public.lesson_reviews where reviewer = ${p})
      + (select count(*) from public.course_reviews where reviewer = ${p})
      + (select count(*) from public.review_runs where recorded_by = ${p})
      + (select count(*) from public.source_retractions where recorded_by = ${p})
      + (select count(*) from public.curriculum_versions where course_id in (${courses}))
      + (select count(*) from public.assignments where user_id in (${users}))
      + (select count(*) from public.lesson_completions where user_id in (${users}))
      + (select count(*) from private.content_publishers where user_id = ${p})
      + (select count(*) from private.content_audit where actor in (${users}))
      + (select count(*) from storage.objects where name like ${lit(`%/${this.run}/%`)})`);
    if (left !== "0") throw new Error(`cleanup left ${left} run-owned rows`);
  }
}
