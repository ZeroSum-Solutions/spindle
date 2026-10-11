/**
 * The trusted recording step. Reads a review directory written by review.ts, checks the
 * outcome belongs to this exact packet, and records every receipt in one transaction as the
 * named publisher. The database re-checks each expected hash and refuses a stale one, in
 * which case nothing is recorded.
 *   … tsx scripts/record-review.ts --dir /private/reviews/<digest>
 * Needs SPINDLE_DB_URL and SPINDLE_PUBLISHER_ID. Exit 0 recorded, 1 refused, 2 error.
 */
import { join } from "node:path";
import type { ReviewOutcome } from "../src/review/harness";
import { packetDigest, type ReviewPacket } from "../src/review/packet";
import { receiptCalls, receiptSql } from "../src/review/receipts";
import { args, main, publisherId, readJson, sql } from "./lib/cli";

main(async () => {
  const d = args().get("dir");
  if (!d) throw new Error("--dir <review directory> is required");
  const packet = readJson<ReviewPacket>(join(d, "packet.json"));
  const outcome = readJson<ReviewOutcome>(join(d, "outcome.json"));
  if (packetDigest(packet) !== d.replace(/\/+$/, "").split("/").pop()) throw new Error("the packet does not match its directory digest");
  let calls;
  try {
    calls = receiptCalls(packet, outcome, new Date());
  } catch (e) {
    console.log(`refused: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  try {
    sql(receiptSql(publisherId(), calls));
  } catch (e) {
    console.log(`refused by the database (nothing recorded): ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  console.log(`recorded ${calls.length} receipts (${calls.map((c) => c.fn.replace("publisher_review_", "")).join(", ")})`);
  return 0;
});
