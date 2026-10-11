// D-11: a Gemini model describes a public, embeddable YouTube segment from the
// video itself (Google's native YouTube input: no download, no captions
// scraping). It approves nothing: Sol reviews the description. Fail closed:
// anything but a complete direct-video description is "not described".
import { createHash } from "node:crypto";
import { z } from "zod";
import type { RunReceipt } from "../review/harness";
import { canonicalJson } from "../review/packet";
import { CONTEXT_SECONDS, descriptionTimesError } from "./timestamps";

export const DESCRIBER_MODEL = "gemini-3.8-flash";
/**
 * Gemini Developer API paid-tier list prices per 1M tokens (video billed as input, thinking as
 * output), read from https://ai.google.dev/gemini-api/docs/pricing on 2026-10-11. Each period
 * holds only until its date; past the last one every call is refused until the prices are
 * verified again (Sol PR20-06).
 */
export const DESCRIBER_PRICES = [
  { until: "2027-01-01T00:00:00Z", inputPerM: 0.75, outputPerM: 3.75 },
  { until: "2027-04-01T00:00:00Z", inputPerM: 1.5, outputPerM: 7.5 },
] as const;
export const DESCRIBER_PRICES_VERIFIED_AT = "2026-10-11";
export const MAX_DESCRIBE_SECONDS = 600;
export const MAX_OUTPUT_TOKENS = 4096;
export const THINKING_BUDGET = 1024;
/**
 * The documented upper rate: about 300 tokens per second of video at high media resolution
 * (https://ai.google.dev/gemini-api/docs/video-understanding, 2026-10-11). The request uses the
 * default (about 100); a 2026-10-11 probe measured 91.
 */
const VIDEO_TOKENS_PER_SECOND_BOUND = 300;
const PROMPT_TOKENS_BOUND = 2000;

