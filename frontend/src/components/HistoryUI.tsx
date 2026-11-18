import type { ReactNode } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, CircleAlert } from "lucide-react";
import type { PredictionMode, RiskLevel } from "../types";

/** Các mảnh giao diện dùng chung cho các trang lịch sử (cá nhân và bệnh nhân). */

/** Tách thời điểm thành ngày + giờ để hiển thị hai dòng trong bảng. */
export function splitDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "—", time: "" };
  return {
    date: d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
  };
}

/** Khóa ngày theo giờ máy (YYYY-MM-DD) để so sánh với ô chọn ngày. */
export function localDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function MessageBox({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const isError = tone === "error";
  return (
    <div role={isError ? "alert" : "status"} className={`dg-notice ${isError ? "dg-notice--error" : "dg-notice--success"}`}>
      {isError ? <CircleAlert aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
      <span>{children}</span>
    </div>
  );
}

export function ModeBadge({ mode }: { mode: PredictionMode }) {
  return <span className={`dh-mode dh-mode--${mode}`}>{mode === "clinical" ? "Lâm sàng" : "Phi lâm sàng"}</span>;
}

export function Probability({ value, level }: { value: number; level: RiskLevel }) {
  return <span className={`dh-prob dh-prob--${level}`}>{(value * 100).toFixed(1)}%</span>;
}

/** Thanh lọc dạng viên thuốc: Tất cả (n) | Phi lâm sàng | Lâm sàng. */
export function FilterTabs<T extends string>({ label, tabs, value, onChange }: {
  label: string;
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="dh-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button key={tab.id} type="button" role="tab" aria-selected={active}
            className={`dh-tab${active ? " is-active" : ""}`} onClick={() => onChange(tab.id)}>
            {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ""}
          </button>
        );
      })}
    </div>
  );
}

function pageNumbers(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const wanted = Array.from(new Set([1, totalPages, page - 1, page, page + 1]))
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b);
  const result: (number | "…")[] = [];
  wanted.forEach((n, index) => {
    if (index > 0 && n - wanted[index - 1] > 1) result.push("…");
    result.push(n);
  });
  return result;
}

/** Phân trang kiểu "Hiển thị 1–6 / 48 lần đánh giá" + các nút số trang. */
export function DgPagination({ page, pageSize, total, onPage, noun }: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  noun: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="dh-pager">
      <span>Hiển thị {from}–{to} / {total} {noun}</span>
      {totalPages > 1 && (
        <nav className="dh-pager-pages" aria-label="Phân trang">
          <button type="button" className="dh-page" aria-label="Trang trước" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft aria-hidden="true" />
          </button>
          {pageNumbers(page, totalPages).map((item, index) => item === "…"
            ? <span key={`gap-${index}`} className="dh-page-gap" aria-hidden="true">…</span>
            : (
              <button key={item} type="button" className={`dh-page${item === page ? " is-active" : ""}`}
                aria-current={item === page ? "page" : undefined} onClick={() => onPage(item)}>
                {item}
              </button>
            ))}
          <button type="button" className="dh-page" aria-label="Trang sau" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
            <ChevronRight aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
