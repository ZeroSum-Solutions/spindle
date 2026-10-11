import type { Metadata } from "next";
import { Page } from "@/components/ui";
import { PRIVACY_URL, TERMS_URL } from "@/lib/video/youtube";

export const metadata: Metadata = { title: "Terms: Spindle" };

const link = "text-brand underline underline-offset-2 hover:text-brand-hover";

export default function TermsPage() {
  return (
    <Page title="Terms">
      <p className="text-text-muted">
        These are the working terms for the Spindle app during development. They are not yet complete legal terms; full terms will be published
        before Spindle is offered to trainers outside test gyms.
      </p>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Education, not medical advice</h2>
        <p>
          Spindle teaches personal trainers how the body works. It does not diagnose or treat anyone, and nothing in it replaces a clinician. Lessons
          say when to stop and refer.
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Embedded YouTube videos</h2>
        <p>
          Optional coaching videos play from YouTube inside the lesson only after you press Play. Pressing Play is your choice for that video, and
          YouTube&apos;s own{" "}
          <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className={link}>
            terms of service
          </a>{" "}
          and{" "}
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={link}>
            Google&apos;s privacy policy
          </a>{" "}
          then apply to the player. Videos are always labelled practice-based, are never a research source, and are never needed to complete a
          lesson. Spindle may switch a video off at any time.
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Open source</h2>
        <p>The app is open source under AGPL-3.0. Original curriculum text is licensed under CC BY-SA 4.0.</p>
      </section>
    </Page>
  );
}
