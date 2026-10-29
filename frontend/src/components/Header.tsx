import type { ReactNode } from "react";
import Logo from "./Logo";
import { BrandName } from "./Logo";

/** Tiêu đề trang trong dashboard: tiêu đề + mô tả bên trái, logo thương hiệu bên phải (theo ảnh mẫu). */
export default function Header({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-slate-800 sm:text-xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
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
