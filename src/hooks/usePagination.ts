import { useEffect, useMemo, useState } from "react";

/**
 * Client-side pagination over an in-memory array. Pairs with <Pagination/>.
 *
 * Returns the current page's slice plus the page state and the showing-X-of-Y
 * counters. Automatically resets to page 1 when the underlying list shrinks
 * (e.g. after a search/filter) so you never get stuck on an empty page.
 */
export function usePagination<T>(items: T[], pageSize = 25) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Clamp the page when the list size changes under it.
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  return {
    page,
    setPage,
    totalPages,
    pageItems,
    pageSize,
    total,
    from: total === 0 ? 0 : (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, total),
  };
}
