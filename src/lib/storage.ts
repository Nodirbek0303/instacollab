import type { PlatformState } from '../types';

/**
 * Kalitdagi versiya raqami keshni bekor qilish uchun.
 *
 * Uni oshirsak, brauzerdagi eski nusxa e'tiborsiz qoladi va ilova
 * ma'lumotni serverdan qaytadan oladi. Namunaviy profillar bazadan
 * o'chirilgach shu kerak bo'ldi: aks holda ular eski keshdan
 * ko'rinishda davom etardi.
 */
const STATE_KEY = 'instacollab:state:v3';
const TAB_KEY = 'instacollab:tab:v3';

/** Eskirgan kalitlar — ilova ochilganda tozalanadi. */
const LEGACY_KEYS = ['instacollab:state:v1', 'instacollab:state:v2', 'instacollab:tab:v1', 'instacollab:tab:v2'];

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Shaxsiy rejim yoki to'lgan xotira — kesh bo'lmasa ham ilova ishlashi kerak.
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* keshni yozib bo'lmasa, jim o'tkazib yuboramiz */
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* e'tiborsiz */
  }
}

/** Eski versiyalardan qolgan keshni tozalaydi. */
export function dropLegacyCache(): void {
  for (const key of LEGACY_KEYS) remove(key);
}

/**
 * Serverdan kelgan holatning oflayn nusxasi: sahifa ochilishi bilan darhol
 * ko'rsatiladi, so'ng serverdan yangilangan versiya bilan almashtiriladi.
 * Chiqishda (logout) albatta tozalanadi — boshqa foydalanuvchi ko'rmasligi kerak.
 */
export const cachedState = {
  load: (): PlatformState | null => {
    const cached = read<PlatformState>(STATE_KEY);
    if (!cached || !Array.isArray(cached.brands) || !Array.isArray(cached.bloggers)) return null;
    return {
      brands: cached.brands,
      bloggers: cached.bloggers,
      campaigns: cached.campaigns ?? [],
      bids: cached.bids ?? [],
      messages: cached.messages ?? [],
      follows: cached.follows ?? [],
    };
  },
  save: (state: PlatformState): void => write(STATE_KEY, state),
  clear: (): void => remove(STATE_KEY),
};

/** Oxirgi ochilgan bo'lim — sahifa yangilanganda o'sha joyda qolish uchun. */
export const savedTab = {
  load: (): string | null => read<string>(TAB_KEY),
  save: (tab: string): void => write(TAB_KEY, tab),
  clear: (): void => remove(TAB_KEY),
};
