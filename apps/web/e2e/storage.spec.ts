// Storage isolation through the real Storage API (no browser page). Synthetic
// actors and objects are unique to this run and removed in afterAll.
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient, cleanupRun, lit, serviceClient, sql, sqlErrorInRollback, type Call } from "./helpers/local-supabase";

// Traces record request headers, which carry the service key and access tokens.
test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

const run = `c2-${Date.now().toString(36)}-${randomBytes(2).toString("hex")}`;
const password = randomBytes(24).toString("base64url");
const png = (n: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n]);

// Everything this run may create, named before any request is made.
const emails = {
  ownerA: `owner-a-${run}@a.test`,
  leadA: `lead-a-${run}@a.test`,
  trainerA: `trainer-a-${run}@a.test`,
  ownerB: `owner-b-${run}@b.test`,
};
const slugs = { a: `${run}-a`, b: `${run}-b` };
const runObjects = `(bucket_id = 'org-media' and name like ${lit(`%/${run}/%`)}) or (bucket_id = 'content-media' and name like ${lit(`${run}/%`)})`;

type Actor = { id: string; email: string; client: SupabaseClient; calls: Call[] };
const serviceCalls: Call[] = [];
let service: SupabaseClient;
let ownerA: Actor, leadA: Actor, trainerA: Actor, ownerB: Actor;
let orgA: string, orgB: string;
const a = (name: string) => `${orgA}/${run}/${name}`;
const b = (name: string) => `${orgB}/${run}/${name}`;
const g = (name: string) => `${run}/${name}`;

/** Method and HTTP status of the latest call a client made, e.g. "POST 200". */
const last = (calls: Call[]) => `${calls.at(-1)?.method} ${calls.at(-1)?.status}`;

async function actor(email: string): Promise<Actor> {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  const calls: Call[] = [];
  const entry: Actor = { id: data.user.id, email, client: anonClient(calls), calls };
  const signIn = await entry.client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`sign-in: ${signIn.error.message}`);
  return entry;
}

