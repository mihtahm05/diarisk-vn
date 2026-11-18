import type { ReactNode } from "react";

type FormFieldProps = {
  id: string;
  icon: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
};

/** Ô nhập kiểu Figma: icon bên trái, placeholder, thông báo lỗi bên dưới. */
export default function FormField({ id, icon, error, className, children }: FormFieldProps) {
  return (
    <div className={`fg-control ${className ?? ""}`.trim()}>
      <div className="fg-field" data-invalid={Boolean(error)}>
        <span className="fg-field-icon" aria-hidden="true">{icon}</span>
        {children}
      </div>
      {error && <p className="fg-field-error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}