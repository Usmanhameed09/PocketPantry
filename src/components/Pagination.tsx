"use client";

/**
 * Reusable pagination control. Renders "Showing X–Y of Z" plus
 * First / Prev / page-indicator / Next / Last buttons. Hidden when there's
 * only one page. Pair with the usePagination hook.
 */
type Props = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  from?: number;
  to?: number;
  total?: number;
  /** Optional noun for the count label, e.g. "leads", "products". */
  label?: string;
};

export default function Pagination({ page, totalPages, onPageChange, from, to, total, label = "rows" }: Props) {
  if (totalPages <= 1) return null;
  const go = (p: number) => onPageChange(Math.min(Math.max(1, p), totalPages));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 16px",
        borderTop: "1px solid #e2e8f0",
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: 12, color: "#64748b" }}>
        {total !== undefined && from !== undefined && to !== undefined
          ? `Showing ${from}–${to} of ${total} ${label}`
          : `Page ${page} of ${totalPages}`}
      </span>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <PageBtn disabled={page <= 1} onClick={() => go(1)}>« First</PageBtn>
        <PageBtn disabled={page <= 1} onClick={() => go(page - 1)}>‹ Prev</PageBtn>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", padding: "0 8px" }}>
          {page} / {totalPages}
        </span>
        <PageBtn disabled={page >= totalPages} onClick={() => go(page + 1)}>Next ›</PageBtn>
        <PageBtn disabled={page >= totalPages} onClick={() => go(totalPages)}>Last »</PageBtn>
      </div>
    </div>
  );
}

function PageBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "5px 10px",
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 6,
        border: "1px solid #cbd5e1",
        background: disabled ? "#f1f5f9" : "#fff",
        color: disabled ? "#94a3b8" : "#0f172a",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
