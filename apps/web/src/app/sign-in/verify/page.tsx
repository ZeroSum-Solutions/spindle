import { Suspense } from "react";
import { Button, ErrorNote, Field, Page } from "@/components/ui";
import { verifyCode } from "../actions";

export default function VerifyPage({ searchParams }: PageProps<"/sign-in/verify">) {
  return (
    <Page title="Check your email">
      <Suspense>
        <VerifyForm searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function VerifyForm({ searchParams }: { searchParams: PageProps<"/sign-in/verify">["searchParams"] }) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email : "";
  return (
    <form action={verifyCode} className="flex flex-col gap-4">
      <p className="text-foreground/70">
        We sent a code to <strong>{email}</strong>.
      </p>
      <ErrorNote message={typeof params.error === "string" ? params.error : undefined} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={typeof params.next === "string" ? params.next : "/gyms"} />
      <Field label="6-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required />
      <Button type="submit">Sign in</Button>
    </form>
  );
}
