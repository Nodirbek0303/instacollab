import type { Account, AccountStatus, Campaign, ModerationState } from '../types';
import { db } from './db';

/**
 * Hisob va e'lon holatlari.
 *
 * Alohida modul, chunki bu qoidalarni ham kirish tekshiruvi (`auth`), ham
 * admin paneli (`admin`) ishlatadi — bir joyda tursa, ikkalasi bir xil
 * javob beradi va aylanma import kelib chiqmaydi.
 *
 * Ikkala cheklov ham **qaytariladigan**: ma'lumot o'chirilmaydi, faqat
 * belgilanadi. Shuning uchun xato qaror ham tuzatiladi.
 */

/* ---------------- Hisob ---------------- */

/** Eski yozuvlarda maydon yo'q — ular faol hisoblanadi. */
export function accountStatus(account: Account): AccountStatus {
  return account.status ?? 'active';
}

/** Muzlatilgan va o'chirilgan hisoblar tizimga kira olmaydi. */
export function isAccountActive(account: Account): boolean {
  return accountStatus(account) === 'active';
}

/** Foydalanuvchiga ko'rsatiladigan sabab — nega kira olmayapti. */
export function blockedReason(account: Account): string {
  const reason = account.statusReason ? ` Sabab: ${account.statusReason}` : '';

  if (accountStatus(account) === 'frozen') {
    return `Hisobingiz vaqtincha to‘xtatilgan.${reason} Tiklash uchun support bilan bog‘laning.`;
  }
  return `Hisobingiz o‘chirilgan.${reason} Savollar bo‘lsa support bilan bog‘laning.`;
}

/* ---------------- E'lon ---------------- */

export function moderationState(campaign: Campaign): ModerationState {
  return campaign.moderation?.state ?? 'ok';
}

/** Profil egasining hisobi bloklangan bo'lsa — profil ham ko'rinmasligi kerak. */
export function profileBlocked(profileId: string): boolean {
  const owner = db.accounts.find((a) => a.profileId === profileId);
  return owner ? !isAccountActive(owner) : false;
}

/**
 * Foydalanuvchi shu e'lonni ko'ra oladimi.
 *
 * Egasi o'z e'lonini yashirilgan bo'lsa ham ko'radi — sababi bilan birga,
 * shunda nima uchun bozorda yo'qolganini tushunadi.
 */
export function canSeeCampaign(campaign: Campaign, viewerProfileId: string): boolean {
  if (campaign.brandId === viewerProfileId) return moderationState(campaign) !== 'deleted';
  return moderationState(campaign) === 'ok' && !profileBlocked(campaign.brandId);
}
