import type { ReactNode } from "react";
import Logo, { BrandName } from "./Logo";

/** Tiêu đề trang trong dashboard: tiêu đề + mô tả bên trái, vùng nút hành động (nếu có) và logo thương hiệu bên phải. */
export default function Header({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold tracking-tight text-[#14213d] sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-[13.5px] text-[#4a5b7d]">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {actions}
        <div className="hidden items-center gap-2 sm:flex" aria-hidden>
          <Logo size={44} className="h-11 w-11" />
          <BrandName className="hidden text-base xl:inline" />
        </div>
      </div>
    </header>
  );
}