import { z } from "zod";

/** A publisher's decision as the admission form submits it. Validated before it reaches the RPC. */
export type DecisionInput = { textId: string; textHash: string; decision: "admitted" | "rejected"; reason: string };

/** The reason recorded when a publisher admits without typing one. */
export const DEFAULT_ADMIT_REASON = "Admitted on the publisher admission screen.";

const decisionSchema = z.object({
  textId: z.uuid(),
  textHash: z.string().regex(/^[0-9a-f]{64}$/),
  decision: z.enum(["admitted", "rejected"]),
  reason: z.string().max(500),
});

export function parseDecision(form: FormData): { ok: true; value: DecisionInput } | { ok: false; error: string } {
  const parsed = decisionSchema.safeParse({
    textId: form.get("textId"),
    textHash: form.get("textHash"),
    decision: form.get("decision"),
    reason: form.get("reason") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "This decision could not be read. Reload the page and try again." };
  const reason = parsed.data.reason.trim();
  if (parsed.data.decision === "rejected" && reason === "") return { ok: false, error: "Give a reason to reject." };
  return { ok: true, value: { ...parsed.data, reason: reason || DEFAULT_ADMIT_REASON } };
}

const ERRORS: Readonly<Record<string, string>> = {
  input: "This decision could not be read. Reload the page and try again.",
  reason: "Give a reason to reject.",
  decision: "The decision was refused: the text may have changed, been replaced or already been decided. Reload and review it again.",
};

/** The page's fixed error message for a `?error=` key; inherited or unknown keys give nothing. */
export function errorMessage(key: unknown): string | undefined {
  return typeof key === "string" && Object.hasOwn(ERRORS, key) ? ERRORS[key] : undefined;
}
