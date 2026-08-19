import crypto from 'crypto';

import {
  SEED_BIDS,
  SEED_BLOGGERS,
  SEED_BRANDS,
  SEED_CAMPAIGNS,
  SEED_MESSAGES,
} from '../data/seed';
import type { Account, BloggerProfile, BrandProfile, DatabaseShape } from '../types';
import { HttpError } from './validate';
import { createStorage, type Storage } from './storage';

/* ------------------------------------------------------------------ */
/* Holat                                                               */
/* ------------------------------------------------------------------ */

function emptyDatabase(): DatabaseShape {
  return {
    brands: [],
    bloggers: [],
    campaigns: [],
    bids: [],
    messages: [],
    accounts: [],
    sessions: [],
    supportAdmins: [],
    tickets: [],
    botSessions: [],
    reports: [],
    adminLog: [],
  };
}

function seededDatabase(): DatabaseShape {
  return {
    ...emptyDatabase(),
    brands: structuredClone(SEED_BRANDS),
    bloggers: structuredClone(SEED_BLOGGERS),
    campaigns: structuredClone(SEED_CAMPAIGNS),
    bids: structuredClone(SEED_BIDS),
    messages: structuredClone(SEED_MESSAGES),
  };
}

/**
 * Butun platforma holati. Bu obyektga havola o'zgarmaydi — `initDatabase()`
 * uning ichini to'ldiradi, shuning uchun boshqa modullar uni bemalol import
 * qilib, maydonlarini o'qishi va o'zgartirishi mumkin.
 */
export const db: DatabaseShape = emptyDatabase();

let storage: Storage = createStorage();

export function storageInfo(): { kind: string; location: string } {
  return { kind: storage.kind, location: storage.location };
}

/** Ma'lumotlarni saqlash joyidan yuklaydi. Server ishga tushishidan oldin chaqiriladi. */
export async function initDatabase(): Promise<void> {
  let loaded: DatabaseShape | null = null;
  try {
    loaded = await storage.load();
  } catch (error) {
    console.error('[db] yuklashda xatolik:', error);
    throw error;
  }

  const source = loaded ?? seededDatabase();
  const now = Date.now();

  Object.assign(db, {
    ...emptyDatabase(),
    ...source,
    // Muddati o'tgan sessiyalar yuklanmaydi.
    sessions: (source.sessions ?? []).filter((session) => Date.parse(session.expiresAt) > now),
  });

  if (!loaded) await persist();
}

/* ------------------------------------------------------------------ */
/* Saqlash                                                             */
/* ------------------------------------------------------------------ */

let writeQueue: Promise<void> = Promise.resolve();
let pendingTimer: NodeJS.Timeout | null = null;
let pendingResolve: (() => void) | null = null;

/** Ketma-ket o'zgarishlarni bitta yozuvga birlashtirish oynasi (ms). */
const DEBOUNCE_MS = Number(process.env.SAVE_DEBOUNCE_MS ?? 250);

function writeNow(): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    try {
      await storage.save(db);
    } catch (error) {
      console.error('[db] saqlashda xatolik:', error);
    }
  });
  return writeQueue;
}

/**
 * O'zgarishlarni saqlaydi. Ketma-ket chaqiruvlar bitta yozuvga birlashtiriladi —
 * bu, ayniqsa, Postgres bilan ishlaganda tarmoq murojaatlarini keskin kamaytiradi.
 */
export function persist(): Promise<void> {
  if (DEBOUNCE_MS <= 0) return writeNow();

  return new Promise<void>((resolve) => {
    const previous = pendingResolve;
    pendingResolve = () => {
      previous?.();
      resolve();
    };

    if (pendingTimer) return;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      const done = pendingResolve;
      pendingResolve = null;
      void writeNow().then(() => done?.());
    }, DEBOUNCE_MS);
  });
}

/** Kutilayotgan yozuvni darhol bajaradi (server to'xtatilayotganda). */
export async function flush(): Promise<void> {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
    const done = pendingResolve;
    pendingResolve = null;
    await writeNow();
    done?.();
    return;
  }
  await writeQueue;
}

/* ------------------------------------------------------------------ */
/* Umumiy yordamchilar                                                 */
/* ------------------------------------------------------------------ */

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
}

export function todayLabel(): string {
  return new Date().toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long' });
}

/** Hisobga bog'langan profil (brend yoki bloger). */
export function profileOf(account: Account): BrandProfile | BloggerProfile {
  const profile =
    account.role === 'advertiser'
      ? db.brands.find((b) => b.id === account.profileId)
      : db.bloggers.find((b) => b.id === account.profileId);

  if (!profile) throw new HttpError(500, "Hisobga bog'langan profil topilmadi");
  return profile;
}

/** Profil id'si bo'yicha hisobni topadi (bildirishnoma yuborish uchun kerak). */
export function accountByProfileId(profileId: string): Account | undefined {
  return db.accounts.find((account) => account.profileId === profileId);
}

export function accountByTelegramId(telegramId: number): Account | undefined {
  return db.accounts.find((account) => account.telegramId === telegramId);
}

export function accountByPhone(phone: string): Account | undefined {
  return db.accounts.find((account) => account.phone === phone);
}

export function isSupportAdmin(telegramId: number): boolean {
  return db.supportAdmins.includes(telegramId);
}
