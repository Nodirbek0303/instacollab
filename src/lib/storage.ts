import type { PlatformState } from '../types';

const STATE_KEY = 'instacollab:state:v2';
const TAB_KEY = 'instacollab:tab:v2';

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
