import { useState } from "react";

export function usePagination(initialPage = 1, initialPageSize = 10) {
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [totalItems, setTotalItems] = useState(0);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const nextPage = () => setPage((p) => Math.min(p + 1, totalPages));
  const prevPage = () => setPage((p) => Math.max(p - 1, 1));
  const resetPage = () => setPage(1);

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    setTotalItems,
    totalPages,
    nextPage,
    prevPage,
    resetPage,
  };
}

export default usePagination;
