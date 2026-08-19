/** So'rov ma'lumotlarini tozalash va tekshirish uchun umumiy yordamchilar. */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function str(
  value: unknown,
  field: string,
  opts: { max: number; required?: boolean; fallback?: string },
): string {
  const raw = typeof value === 'string' ? value : '';
  const clean = raw.replace(CONTROL_CHARS, '').trim().slice(0, opts.max);
  if (!clean) {
    if (opts.required) throw new HttpError(400, `"${field}" maydonini to'ldiring`);
    return opts.fallback ?? '';
  }
  return clean;
}

export function num(
  value: unknown,
  field: string,
  opts: { min: number; max: number; fallback?: number },
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    if (opts.fallback !== undefined) return opts.fallback;
    throw new HttpError(400, `"${field}" son bo'lishi kerak`);
  }
  return Math.min(opts.max, Math.max(opts.min, Math.round(parsed)));
}

export function strList(value: unknown, opts: { max: number; itemMax: number }): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(CONTROL_CHARS, '').trim().slice(0, opts.itemMax))
    .filter(Boolean)
    .slice(0, opts.max);
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** "@user", "user" — ikkalasini ham "@user" ga keltiradi. */
export function handle(value: unknown, field: string, fallback: string): string {
  const clean = str(value, field, { max: 64 }).replace(/^@/, '');
  return clean ? `@${clean}` : fallback;
}

/** +998 90 123-45-67, 901234567, 998901234567 → `+998901234567`. */
export function normalizePhone(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  return null;
}

/** Telefonni odam o'qiy oladigan ko'rinishga keltiradi. */
export function prettyPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 12) return phone;
  return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)}-${digits.slice(8, 10)}-${digits.slice(10)}`;
}
