import { z } from "zod";
import type { EvidenceContext } from "./context";

const BASE = "https://wger.de/api/v2/exerciseinfo/";
const ENGLISH = 2;

const muscle = z.object({ id: z.number(), name: z.string(), name_en: z.string().optional() });

const exerciseSchema = z.object({
  id: z.number(),
  uuid: z.string(),
  category: z.object({ name: z.string() }),
  muscles: z.array(muscle),
  muscles_secondary: z.array(muscle),
  equipment: z.array(z.object({ id: z.number(), name: z.string() })),
  license: z.object({ full_name: z.string(), short_name: z.string(), url: z.string() }),
  license_author: z.string().nullish(),
  translations: z.array(z.object({ name: z.string(), language: z.number() })),
});

const listSchema = z.object({ count: z.number(), results: z.array(exerciseSchema) });

export interface WgerMuscle {
  id: number;
  name: string;
  nameEn?: string;
}

export interface WgerExercise {
  id: number;
  uuid: string;
  name?: string;
  category: string;
  muscles: WgerMuscle[];
  musclesSecondary: WgerMuscle[];
  equipment: string[];
  /** wger data is CC BY-SA 4.0 for most exercises: keep the license and author with the record. */
  license: { name: string; shortName: string; url: string };
  licenseAuthor?: string;
}

const toMuscle = (m: z.output<typeof muscle>): WgerMuscle => ({ id: m.id, name: m.name, nameEn: m.name_en || undefined });

export async function listWgerExercises(
  ctx: EvidenceContext,
  opts: { limit?: number; offset?: number; language?: number } = {},
): Promise<{ total: number; exercises: WgerExercise[] }> {
  const language = opts.language ?? ENGLISH;
  const p = new URLSearchParams({
    format: "json",
    language: String(language),
    limit: String(opts.limit ?? 20),
    offset: String(opts.offset ?? 0),
  });
  const data = await ctx.http.fetchJson(`${BASE}?${p}`, listSchema, { userAgent: ctx.userAgent() });
  return {
    total: data.count,
    exercises: data.results.map((e) => ({
      id: e.id,
      uuid: e.uuid,
      name: e.translations.find((t) => t.language === language)?.name,
      category: e.category.name,
      muscles: e.muscles.map(toMuscle),
      musclesSecondary: e.muscles_secondary.map(toMuscle),
      equipment: e.equipment.map((q) => q.name),
      license: { name: e.license.full_name, shortName: e.license.short_name, url: e.license.url },
      licenseAuthor: e.license_author ?? undefined,
    })),
  };
}
