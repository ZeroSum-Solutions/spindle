// The fail-closed review step: packet in, validated verdicts out. It never
// writes anything; recording receipts is a separate trusted step (receipts.ts).
import { assertPacket, packetDigest, type ReviewPacket } from "./packet";
import { reviewPrompt, resultJsonSchema } from "./prompt";
import { parseReviewResult, type ReviewedItem } from "./result";

export interface RunnerOutput {
  /** The reviewer's final message. */
  lastMessage: string;
  /** The model that answered: from the reviewer's events when it reports one, else the requested model. */
  model: string;
  /** The model the runner asked for. A different answering model fails the review. */
  requestedModel?: string;
  /** The reviewer session id. */
  session: string;
  exitCode: number;
}

export interface ReviewRunner {
  run(prompt: string, outputSchema: object): Promise<RunnerOutput>;
}

/** The `run` receipt object the publisher RPCs take. */
export interface RunReceipt {
  model: string;
  session: string;
  packetDigest: string;
  reviewedAt: string;
}

/**
 * `answer` is the reviewer's raw final message. The recorder parses it again
 * (receiptCalls) and never trusts `items`, which is only a convenience view.
 */
export type ReviewOutcome =
  | { ok: true; run: RunReceipt; answer: string; items: Record<string, ReviewedItem> }
  | { ok: false; run: Partial<RunReceipt>; errors: string[] };

export const MODEL = /^[a-z0-9][a-z0-9._:-]{0,99}$/;
export const SESSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export async function runReview(packet: ReviewPacket, runner: ReviewRunner, now: () => Date = () => new Date()): Promise<ReviewOutcome> {
  assertPacket(packet);
  const digest = packetDigest(packet);
  let out: RunnerOutput;
  try {
    out = await runner.run(reviewPrompt(packet), resultJsonSchema());
  } catch (e) {
    return { ok: false, run: { packetDigest: digest }, errors: [`the reviewer did not run: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500)] };
  }
  const run: Partial<RunReceipt> = { packetDigest: digest, reviewedAt: now().toISOString() };
  const errors: string[] = [];
  if (out.exitCode !== 0) errors.push(`the reviewer exited with code ${out.exitCode}`);
  if (MODEL.test(out.model)) run.model = out.model;
  else errors.push("the reviewer model is missing or malformed");
  if (out.requestedModel && out.model !== out.requestedModel) {
    errors.push(`the reviewer answered with ${out.model}, not the requested ${out.requestedModel}`);
  }
  if (SESSION.test(out.session)) run.session = out.session;
  else errors.push("the reviewer session is missing or malformed");
  const parsed = parseReviewResult(out.lastMessage, packet);
  if (!parsed.ok) errors.push(...parsed.errors);
  if (errors.length > 0 || !parsed.ok) return { ok: false, run, errors };
  return { ok: true, run: run as RunReceipt, answer: out.lastMessage, items: Object.fromEntries(parsed.items) };
}
