import { describe, expect, it } from "vitest";
import { fetchAll, PAGE_SIZE } from "./paginate";

// A stub that behaves like PostgREST with max_rows = 1000: it never returns more than the cap.
function table(count: number, cap = 1000) {
  const rows = Array.from({ length: count }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + cap)), error: null });
  };
  return { page, calls };
}

describe("fetchAll", () => {
  it.each([0, 1, 999, 1000, 1001, 2500])("returns all %i rows past the 1000-row cap", async (count) => {
    const { page } = table(count);
    const rows = await fetchAll(page);
    expect(rows).toHaveLength(count);
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: count }, (_, i) => i));
  });

  it("requests consecutive inclusive ranges and stops on a short page", async () => {
    const { page, calls } = table(2500);
    await fetchAll(page);
    expect(calls).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1],
      [2 * PAGE_SIZE, 3 * PAGE_SIZE - 1],
    ]);
  });

  it("throws the query error instead of returning a partial list", async () => {
    let n = 0;
    const page = () => Promise.resolve(n++ === 0 ? { data: Array(PAGE_SIZE).fill({}), error: null } : { data: null, error: new Error("boom") });
    await expect(fetchAll(page)).rejects.toThrow("boom");
  });
});
