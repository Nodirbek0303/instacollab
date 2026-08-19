import crypto from 'crypto';

/**
 * Telegram Mini App autentifikatsiyasi.
 *
 * Bot tugmasi bosilganda Telegram ilovaga `initData` qatorini uzatadi. U HMAC-SHA256
 * bilan imzolangan: kalit — bot tokenidan olinadi. Imzo to'g'ri bo'lsa, ichidagi
 * foydalanuvchi ma'lumoti Telegram tomonidan tasdiqlangan hisoblanadi —
 * shuning uchun parol ham, qo'shimcha tekshiruv ham kerak emas.
 *
 * Hujjat: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

export interface TelegramInitUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
}

/** `initData` eskirgan hisoblanadigan muddat (soniyalarda). */
const MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * `initData` imzosini tekshiradi va foydalanuvchini qaytaradi.
 * Imzo noto'g'ri, eskirgan yoki buzilgan bo'lsa — `null`.
 */
export function verifyInitData(initData: string, botToken: string): TelegramInitUser | null {
  if (!initData || !botToken) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }

  const hash = params.get('hash');
  if (!hash) return null;

  // Imzodan tashqari barcha maydonlar alifbo tartibida `kalit=qiymat` ko'rinishida birlashtiriladi.
  const pairs: string[] = [];
  for (const [key, value] of params) {
    if (key === 'hash') continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(hash, 'hex');
  if (expectedBuf.length !== actualBuf.length) return null;
  if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) return null;

  // Eski `initData` qayta ishlatilmasligi uchun muddatni tekshiramiz.
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate)) return null;
  if (Math.floor(Date.now() / 1000) - authDate > MAX_AGE_SECONDS) return null;

  const rawUser = params.get('user');
  if (!rawUser) return null;

  try {
    const parsed = JSON.parse(rawUser) as {
      id?: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    if (typeof parsed.id !== 'number') return null;

    return {
      id: parsed.id,
      firstName: String(parsed.first_name ?? ''),
      lastName: parsed.last_name ? String(parsed.last_name) : undefined,
      username: parsed.username ? String(parsed.username) : undefined,
    };
  } catch {
    return null;
  }
}
