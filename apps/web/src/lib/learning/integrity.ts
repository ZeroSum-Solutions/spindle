import "server-only";

import { parseVersionIntegrity, type ClaimIntegrityState } from "@spindle/schema";
import type { LearnerGym } from "./load";

/** The version's claim integrity (version_integrity) keyed by claim id, or null when it cannot be read. */
export async function versionIntegrity(ctx: LearnerGym, versionId: string, lessonId: string): Promise<Map<string, ClaimIntegrityState> | null> {
  const { data, error } = await ctx.supabase.rpc("version_integrity", { p_version: versionId });
  if (error) return null;
  try {
    return new Map(parseVersionIntegrity(data).filter((r) => r.lessonId === lessonId).map((r) => [r.claimId, r.state]));
  } catch {
    return null;
  }
}