/** The verified price for a call made at this time, or a refusal. */
export function describerPrice(at: Date): { inputPerM: number; outputPerM: number } {
  const price = DESCRIBER_PRICES.find((p) => at.getTime() < Date.parse(p.until));
  if (!price) throw new Error(`describer prices were verified on ${DESCRIBER_PRICES_VERIFIED_AT} and no longer cover this date; verify them again before spending`);
  return price;
}

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
"uncertain": everything in the window you could not hear or see clearly. Do not guess; never fill gaps.
Every "t" is the time in the full video (so between ${w.start}s and ${w.end}s), not the time from the start of the window.`;

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

/** An upper bound on one describe call's cost at this time, for the spend cap. */
export function estimateMaxCostUsd(seg: SegmentRef, at: Date): number {
  const w = describeWindow(seg);
  const price = describerPrice(at);
  const input = (w.end - w.start) * VIDEO_TOKENS_PER_SECOND_BOUND + PROMPT_TOKENS_BOUND;
  return (input * price.inputPerM + (MAX_OUTPUT_TOKENS + THINKING_BUDGET) * price.outputPerM) / 1e6;
}

// The reported total is required: without it the billable usage is unknown (Sol R2 PR20-02).
const usageSchema = z.object({
  promptTokenCount: z.number().int().min(0),
  candidatesTokenCount: z.number().int().min(0).default(0),
  thoughtsTokenCount: z.number().int().min(0).default(0),
  totalTokenCount: z.number().int().min(0),
});

/**
 * An upper bound on what the call was billed: the prompt at the input price, and everything
 * else the total reports (or the output counts, if larger) at the output price.
 */
export function costUsd(usage: z.input<typeof usageSchema>, at: Date): number {
  const u = usageSchema.parse(usage);
  const price = describerPrice(at);
  const output = Math.max(u.candidatesTokenCount + u.thoughtsTokenCount, u.totalTokenCount - u.promptTokenCount);
  // Rounded up to the micro-dollar, so rounding never understates spend.
  return Math.ceil(u.promptTokenCount * price.inputPerM + output * price.outputPerM - 1e-6) / 1e6;
}

export type DescribeResult =
  | { ok: true; description: SegmentDescription; run: RunReceipt; costUsd: number; uncertain: boolean }
  /**
   * costUsd is null when the charge is unknown: the call may have been billed (Sol PR20-02).
   * `refused` marks an HTTP 429 or 5xx that reported no usage: the provider did no work, so the
   * caller may release its reservation (T15). Anything else keeps the reservation.
   */
  | { ok: false; error: string; costUsd: number | null; refused?: boolean; status?: number };

const responseSchema = z.object({
  modelVersion: z.string().optional(),
  responseId: z.string().optional(),
  candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional() }).passthrough()) }).optional(), finishReason: z.string().optional() }).passthrough()).optional(),
});

export interface DescribeDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  apiKey: string;
  now: () => Date;
}

/** Only a short code from the response may reach an error; anything else is replaced. */
const code = (v: unknown, re: RegExp, fallback: string) => (typeof v === "string" && re.test(v) ? v : fallback);

/**
 * Calls the Gemini API once. The key travels only in a header and never reaches an error or
 * receipt. The cost comes from the response's usage alone; without it the cost is unknown.
 */
export async function describeSegment(seg: SegmentRef, deps: DescribeDeps): Promise<DescribeResult> {
  const body = describeRequest(seg);
  const digest = createHash("sha256").update(canonicalJson(body)).digest("hex");
  const at = deps.now();
  const scrub = (s: string) => (deps.apiKey ? s.split(deps.apiKey).join("***") : s).slice(0, 300);
  const fail = (error: string, cost: number | null): DescribeResult => ({ ok: false, error: scrub(error), costUsd: cost });
  let res: Response;
  try {
    res = await deps.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${DESCRIBER_MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": deps.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(600_000),
    });
  } catch (e) {
    return fail(`describer request failed: ${e instanceof Error ? e.message : String(e)}`, null);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return fail(`describer HTTP ${res.status}: not JSON`, null);
  }
  const usage = usageSchema.safeParse((json as { usageMetadata?: unknown } | null)?.usageMetadata);
  const cost = usage.success ? costUsd(usage.data, at) : null;
  if (!res.ok) {
    const refused = cost === null && (res.status === 429 || (res.status >= 500 && res.status <= 599));
    return { ...fail(`describer HTTP ${res.status}`, cost), ...(refused ? { refused: true, status: res.status } : {}) };
  }
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) return fail("describer response is malformed", cost);
  if (cost === null) return fail("describer response reports no usage, so its cost is unknown", null);
  const cand = parsed.data.candidates?.[0];
  if (cand?.finishReason !== "STOP") return fail(`describer did not finish (${code(cand?.finishReason, /^[A-Z_]{1,40}$/, cand ? "unexpected reason" : "no candidate")})`, cost);
  const text = (cand.content?.parts ?? []).map((p) => p.text ?? "").join("");
  let desc: unknown;
  try {
    desc = JSON.parse(text);
  } catch {
    return fail("describer answer is not JSON", cost);
  }
  const d = segmentDescriptionSchema.safeParse(desc);
  if (!d.success) return fail("describer answer is not a complete direct-video description", cost);
  const times = descriptionTimesError(d.data, seg);
  if (times) return fail(`describer answer does not describe the segment: ${times}`, cost);
  const model = parsed.data.modelVersion ?? DESCRIBER_MODEL;
  if (!model.startsWith(DESCRIBER_MODEL)) return fail(`describer answered with ${code(model, /^[a-z0-9][a-z0-9.-]{0,60}$/, "another model")}`, cost);
  const session = (parsed.data.responseId ?? "").replace(/[^A-Za-z0-9._:-]/g, "");
  if (!session) return fail("describer response has no id", cost);
  return {
    ok: true,
    description: d.data,
    run: { model: DESCRIBER_MODEL, session: scrub(`gemini-${session}`).slice(0, 200), packetDigest: digest, reviewedAt: at.toISOString() },
    costUsd: cost,
    uncertain: d.data.uncertain.length > 0,
  };
}
