// D-11: a Gemini model describes a public, embeddable YouTube segment from the
// video itself (Google's native YouTube input: no download, no captions
// scraping). It approves nothing: Sol reviews the description. Fail closed:
// anything but a complete direct-video description is "not described".
import { createHash } from "node:crypto";
import { z } from "zod";
import type { RunReceipt } from "../review/harness";
import { canonicalJson } from "../review/packet";

export const DESCRIBER_MODEL = "gemini-3.8-flash";
/** Introductory list price per 1M tokens (Vertex AI pricing, through 2026-12-31); video billed as input. */
export const DESCRIBER_PRICE = { inputPerM: 0.75, outputPerM: 3.75 } as const;
/** Seconds either side of the segment, so omitted qualifications are visible. */
export const CONTEXT_SECONDS = 15;
export const MAX_DESCRIBE_SECONDS = 600;
export const MAX_OUTPUT_TOKENS = 4096;
export const THINKING_BUDGET = 1024;
/** Observed about 91 video tokens per second (2026-10-11 probe); bound with headroom. */
const VIDEO_TOKENS_PER_SECOND_BOUND = 150;

export interface SegmentRef {
  mediaId: string;
  videoId: string;
  startSeconds: number;
  endSeconds: number;
  rationale: string;
}

const line = z.strictObject({ t: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/), text: z.string().min(1).max(2000) });
export const segmentDescriptionSchema = z.strictObject({
  access: z.literal("direct-video"),
  spoken: z.array(line).max(200),
  visual: z.array(line).min(1).max(200),
  uncertain: z.array(z.string().min(1).max(1000)).max(50),
});
export type SegmentDescription = z.output<typeof segmentDescriptionSchema>;

export function describeWindow(seg: SegmentRef): { start: number; end: number } {
  const start = Math.max(0, seg.startSeconds - CONTEXT_SECONDS);
  const end = seg.endSeconds + CONTEXT_SECONDS;
  if (!/^[A-Za-z0-9_-]{11}$/.test(seg.videoId)) throw new Error("not a YouTube video id");
  if (!(seg.endSeconds > seg.startSeconds) || end - start > MAX_DESCRIBE_SECONDS) throw new Error(`a described window must be 1 to ${MAX_DESCRIBE_SECONDS} seconds`);
  return { start, end };
}

const PROMPT = (seg: SegmentRef, w: { start: number; end: number }) => `You describe a coaching video segment for a curriculum safety reviewer. You approve nothing.
You were given the window ${w.start}s to ${w.end}s; the selected segment is ${seg.startSeconds}s to ${seg.endSeconds}s and the rest is context.
Return JSON with exactly these keys:
"access": "direct-video" only if you received this video's audio and frames as input;
"spoken": [{"t": "m:ss", "text": "..."}], the speaker's instructions and claims, close to verbatim;
"visual": [{"t": "m:ss", "text": "..."}], what is visibly demonstrated: body position, equipment, load, movement, range, on-screen text;
"uncertain": everything in the window you could not hear or see clearly. Do not guess; never fill gaps.`;

