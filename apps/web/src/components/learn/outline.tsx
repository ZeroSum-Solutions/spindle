import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { CourseView } from "@/lib/learning/view";
import { LessonStateLabel, ProgressText } from "./labels";

/**
 * The course's lessons in order, with literal states. A sidebar from 1024px; below
 * that, the same list in a native disclosure placed before the lesson, so order
 * and the current item stay the same on phones. Only one copy is ever displayed.
 */
export function LessonOutline({ view, base, currentId }: { view: CourseView; base: string; currentId?: string }) {
  const list = (
    <ol className="flex flex-col gap-1">
      {view.lessons.map((lesson, i) => {
        const current = lesson.id === currentId;
        return (
          <li key={lesson.id}>
            <Link
              href={`${base}/${lesson.slug}`}
              aria-current={current ? "page" : undefined}
              className={`flex min-h-11 flex-col gap-0.5 rounded-small py-2 pr-3 pl-4 ${current ? "cut-marker text-brand" : "hover:bg-surface-muted"}`}
            >
              <span className="text-label">
                <span className="font-mono text-code text-text-muted">{String(i + 1).padStart(2, "0")}</span> {lesson.title}
              </span>
              <LessonStateLabel lesson={lesson} />
            </Link>
          </li>
        );
      })}
    </ol>
  );
  return (
    <>
      <nav aria-label="Course outline" className="hidden lg:block">
        <p className="mb-2 px-3">
          <ProgressText done={view.done} total={view.total} />
        </p>
        {list}
      </nav>
      <details className="rounded-card border border-border bg-surface lg:hidden">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 px-4 font-medium">
          <span>
            Course outline <span className="font-normal text-text-muted">· {view.done} of {view.total} done</span>
          </span>
          <ChevronDown aria-hidden strokeWidth={1.75} className="disclosure-chevron size-5" />
        </summary>
        <nav aria-label="Course outline" className="border-t border-border p-2">
          {list}
        </nav>
      </details>
    </>
  );
}
