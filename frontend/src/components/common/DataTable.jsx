import React from "react";
import LoadingSkeleton from "./LoadingSkeleton";
import EmptyState from "./EmptyState";
import Pagination from "./Pagination";

export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  emptyTitle = "No records found",
  emptyDescription = "There are no items to display at this time.",
  selectedIds = [],
  onSelectAll,
  onSelectRow,
  rowIdKey = "id",
  pagination,
  onRowClick,
}) {
  const isAllSelected =
    data.length > 0 && data.every((row) => selectedIds.includes(row[rowIdKey]));
  const isSomeSelected =
    data.some((row) => selectedIds.includes(row[rowIdKey])) && !isAllSelected;

  if (loading) {
    return <LoadingSkeleton type="table" rows={6} />;
  }

  return (
    <div className="w-full bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl flex flex-col">
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/80 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {onSelectAll && (
                <th className="py-3.5 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeSelected;
                    }}
                    onChange={(e) => onSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
                  />
                </th>
              )}
              {columns.map((col, idx) => (
                <th
                  key={col.key || idx}
                  className={`py-3.5 px-4 whitespace-nowrap ${col.className || ""}`}
                  style={{ width: col.width }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-200">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (onSelectAll ? 1 : 0)}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              data.map((row, index) => {
                const id = row[rowIdKey] || index;
                const isSelected = selectedIds.includes(id);

                return (
                  <tr
                    key={id}
                    onClick={() => onRowClick && onRowClick(row)}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      isSelected ? "bg-indigo-500/5" : ""
                    } ${onRowClick ? "cursor-pointer" : ""}`}
                  >
                    {onSelectRow && (
                      <td
                        className="py-3 px-4 w-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => onSelectRow(id, e.target.checked)}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
                        />
                      </td>
                    )}
                    {columns.map((col, idx) => (
                      <td
                        key={col.key || idx}
                        className={`py-3 px-4 text-xs font-medium ${col.className || ""}`}
                      >
                        {col.render ? col.render(row[col.key], row, index) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination && (
        <Pagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={pagination.totalItems}
          totalPages={pagination.totalPages}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
        />
      )}
    </div>
  );
}
