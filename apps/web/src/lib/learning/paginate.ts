// PostgREST caps every response (max_rows, 1000 locally). Reads that can exceed it
// page through with a stable order until a short page arrives.

export const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * Fetches every row. `page(from, to)` must return the inclusive range [from, to]
 * of a query with a total, stable order (ties broken by a unique column), or rows
 * can repeat or go missing between pages.
 */
export async function fetchAll<T>(page: (from: number, to: number) => Page<T>, pageSize = PAGE_SIZE): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error || !data) throw error ?? new Error("query returned no data");
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}
