import type { Metadata } from "next";
import { Page } from "@/components/ui";
import { PRIVACY_URL, TERMS_URL } from "@/lib/video/youtube";

export const metadata: Metadata = { title: "Privacy: Spindle" };

const link = "text-brand underline underline-offset-2 hover:text-brand-hover";

export default function PrivacyPage() {
  return (
    <Page title="Privacy">
      <p className="text-text-muted">
        This page describes how the Spindle app handles your information today. It is not yet a complete legal privacy notice; a full notice will be
        published before Spindle is offered to trainers outside test gyms.
      </p>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">What Spindle stores</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>Your email address, to send you sign-in codes.</li>
          <li>The gyms you belong to and your role in each.</li>
          <li>Which courses you are assigned, the lessons you complete, and your graded quiz attempts.</li>
          <li>A sign-in session cookie, so you stay signed in. Spindle sets no advertising or analytics cookies.</li>
        </ul>
        <p>Your gym&apos;s owner and leads can see the progress of members in their gym. Other gyms cannot.</p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Videos from YouTube</h2>
        <p>Some lessons offer an optional coaching video hosted on YouTube. Spindle does not host or copy these videos.</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>Until you press Play, nothing is loaded from YouTube or Google: no thumbnail, no player and no script.</li>
          <li>
            When you press Play, your browser loads YouTube&apos;s privacy-enhanced player (youtube-nocookie.com) and YouTube&apos;s player script. From
            then on, YouTube and Google can collect data and store information on your device under{" "}
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={link}>
              Google&apos;s privacy policy
            </a>{" "}
            and{" "}
            <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className={link}>
              YouTube&apos;s terms
            </a>
            .
          </li>
          <li>The player receives Spindle&apos;s web address (origin) only, not the page you were on.</li>
          <li>Videos are never required: you can complete every lesson without pressing Play.</li>
        </ul>
      </section>
    </Page>
  );
}
