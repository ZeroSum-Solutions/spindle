// The provider refusals that free a describe call's reservation (T15; Sol R1 PR47-01, 02, 06).
// Google's error table (https://ai.google.dev/gemini-api/docs/troubleshooting) names 429
// RESOURCE_EXHAUSTED (rate limit) and 503 UNAVAILABLE (overloaded) as requests the service turned
// away, and its billing FAQ (https://ai.google.dev/gemini-api/docs/billing) says failed requests
// are not charged for tokens. Only these two are released, and only with Google's own error
// envelope, its code and status matching the HTTP status, and no usage at all. Everything else
// keeps the full reservation and the 90-day block: 500, a gateway 502, a 504 deadline (work may
// have been done), an unrecognised body, and any response that reports usage, complete or not.
import { z } from "zod";

export const NON_BILLABLE_REFUSALS = { 429: "RESOURCE_EXHAUSTED", 503: "UNAVAILABLE" } as const;
export type RefusalStatus = keyof typeof NON_BILLABLE_REFUSALS;

/** The ledger's and the classifier's one allowlist. */
export const refusalStatusSchema = z.union([z.literal(429), z.literal(503)]);

// Strict: a usageMetadata key (or anything else) beside the error means the body is not a bare refusal.
const envelopeSchema = z.strictObject({
  error: z.strictObject({
    code: z.number().int(),
    message: z.string().max(10_000),
    status: z.string(),
    details: z.array(z.unknown()).optional(),
  }),
});

/** The refusal status when this response is a documented, non-billable refusal; otherwise null. */
export function refusalStatus(httpStatus: number, body: unknown): RefusalStatus | null {
  const status = refusalStatusSchema.safeParse(httpStatus);
  if (!status.success) return null;
  const env = envelopeSchema.safeParse(body);
  if (!env.success) return null;
  return env.data.error.code === status.data && env.data.error.status === NON_BILLABLE_REFUSALS[status.data] ? status.data : null;
}
