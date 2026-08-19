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

/**
 * Yangi hisoblar admin tasdig'ini kutadimi.
 *
 * Standart holatda — ha: ro'yxatdan o'tgan odam to'lovni amalga oshirib,
 * admin tasdiqlagunga qadar kira olmaydi. `REQUIRE_APPROVAL=false` bilan
 * o'chirilsa, ro'yxatdan o'tish darhol ishlaydi.
 */
export function requiresApproval(): boolean {
  return (process.env.REQUIRE_APPROVAL ?? 'true').toLowerCase() !== 'false';
}

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
  const status = accountStatus(account);

  if (status === 'pending') {
    return 'Hisobingiz administrator tasdig‘ini kutmoqda. To‘lovni amalga oshirib, administratorga yozing — tasdiqlangach hisobingiz ochiladi.';
  }
  if (status === 'frozen') {
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
