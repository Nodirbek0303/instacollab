import type { CSSProperties } from 'react';

import type { BloggerProfile } from '../types';

/**
 * Ptichkali blogerni ko'rinishda ajratib turish.
 *
 * Ikki narsa qo'shiladi: blogerning o'zi tanlagan rang va yengil «yaltirash».
 * Rang profilning bir qismi, shuning uchun uni hamma bir xil ko'radi.
 *
 * Rang faqat `#RRGGBB` bo'lishi serverda tekshiriladi, lekin bu yerda ham
 * qayta tekshiriladi: eski keshdagi ma'lumot ham to'g'ridan-to'g'ri CSS ga
 * tushmasligi kerak.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Standart ptichka rangi — bloger o'zi tanlamagan bo'lsa. */
export const DEFAULT_VERIFIED_COLOR = '#7c3aed';

/** Bloger tanlashi mumkin bo'lgan tayyor ranglar. Istasa o'zi ham kirita oladi. */
export const COLOR_PRESETS = [
  '#7c3aed', // binafsha
  '#db2777', // pushti
  '#e11d48', // qizil
  '#ea580c', // to'q sariq
  '#ca8a04', // oltin
  '#16a34a', // yashil
  '#0891b2', // moviy
  '#2563eb', // ko'k
  '#4f46e5', // indigo
  '#7e22ce', // siyoh
  '#0f766e', // zumrad
  '#475569', // grafit
] as const;

export function safeColor(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string' || !HEX.test(raw.trim())) return null;
  return raw.trim().toLowerCase();
}

/** Ptichkali blogerning rangi — tanlagani yoki standart. */
export function accentOf(blogger: Pick<BloggerProfile, 'isVerified' | 'themeColor'>): string | null {
  if (!blogger.isVerified) return null;
  return safeColor(blogger.themeColor) ?? DEFAULT_VERIFIED_COLOR;
}

/**
 * Karta uchun uslub. Rang CSS o'zgaruvchisi orqali beriladi, shunda
 * chegara, soya va yaltirash bir xil rangdan kelib chiqadi.
 */
export function verifiedCardStyle(
  blogger: Pick<BloggerProfile, 'isVerified' | 'themeColor'>,
): CSSProperties | undefined {
  const accent = accentOf(blogger);
  if (!accent) return undefined;

  return {
    ['--ic-accent' as string]: accent,
    borderColor: `${accent}59`,
    boxShadow: `0 1px 2px ${accent}14, 0 12px 28px -18px ${accent}b3`,
  };
}

/** Ptichkali karta uchun qo'shimcha class'lar. */
export function verifiedCardClass(
  blogger: Pick<BloggerProfile, 'isVerified' | 'themeColor'>,
): string {
  return blogger.isVerified ? 'ic-verified' : '';
}
