// Fail-closed parsing of a reviewer's answer. Any execution, parse or coverage
// problem means "not approved": the caller gets errors and records nothing.
import { z } from "zod";
import type { ItemKind, ReviewPacket } from "./packet";

const findingSchema = z.strictObject({
  severity: z.enum(["BLOCK", "WARN", "NIT"]),
  item: z.string().min(1).max(200),
  note: z.string().min(1).max(2000),
});

const itemSchema = z.strictObject({
  id: z.string().min(1).max(300),
  verdict: z.enum(["approve", "reject", "supported", "unsupported", "clean", "changes_required"]),
  faithfulness: z.enum(["faithful", "unfaithful"]).nullable(),
  checks: z.strictObject({ safety: z.enum(["pass", "fail"]), originality: z.enum(["pass", "fail"]) }).nullable(),
  findings: z.array(findingSchema).max(200),
});

const resultSchema = z.strictObject({ items: z.array(itemSchema).max(1000) });

export type ReviewedItem = z.output<typeof itemSchema>;
export type Finding = z.output<typeof findingSchema>;

const VERDICTS: Record<ItemKind, readonly string[]> = {
  claim: ["approve", "reject"],
  block: ["supported", "unsupported"],
  lesson: ["clean", "changes_required"],
  course: ["clean", "changes_required"],
};

export type ParsedResult = { ok: true; items: Map<string, ReviewedItem> } | { ok: false; errors: string[] };

export function parseReviewResult(raw: string, packet: ReviewPacket): ParsedResult {
  const text = raw.trim();
  if (!text) return { ok: false, errors: ["the reviewer returned nothing"] };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["the reviewer's answer is not a single JSON object"] };
  }
  const parsed = resultSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  }
  const errors: string[] = [];
  const expected = new Map(packet.items.map((i) => [i.id, i.kind]));
  const items = new Map<string, ReviewedItem>();
  for (const item of parsed.data.items) {
    const kind = expected.get(item.id);
    if (!kind) {
      errors.push(`${item.id} is not an item in this packet`);
      continue;
    }
    if (items.has(item.id)) {
      errors.push(`${item.id} is answered twice`);
      continue;
    }
    items.set(item.id, item);
    if (!VERDICTS[kind].includes(item.verdict)) errors.push(`${item.id}: "${item.verdict}" is not a ${kind} verdict`);
    if (kind === "claim") {
      if (item.faithfulness === null) errors.push(`${item.id}: a claim needs faithfulness`);
      if (item.verdict === "approve" && item.faithfulness !== "faithful") errors.push(`${item.id}: an approval must be faithful`);
      if (item.verdict === "approve" && item.findings.some((f) => f.severity !== "NIT")) {
        errors.push(`${item.id}: an approval cannot carry a BLOCK or WARN finding`);
      }
    }
    if (kind === "block" && item.verdict === "supported" && item.findings.some((f) => f.severity !== "NIT")) {
      errors.push(`${item.id}: "supported" cannot carry a BLOCK or WARN finding`);
    }
    if (kind === "lesson" || kind === "course") {
      if (!item.checks) errors.push(`${item.id}: a ${kind} needs safety and originality checks`);
      else if (item.verdict === "clean" && (item.checks.safety !== "pass" || item.checks.originality !== "pass")) {
        errors.push(`${item.id}: "clean" needs both checks to pass`);
      }
      if (item.verdict === "clean" && item.findings.some((f) => f.severity !== "NIT")) {
        errors.push(`${item.id}: "clean" cannot carry a BLOCK or WARN finding`);
      }
    }
  }
  for (const id of expected.keys()) if (!items.has(id)) errors.push(`${id} has no verdict`);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, items };
}
