import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { slugSchema } from "@/lib/forms";
import { createClient, currentUser } from "@/lib/supabase/server";

export type CompleteState =
  | { status: "idle" }
  | { status: "saved"; completedAt: string; versionNumber: number }
  | { status: "error"; message: string };

const completeSchema = z.object({ gym: slugSchema, assignmentId: z.uuid(), lessonId: z.uuid() });

/** The rendered route's lesson. Comes only from server-held route context, never from a form. */
export type LessonRoute = z.input<typeof completeSchema>;

const NOT_SAVED: CompleteState = { status: "error", message: "We could not save your progress. Try again." };
const NOT_FOUND: CompleteState = { status: "error", message: "This lesson is no longer assigned to you here. Reload the page." };

/**
 * Marks the route's lesson done. Not a server action itself: the lesson page wraps it
 * in an inline action that closes over the route values (Next encrypts them), so a
 * client cannot point it at another gym, assignment or lesson. It still re-binds
 * them: the gym by slug through RLS, the assignment to that gym and to the caller,
 * and the lesson to that assignment's version, before the idempotent RPC runs.
 */
export async function completeLesson(route: LessonRoute): Promise<CompleteState> {
  const parsed = completeSchema.safeParse(route);
  if (!parsed.success) return NOT_FOUND;
  const { gym, assignmentId, lessonId } = parsed.data;
  const me = await currentUser();
  if (!me) return { status: "error", message: "Your session ended. Sign in again to save your progress." };
  const supabase = await createClient();

  const { data: org, error: orgError } = await supabase.from("orgs").select("id").eq("slug", gym).maybeSingle();
  if (orgError) return NOT_SAVED;
  if (!org) return NOT_FOUND;
  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select("id, version_id, curriculum_versions!inner(version_number)")
    .eq("id", assignmentId)
    .eq("org_id", org.id)
    .eq("user_id", me.id)
    .maybeSingle();
  if (assignmentError) return NOT_SAVED;
  if (!assignment) return NOT_FOUND;
  const { data: inVersion, error: lessonError } = await supabase
    .from("version_lessons")
    .select("lesson_id")
    .eq("version_id", assignment.version_id)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (lessonError) return NOT_SAVED;
  if (!inVersion) return NOT_FOUND;

  const { data: completionId, error } = await supabase.rpc("complete_lesson", { p_assignment: assignment.id, p_lesson: lessonId });
  if (error || !completionId) return NOT_SAVED;
  const { data: saved, error: readError } = await supabase
    .from("lesson_completions")
    .select("completed_at")
    .eq("id", completionId)
    .eq("user_id", me.id)
    .maybeSingle();
  if (readError || !saved) return NOT_SAVED;

  revalidatePath(`/gyms/${gym}/learn`, "layout");
  return { status: "saved", completedAt: saved.completed_at, versionNumber: assignment.curriculum_versions.version_number };
}
