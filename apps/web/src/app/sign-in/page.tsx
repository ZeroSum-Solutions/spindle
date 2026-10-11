import { Suspense } from "react";
import { Button, ErrorNote, Field, Page } from "@/components/ui";
import { sendCode } from "./actions";

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <Page title="Sign in">
      <p className="text-foreground/70">We email you a 6-digit code. New here? The same step creates your account.</p>
      <Suspense>
        <SignInForm searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function SignInForm({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const params = await searchParams;
  return (
    <form action={sendCode} className="flex flex-col gap-4">
      <ErrorNote message={typeof params.error === "string" ? params.error : undefined} />
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <input type="hidden" name="next" value={typeof params.next === "string" ? params.next : "/gyms"} />
      <Button type="submit">Email me a code</Button>
    </form>
  );
}
