import { z } from "zod";

/** A publisher's decision as the admission form submits it. Validated before it reaches the RPC. */
export type DecisionInput = { textId: string; textHash: string; decision: "admitted" | "rejected"; reason: string };

export function parseDecision(_form: FormData): { ok: true; value: DecisionInput } | { ok: false; error: string } {
  void z;
  return { ok: false, error: "not implemented" };
}
