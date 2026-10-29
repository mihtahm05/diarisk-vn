import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage(page: number): void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <nav aria-label="Phân trang" className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
      <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total}</span>
      <div className="flex gap-2">
        <button className="btn-ghost !px-2 !py-1" aria-label="Trang trước" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="flex items-center px-2">{page} / {pages}</span>
        <button className="btn-ghost !px-2 !py-1" aria-label="Trang sau" onClick={() => onPage(page + 1)} disabled={page >= pages}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
