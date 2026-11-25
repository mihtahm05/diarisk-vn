export function normalizePhoneNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^\+?[\d\s().-]{8,20}$/.test(trimmed)) return null;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  if (trimmed.startsWith('+') && digits.startsWith('84')) return `0${digits.slice(2)}`;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}
