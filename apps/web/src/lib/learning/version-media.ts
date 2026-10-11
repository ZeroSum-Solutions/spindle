import "server-only";

import { parseVersionMedia, type MediaAvailability } from "@spindle/schema";
import type { LearnerGym } from "./load";

/**
 * Registry state of the clips a version embeds (version_media), keyed by media id.
 * A failed read returns an empty map, so every clip fails closed to "switched off".
 */
export async function versionMedia(ctx: LearnerGym, versionId: string): Promise<Map<string, MediaAvailability>> {
  const { data, error } = await ctx.supabase.rpc("version_media", { p_version: versionId });
  if (error) return new Map();
  try {
    return new Map(parseVersionMedia(data).map((m) => [m.mediaId, m]));
  } catch {
    return new Map();
  }
}
