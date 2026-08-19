/** 38 500 → "38.5k", 1 200 000 → "1.2M" */
export function formatFollowers(count: number): string {
  if (!Number.isFinite(count) || count < 0) return '0';
  if (count >= 1_000_000) return (count / 1_000_000).toFixed(1) + 'M';
  if (count >= 1_000) return (count / 1_000).toFixed(1) + 'k';
  return String(Math.round(count));
}

/** 850000 → "850 000 so'm" */
export function formatUzs(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  return `${Math.round(amount).toLocaleString('ru-RU').replace(/ /g, ' ')} so'm`;
}

/** ISO sanani "Bugun 14:32" / "17-avg 09:10" ko'rinishida ko'rsatadi. */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const time = date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (sameDay) return `Bugun ${time}`;
  return `${date.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' })} ${time}`;
}

/** "@user", "https://t.me/user" va "user" — hammasini to'g'ri Telegram havolasiga aylantiradi. */
export function telegramUrl(handle?: string): string | null {
  const clean = (handle ?? '')
    .trim()
    .replace(/^https?:\/\/(www\.)?t\.me\//i, '')
    .replace(/^@/, '')
    .replace(/[^A-Za-z0-9_]/g, '');
  return clean ? `https://t.me/${clean}` : null;
}

/** Instagram uchun xuddi shunday normalizatsiya. */
export function instagramUrl(handle?: string): string | null {
  const clean = (handle ?? '')
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[^A-Za-z0-9._]/g, '');
  return clean ? `https://instagram.com/${clean}` : null;
}

/** `tel:` havolasi uchun raqamni tozalaydi. */
export function telUrl(phone?: string): string | null {
  const clean = (phone ?? '').replace(/[^0-9+]/g, '');
  return clean.length >= 7 ? `tel:${clean}` : null;
}
