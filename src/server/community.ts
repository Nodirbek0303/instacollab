import type { BloggerProfile, BloggerStats, Campaign } from '../types';
import { EARLY_ACCESS_MINUTES } from '../types';
import { db } from './db';

/**
 * Bloger hamjamiyati: statistika, obunalar va ptichka imtiyozlari.
 *
 * Statistika **saqlanmaydi** — har safar arizalardan hisoblanadi. Sababi:
 * saqlanadigan sanagich ertami-kechmi haqiqatdan chetga chiqadi (ariza
 * o'chirilsa, holat qo'lda o'zgartirilsa), hisoblangani esa har doim to'g'ri.
 */

/* ------------------------------------------------------------------ */
/* Statistika                                                          */
/* ------------------------------------------------------------------ */

export function statsFor(bloggerId: string): BloggerStats {
  const mine = db.bids.filter((bid) => bid.bloggerId === bloggerId);

  const accepted = mine.filter((bid) => bid.status === 'accepted');
  const completed = mine.filter((bid) => bid.status === 'completed');

  // Oxirgi zakaz — qabul qilingan va yakunlanganlar ichidan eng yangisi.
  const orderDates = [...accepted, ...completed]
    .map((bid) => bid.completedAt ?? bid.submittedAt)
    .filter(Boolean)
    .sort();

  return {
    bidsSent: mine.length,
    // Yakunlangan zakaz ham olingan zakaz — shuning uchun ikkalasi qo'shiladi.
    ordersTotal: accepted.length + completed.length,
    ordersCompleted: completed.length,
    ordersActive: accepted.length,
    bidsRejected: mine.filter((bid) => bid.status === 'rejected').length,
    lastOrderAt: orderDates.length > 0 ? orderDates[orderDates.length - 1] : null,
    followers: db.follows.filter((follow) => follow.targetId === bloggerId).length,
    following: db.follows.filter((follow) => follow.followerId === bloggerId).length,
  };
}

/** Blogerlar ro'yxatiga statistikani qo'shib qaytaradi. */
export function withStats(bloggers: BloggerProfile[]): (BloggerProfile & { stats: BloggerStats })[] {
  return bloggers.map((blogger) => ({ ...blogger, stats: statsFor(blogger.id) }));
}

/* ------------------------------------------------------------------ */
/* Ptichka imtiyozlari                                                 */
/* ------------------------------------------------------------------ */

export function isVerifiedBlogger(profileId: string): boolean {
  return db.bloggers.find((blogger) => blogger.id === profileId)?.isVerified === true;
}

/**
 * Kutish oynasi. Odatda 15 daqiqa, lekin `EARLY_ACCESS_MINUTES` bilan
 * o'zgartirish mumkin — bu ham sozlash uchun, ham sinovda 0 qilib
 * qo'yish uchun kerak.
 */
function earlyAccessMs(): number {
  const raw = Number(process.env.EARLY_ACCESS_MINUTES);
  const minutes = Number.isFinite(raw) && raw >= 0 ? raw : EARLY_ACCESS_MINUTES;
  return minutes * 60 * 1000;
}

/**
 * E'lon ptichkasizlar uchun ham ochilganmi.
 *
 * Eski e'lonlarda `publishedAt` yo'q — ular allaqachon ochiq hisoblanadi,
 * aks holda yangilikdan keyin butun bozor 15 daqiqaga yopilib qolardi.
 */
export function isOpenToEveryone(campaign: Campaign, now = Date.now()): boolean {
  if (!campaign.publishedAt) return true;
  const published = Date.parse(campaign.publishedAt);
  if (Number.isNaN(published)) return true;
  return now - published >= earlyAccessMs();
}

/**
 * Bloger shu e'lonni hozir ko'ra oladimi.
 *
 * Ptichkali bloger — darhol. Qolganlar — 15 daqiqadan keyin. Reklama
 * beruvchilarga bu qoida umuman tegishli emas (ular boshqa yerda hal
 * qilinadi), chunki ular o'z e'lonini darhol ko'rishi kerak.
 */
export function canBloggerSeeCampaign(campaign: Campaign, bloggerId: string, now = Date.now()): boolean {
  if (isOpenToEveryone(campaign, now)) return true;
  return isVerifiedBlogger(bloggerId);
}

/** Hali kutish davrida turgan e'lon uchun qolgan daqiqa — interfeys uchun. */
export function minutesUntilOpen(campaign: Campaign, now = Date.now()): number {
  if (!campaign.publishedAt) return 0;
  const published = Date.parse(campaign.publishedAt);
  if (Number.isNaN(published)) return 0;
  return Math.max(0, Math.ceil((published + earlyAccessMs() - now) / 60_000));
}

/**
 * Arizalarni brendga ko'rsatish tartibi: ptichkalilar tepada, keyin
 * yangiligi bo'yicha. Tartib serverda qo'yiladi, shunda bot ham, sayt ham
 * bir xil ko'rsatadi.
 */
export function sortBidsForBrand<T extends { bloggerId: string; submittedAt: string }>(bids: T[]): T[] {
  return [...bids].sort((a, b) => {
    const aVerified = isVerifiedBlogger(a.bloggerId) ? 1 : 0;
    const bVerified = isVerifiedBlogger(b.bloggerId) ? 1 : 0;
    if (aVerified !== bVerified) return bVerified - aVerified;
    return b.submittedAt.localeCompare(a.submittedAt);
  });
}

/* ------------------------------------------------------------------ */
/* Rang                                                                */
/* ------------------------------------------------------------------ */

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Profil rangini tekshiradi.
 *
 * Faqat `#RRGGBB` qabul qilinadi — rang interfeysda to'g'ridan-to'g'ri CSS
 * ga qo'yiladi, shuning uchun ixtiyoriy matn o'tkazib bo'lmaydi.
 *
 * Juda och ranglar oq fonda o'qilmaydi, shuning uchun yorqinligi cheklanadi.
 */
export function normalizeThemeColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!HEX.test(value)) return null;

  const r = parseInt(value.slice(1, 3), 16);
  const g = parseInt(value.slice(3, 5), 16);
  const b = parseInt(value.slice(5, 7), 16);
  // Idrok etiladigan yorqinlik (0–255).
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luminance > 215) return null;

  return value.toLowerCase();
}
