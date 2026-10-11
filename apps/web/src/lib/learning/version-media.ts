import "server-only";

import { z } from "zod";
import { parseVersionMedia, type MediaAvailability } from "@spindle/schema";
import { createClient } from "@/lib/supabase/server";
import { clipState } from "@/lib/video/youtube";
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

const ids = z.object({ versionId: z.uuid(), mediaId: z.uuid() });

/**
 * Asked again the moment a learner presses play: is this clip still playable in this
 * version, for this signed-in reader? Anything but a fresh "playable" answer is false.
 */
export async function clipPlayableNow(versionId: string, mediaId: string): Promise<boolean> {
  const parsed = ids.safeParse({ versionId, mediaId });
  if (!parsed.success) return false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("version_media", { p_version: parsed.data.versionId });
    if (error) return false;
    return clipState(parseVersionMedia(data).find((m) => m.mediaId === parsed.data.mediaId)) === "playable";
  } catch {
    return false;
  }
}