async function rpc<T>(who: Actor, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await who.client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

async function join(owner: Actor, member: Actor, org: string, role: "lead" | "trainer") {
  const token = await rpc<string>(owner, "create_invite", { target_org: org, invitee_email: member.email, invitee_role: role });
  await rpc(member, "accept_invite", { invite_token: token });
}

/** Database truth: does a row exist for this object? */
function exists(bucket: string, name: string): boolean {
  const [[n]] = sql(`select count(*) from storage.objects where bucket_id = ${lit(bucket)} and name = ${lit(name)}`) as [[string]];
  return n === "1";
}

/** Bytes of an object as the service role sees them, or null. */
async function bytes(bucket: string, name: string): Promise<number[] | null> {
  const { data } = await service.storage.from(bucket).download(name);
  return data ? [...new Uint8Array(await data.arrayBuffer())] : null;
}

// Storage hides database messages, so a trigger exception reaches the client
// as HTTP 500 with only its SQLSTATE. The guard raises P0001.
const GUARD_500 = "database error, code: P0001";
const MOVE_GUARD = "media objects cannot move between orgs or buckets @ PL/pgSQL function private.guard_media_objects() line 6 at RAISE";
const ORG_GUARD = "org-media objects must live under an existing org id @ PL/pgSQL function private.guard_media_objects() line 10 at RAISE";

/**
 * Names the cause of a GUARD_500: replays the same row change as the same
 * database role in a rolled-back transaction and returns the database message.
 */
function replayAs(who: Actor | "service", change: string): string | null {
  const role =
    who === "service"
      ? `set local role service_role; select set_config('request.jwt.claims', '{"role":"service_role"}', true);`
      : `set local role authenticated; select set_config('request.jwt.claims', ${lit(JSON.stringify({ sub: who.id, role: "authenticated" }))}, true);`;
  return sqlErrorInRollback(`${role}\n${change};`);
}
const moveRow = (from: [string, string], to: [string, string]) =>
  `update storage.objects set bucket_id = ${lit(to[0])}, name = ${lit(to[1])} where bucket_id = ${lit(from[0])} and name = ${lit(from[1])}`;

/** The observed HTTP status, storage error code and message of a failed call. */
function denial(error: unknown) {
  const e = error as { status?: number; statusCode?: string; message?: string } | null;
  return { status: e?.status, statusCode: e?.statusCode, message: e?.message };
}

test.beforeAll(async () => {
  service = serviceClient(serviceCalls);
  ownerA = await actor(emails.ownerA);
  leadA = await actor(emails.leadA);
  trainerA = await actor(emails.trainerA);
  ownerB = await actor(emails.ownerB);
  orgA = await rpc<string>(ownerA, "create_org", { org_name: "C2 Gym A", org_slug: slugs.a });
  orgB = await rpc<string>(ownerB, "create_org", { org_name: "C2 Gym B", org_slug: slugs.b });
  await join(ownerA, leadA, orgA, "lead");
  await join(ownerA, trainerA, orgA, "trainer");
  // Lead A also leads gym B, so only the move guard stops it carrying an object across.
  await join(ownerB, leadA, orgB, "lead");
});

test.afterAll(async () => {
  test.setTimeout(60_000);
  await cleanupRun({ emails: Object.values(emails), slugs: Object.values(slugs), objects: runObjects });
});

test("the Storage API is up and both media buckets are private", async () => {
  const { data, error } = await service.storage.listBuckets();
  expect(error, "storage-api is not running").toBeNull();
  expect(last(serviceCalls)).toBe("GET 200");
  const buckets = Object.fromEntries((data ?? []).map((bk) => [bk.id, bk.public]));
  expect(buckets).toMatchObject({ "org-media": false, "content-media": false });
});

test("owners and leads manage their own gym's media; trainers read it", async () => {
  const lead = leadA.client.storage.from("org-media");
  expect((await lead.upload(a("one.png"), png(1), { contentType: "image/png" })).error).toBeNull();
  expect(last(leadA.calls)).toBe("POST 200");
  expect(exists("org-media", a("one.png"))).toBe(true);
  expect((await lead.update(a("one.png"), png(2), { contentType: "image/png" })).error).toBeNull();
  expect(last(leadA.calls)).toBe("PUT 200");
  expect(await bytes("org-media", a("one.png"))).toEqual([...png(2)]);
  expect((await lead.move(a("one.png"), a("two.png"))).error).toBeNull();
  expect(last(leadA.calls)).toBe("POST 200");
  expect([exists("org-media", a("one.png")), exists("org-media", a("two.png"))]).toEqual([false, true]);

  const trainerRead = await trainerA.client.storage.from("org-media").download(a("two.png"));
  expect(trainerRead.error).toBeNull();
  expect(last(trainerA.calls)).toBe("GET 200");
  expect([...new Uint8Array(await trainerRead.data!.arrayBuffer())]).toEqual([...png(2)]);

  const removed = await lead.remove([a("two.png")]);
  expect(removed.error).toBeNull();
  expect(last(leadA.calls)).toBe("DELETE 200");
  expect(removed.data?.map((o) => o.name)).toEqual([a("two.png")]);
  expect(exists("org-media", a("two.png"))).toBe(false);

  // The owner can too; this object stays for the denial cases below.
  expect((await ownerA.client.storage.from("org-media").upload(a("keep.png"), png(3), { contentType: "image/png" })).error).toBeNull();
  expect(last(ownerA.calls)).toBe("POST 200");
  const listed = await lead.list(`${orgA}/${run}`);
  expect(last(leadA.calls)).toBe("POST 200");
  expect(listed.data?.map((o) => o.name)).toEqual(["keep.png"]);
});

test("a trainer cannot write their gym's media", async () => {
  const trainer = trainerA.client.storage.from("org-media");
  // Positive control: the trainer can read the object the denials target.
  expect((await trainer.download(a("keep.png"))).error).toBeNull();
  expect(last(trainerA.calls)).toBe("GET 200");
  const up = await trainer.upload(a("trainer.png"), png(4), { contentType: "image/png" });
  expect(denial(up.error)).toEqual({ status: 400, statusCode: "403", message: "new row violates row-level security policy" });
  expect(exists("org-media", a("trainer.png"))).toBe(false);

  const upd = await trainer.update(a("keep.png"), png(5), { contentType: "image/png" });
  expect(denial(upd.error)).toEqual({ status: 400, statusCode: "403", message: "new row violates row-level security policy" });
  const del = await trainer.remove([a("keep.png")]);
  expect(del.error).toBeNull();
  expect(last(trainerA.calls)).toBe("DELETE 200"); // filtered by RLS: success, nothing removed
  expect(del.data).toEqual([]);
  const mv = await trainer.move(a("keep.png"), a("moved.png"));
  expect(denial(mv.error)).toEqual({ status: 400, statusCode: "404", message: "Object not found" });
  expect([exists("org-media", a("keep.png")), exists("org-media", a("moved.png"))]).toEqual([true, false]);
  expect(await bytes("org-media", a("keep.png"))).toEqual([...png(3)]);
});

test("another gym cannot read, write, delete or move this gym's media", async () => {
  const outsider = ownerB.client.storage.from("org-media");
  // Positive control: owner B can write and read in their own gym.
  expect((await outsider.upload(b("b-own.png"), png(11), { contentType: "image/png" })).error).toBeNull();
  expect(last(ownerB.calls)).toBe("POST 200");
  expect((await outsider.download(b("b-own.png"))).error).toBeNull();
  expect(last(ownerB.calls)).toBe("GET 200");
  const read = await outsider.download(a("keep.png"));
  expect(read.data).toBeNull();
  expect(denial(read.error)).toEqual({ status: 400, statusCode: "404", message: "Object not found" });
  const listed = await outsider.list(`${orgA}/${run}`);
  expect(listed.data).toEqual([]);
  expect(last(ownerB.calls)).toBe("POST 200");

  const up = await outsider.upload(a("intruder.png"), png(6), { contentType: "image/png" });
  expect(denial(up.error)).toEqual({ status: 400, statusCode: "403", message: "new row violates row-level security policy" });
  expect(exists("org-media", a("intruder.png"))).toBe(false);

  const del = await outsider.remove([a("keep.png")]);
  expect(del.error).toBeNull();
  expect(last(ownerB.calls)).toBe("DELETE 200");
  expect(del.data).toEqual([]);

  const mv = await outsider.move(a("keep.png"), b("stolen.png"));
  expect(denial(mv.error)).toEqual({ status: 400, statusCode: "404", message: "Object not found" });
  expect([exists("org-media", a("keep.png")), exists("org-media", b("stolen.png"))]).toEqual([true, false]);
  expect(await bytes("org-media", a("keep.png"))).toEqual([...png(3)]);
});

test("a lead of both gyms still cannot move media between them", async () => {
  // Positive control: lead A can write in gym B, so a denial below is the move guard, not RLS.
  expect((await leadA.client.storage.from("org-media").upload(b("own-b.png"), png(7), { contentType: "image/png" })).error).toBeNull();
  expect(last(leadA.calls)).toBe("POST 200");
  const mv = await leadA.client.storage.from("org-media").move(a("keep.png"), b("carried.png"));
  expect(denial(mv.error)).toEqual({ status: 500, statusCode: "500", message: GUARD_500 });
  expect(replayAs(leadA, moveRow(["org-media", a("keep.png")], ["org-media", b("carried.png")]))).toBe(MOVE_GUARD);
  expect([exists("org-media", a("keep.png")), exists("org-media", b("carried.png"))]).toEqual([true, false]);
  expect(await bytes("org-media", a("keep.png"))).toEqual([...png(3)]);
});

test("global media is read-only to signed-in users and closed to visitors", async () => {
  expect((await service.storage.from("content-media").upload(g("global.png"), png(8), { contentType: "image/png" })).error).toBeNull();
  expect(last(serviceCalls)).toBe("POST 200");
  const read = await trainerA.client.storage.from("content-media").download(g("global.png"));
  expect(read.error).toBeNull();
  expect(last(trainerA.calls)).toBe("GET 200");
  expect([...new Uint8Array(await read.data!.arrayBuffer())]).toEqual([...png(8)]);

  const up = await ownerA.client.storage.from("content-media").upload(g("tenant.png"), png(9), { contentType: "image/png" });
  expect(denial(up.error)).toEqual({ status: 400, statusCode: "403", message: "new row violates row-level security policy" });
  expect(exists("content-media", g("tenant.png"))).toBe(false);
  const del = await ownerA.client.storage.from("content-media").remove([g("global.png")]);
  expect(del.error).toBeNull();
  expect(del.data).toEqual([]);
  expect(last(ownerA.calls)).toBe("DELETE 200");
  expect(exists("content-media", g("global.png"))).toBe(true);

  const visitor = anonClient();
  for (const [bucket, name] of [["content-media", g("global.png")], ["org-media", a("keep.png")]] as const) {
    const r = await visitor.storage.from(bucket).download(name);
    expect(r.data, `${bucket} visitor read`).toBeNull();
    expect(denial(r.error), `${bucket} visitor read`).toEqual({ status: 400, statusCode: "404", message: "Object not found" });
  }
});

test("the service role cannot move media across gyms or buckets", async () => {
  const org = service.storage.from("org-media");
  // Positive control: the service role moves an object within one gym.
  expect((await org.upload(a("svc.png"), png(12), { contentType: "image/png" })).error).toBeNull();
  expect(last(serviceCalls)).toBe("POST 200");
  expect((await org.move(a("svc.png"), a("svc-moved.png"))).error).toBeNull();
  expect(last(serviceCalls)).toBe("POST 200");
  expect([exists("org-media", a("svc.png")), exists("org-media", a("svc-moved.png"))]).toEqual([false, true]);
  const across = await org.move(a("keep.png"), b("service.png"));
  expect(denial(across.error)).toEqual({ status: 500, statusCode: "500", message: GUARD_500 });
  expect(replayAs("service", moveRow(["org-media", a("keep.png")], ["org-media", b("service.png")]))).toBe(MOVE_GUARD);
  expect([exists("org-media", a("keep.png")), exists("org-media", b("service.png"))]).toEqual([true, false]);

  const bucket = await org.move(a("keep.png"), g("from-org.png"), { destinationBucket: "content-media" });
  expect(denial(bucket.error)).toEqual({ status: 500, statusCode: "500", message: GUARD_500 });
  expect(replayAs("service", moveRow(["org-media", a("keep.png")], ["content-media", g("from-org.png")]))).toBe(MOVE_GUARD);
  expect([exists("org-media", a("keep.png")), exists("content-media", g("from-org.png"))]).toEqual([true, false]);
  expect(await bytes("org-media", a("keep.png"))).toEqual([...png(3)]);

  // An org-media path must start with an existing gym's id.
  const orphan = `00000000-0000-4000-8000-000000000000/${run}/orphan.png`;
  const up = await org.upload(orphan, png(10), { contentType: "image/png" });
  expect(denial(up.error)).toEqual({ status: 500, statusCode: "500", message: GUARD_500 });
  expect(replayAs("service", `insert into storage.objects (bucket_id, name) values ('org-media', ${lit(orphan)})`)).toBe(ORG_GUARD);
  expect(exists("org-media", orphan)).toBe(false);
});
