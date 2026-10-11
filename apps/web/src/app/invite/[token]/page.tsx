import Link from "next/link";
import { Suspense } from "react";
import { Button, ErrorNote, Page } from "@/components/ui";
import { currentUser } from "@/lib/supabase/server";
import { acceptInvite } from "../../gyms/actions";

export default function InvitePage(props: PageProps<"/invite/[token]">) {
  return (
    <Page title="Join a gym on Spindle">
      <Suspense fallback={<p>Loading…</p>}>
        <Invite {...props} />
      </Suspense>
    </Page>
  );
}

async function Invite({ params, searchParams }: PageProps<"/invite/[token]">) {
  const [{ token }, query, me] = await Promise.all([params, searchParams, currentUser()]);
  if (!me) {
    return (
      <p>
        <Link className="underline underline-offset-4" href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}>
          Sign in with the email the invite was sent to
        </Link>{" "}
        to accept it.
      </p>
    );
  }
  return (
    <form action={acceptInvite} className="flex flex-col gap-4">
      <ErrorNote message={typeof query.error === "string" ? query.error : undefined} />
      <p className="text-foreground/70">Signed in as {me.email}.</p>
      <input type="hidden" name="token" value={token} />
      <Button type="submit">Accept invite</Button>
    </form>
  );
}