/** The exact request body. Its digest is the describer run's packet digest. */
export function describeRequest(seg: SegmentRef): object {
  const w = describeWindow(seg);
  return {
    contents: [{ role: "user", parts: [
      { fileData: { fileUri: `https://www.youtube.com/watch?v=${seg.videoId}` }, videoMetadata: { startOffset: `${w.start}s`, endOffset: `${w.end}s` } },
      { text: PROMPT(seg, w) },
    ] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingConfig: { thinkingBudget: THINKING_BUDGET } },
  };
}

/** An upper bound on one describe call's cost, for the spend cap. */
export function estimateMaxCostUsd(seg: SegmentRef): number {
  const w = describeWindow(seg);
  const input = (w.end - w.start) * VIDEO_TOKENS_PER_SECOND_BOUND + 2000;
  return (input * DESCRIBER_PRICE.inputPerM + (MAX_OUTPUT_TOKENS + THINKING_BUDGET) * DESCRIBER_PRICE.outputPerM) / 1e6;
}

const usageSchema = z.object({
  promptTokenCount: z.number().int().min(0),
  candidatesTokenCount: z.number().int().min(0).default(0),
  thoughtsTokenCount: z.number().int().min(0).default(0),
});

export function costUsd(usage: z.input<typeof usageSchema>): number {
  const u = usageSchema.parse(usage);
  return Math.round(((u.promptTokenCount * DESCRIBER_PRICE.inputPerM + (u.candidatesTokenCount + u.thoughtsTokenCount) * DESCRIBER_PRICE.outputPerM) / 1e6) * 1e6) / 1e6;
}

export type DescribeResult =
  | { ok: true; description: SegmentDescription; run: RunReceipt; costUsd: number; uncertain: boolean }
  | { ok: false; error: string; costUsd: number };

const responseSchema = z.object({
  modelVersion: z.string().optional(),
  responseId: z.string().optional(),
  usageMetadata: usageSchema.optional(),
  candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional() }).passthrough()) }).optional(), finishReason: z.string().optional() }).passthrough()).optional(),
});

export interface DescribeDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  apiKey: string;
  now: () => Date;
}

/** Calls the Gemini API once. The key travels only in a header and never reaches an error or receipt. */
export async function describeSegment(seg: SegmentRef, deps: DescribeDeps): Promise<DescribeResult> {
  const body = describeRequest(seg);
  const digest = createHash("sha256").update(canonicalJson(body)).digest("hex");
  const scrub = (s: string) => (deps.apiKey ? s.split(deps.apiKey).join("***") : s);
  let res: Response;
  try {
    res = await deps.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${DESCRIBER_MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": deps.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(600_000),
    });
  } catch (e) {
    return { ok: false, error: scrub(`describer request failed: ${e instanceof Error ? e.message : String(e)}`).slice(0, 300), costUsd: 0 };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: `describer HTTP ${res.status}: not JSON`, costUsd: 0 };
  }
  const parsed = responseSchema.safeParse(json);
  const cost = parsed.success && parsed.data.usageMetadata ? costUsd(parsed.data.usageMetadata) : 0;
  if (!res.ok) return { ok: false, error: `describer HTTP ${res.status}`, costUsd: cost };
  if (!parsed.success) return { ok: false, error: "describer response is malformed", costUsd: cost };
  const cand = parsed.data.candidates?.[0];
  if (cand?.finishReason !== "STOP") return { ok: false, error: `describer did not finish (${cand?.finishReason ?? "no candidate"})`, costUsd: cost };
  const text = (cand.content?.parts ?? []).map((p) => p.text ?? "").join("");
  let desc: unknown;
  try {
    desc = JSON.parse(text);
  } catch {
    return { ok: false, error: "describer answer is not JSON", costUsd: cost };
  }
  const d = segmentDescriptionSchema.safeParse(desc);
  if (!d.success) return { ok: false, error: `describer answer is not a complete direct-video description: ${d.error.issues[0]?.message ?? ""}`.slice(0, 300), costUsd: cost };
  const model = parsed.data.modelVersion ?? DESCRIBER_MODEL;
  if (!model.startsWith(DESCRIBER_MODEL)) return { ok: false, error: `describer answered with ${model}`, costUsd: cost };
  const session = (parsed.data.responseId ?? "").replace(/[^A-Za-z0-9._:-]/g, "");
  if (!session) return { ok: false, error: "describer response has no id", costUsd: cost };
  return {
    ok: true,
    description: d.data,
    run: { model: DESCRIBER_MODEL, session: `gemini-${session}`.slice(0, 200), packetDigest: digest, reviewedAt: deps.now().toISOString() },
    costUsd: cost,
    uncertain: d.data.uncertain.length > 0,
  };
}
