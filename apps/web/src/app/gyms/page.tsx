import Link from "next/link";
import { Suspense } from "react";
import { Button, ErrorNote, Field, Page } from "@/components/ui";
import { createClient, currentUser } from "@/lib/supabase/server";
import { signOut } from "../sign-in/actions";
import { createGym } from "./actions";

export default function GymsPage({ searchParams }: PageProps<"/gyms">) {
  return (
    <Page title="Your gyms">
      <Suspense fallback={<p>Loading your gyms…</p>}>
        <GymList searchParams={searchParams} />
      </Suspense>
      <form action={signOut}>
        <button className="text-sm underline underline-offset-4">Sign out</button>
      </form>
    </Page>
  );
}

async function GymList({ searchParams }: { searchParams: PageProps<"/gyms">["searchParams"] }) {
  const [params, me] = await Promise.all([searchParams, currentUser()]);
  if (!me) return null;
  const supabase = await createClient();
  // RLS shows every membership in my gyms; I only want my own rows.
  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("role, orgs(name, slug)")
    .eq("user_id", me.id)
    .order("created_at");
  if (error) throw new Error("Could not load your gyms. Try again.");
  const gyms = memberships.flatMap((m) => (m.orgs ? [{ ...m.orgs, role: m.role }] : []));

  return (
    <>
      {gyms.length > 0 ? (
        <ul className="flex flex-col divide-y divide-foreground/10 rounded-md border border-foreground/15">
          {gyms.map((gym) => (
            <li key={gym.slug}>
              <Link href={`/gyms/${gym.slug}`} className="flex min-h-11 items-center justify-between px-4 py-3">
                <span className="font-medium">{gym.name}</span>
                <span className="text-sm text-foreground/60">{gym.role}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-foreground/70">You are not part of a gym yet. Create one, or open an invite link.</p>
      )}
      <form action={createGym} className="flex flex-col gap-4 rounded-md border border-foreground/15 p-4">
        <h2 className="text-lg font-semibold">Create a gym</h2>
        <ErrorNote message={typeof params.error === "string" ? params.error : undefined} />
        <Field label="Gym name" name="name" required maxLength={120} />
        <Field label="Web address (e.g. rise-performance)" name="slug" required pattern="[a-z0-9][a-z0-9\-]{1,46}[a-z0-9]" />
        <Button type="submit">Create gym</Button>
      </form>
    </>
  );
}
