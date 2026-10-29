import { Activity } from "lucide-react";

export default function Logo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-sm ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Activity size={Math.round(size * 0.55)} strokeWidth={2.5} />
    </span>
  );
}

export function BrandName({ className = "" }: { className?: string }) {
  return <span className={`font-extrabold tracking-tight text-slate-800 ${className}`}>DiaRisk <span className="text-sky-600">VN</span></span>;
}
