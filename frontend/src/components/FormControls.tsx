import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

interface FieldProps {
  id: string;
  label: string;
  className?: string;
  error?: string;
}

type TextFieldProps = FieldProps & InputHTMLAttributes<HTMLInputElement>;

export function TextField({ id, label, className = "", error, ...props }: TextFieldProps) {
  return (
    <div className={className}>
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} className="field-input" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...props} />
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

type SelectFieldProps = FieldProps & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode };

export function SelectField({ id, label, className = "", error, children, ...props }: SelectFieldProps) {
  return (
    <div className={className}>
      <label className="field-label" htmlFor={id}>{label}</label>
      <select id={id} className="field-input" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...props}>
        {children}
      </select>
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    info: "border-sky-200 bg-sky-50 text-sky-800",
  };
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2.5 text-sm ${styles[tone]}`}>{children}</div>;
}
