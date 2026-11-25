const dateFormatter = new Intl.DateTimeFormat("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit" });
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit",
});

function isCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function localISODate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateOfBirth(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  if (!isCalendarDate(year, month, day)) return null;
  return `${yearText}-${monthText}-${dayText}`;
}

export function formatDateOfBirth(value?: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!match) return "";
  const [, year, month, day] = match;
  return isCalendarDate(Number(year), Number(month), Number(day)) ? `${day}/${month}/${year}` : "";
}

export function normalizePhoneNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^\+?[\d\s().-]{8,20}$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (trimmed.startsWith("+") && digits.startsWith("84")) return `0${digits.slice(2)}`;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export function formatDate(value?: string | Date | null): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date);
}

export type PasswordCriteria = {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  digit: boolean;
  special: boolean;
  noWhitespace: boolean;
};

export function getPasswordCriteria(password: string): PasswordCriteria {
  return {
    length: password.length >= 8 && password.length <= 128,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    digit: /[0-9]/.test(password),
    special: /[^A-Za-z0-9\s]/.test(password),
    noWhitespace: password.length > 0 && !/\s/.test(password),
  };
}

export function isStrongPassword(password: string): boolean {
  return Object.values(getPasswordCriteria(password)).every(Boolean);
}

export const PASSWORD_REQUIREMENT_MESSAGE =
  "Mật khẩu phải có 8–128 ký tự, gồm chữ hoa, chữ thường, chữ số, ký tự đặc biệt và không chứa khoảng trắng.";
