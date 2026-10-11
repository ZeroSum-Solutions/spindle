"use server";

/** The specimen has no real version to recheck against; in development it always allows play. */
export async function specimenRecheck(): Promise<boolean> {
  return process.env.NODE_ENV !== "production";
}
