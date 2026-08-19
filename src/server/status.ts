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

/**
 * Bitta e'lon joylash narxi (so'mda).
 *
 * `CAMPAIGN_PRICE=0` bo'lsa to'lov talab qilinmaydi va e'lon darhol chiqadi.
 */
export function campaignPrice(): number {
  const raw = Number(process.env.CAMPAIGN_PRICE);
  if (Number.isFinite(raw) && raw >= 0) return Math.round(raw);
  return 10_000;
}

/**
 * E'lon to'langanmi.
 *
 * `payment` maydoni yo'q e'lonlar to'langan hisoblanadi — ular narx
 * joriy qilinishidan oldin yaratilgan yoki bepul rejimda chiqqan.
 */
export function isCampaignPaid(campaign: Campaign): boolean {
  return !campaign.payment || campaign.payment.status === 'paid';
}

/** Profil egasining hisobi bloklangan bo'lsa — profil ham ko'rinmasligi kerak. */
export function profileBlocked(profileId: string): boolean {
  const owner = db.accounts.find((a) => a.profileId === profileId);
  return owner ? !isAccountActive(owner) : false;
}

/**
 * Foydalanuvchi shu e'lonni ko'ra oladimi.
 *
 * Egasi o'z e'lonini yashirilgan yoki to'lov kutayotgan bo'lsa ham ko'radi —
 * shunda nima uchun bozorda yo'qligini tushunadi.
 */
export function canSeeCampaign(campaign: Campaign, viewerProfileId: string): boolean {
  // Egasi o'zinikini har doim ko'radi — to'lov kutilayotganini ham,
  // yashirilganini ham, sababi bilan birga.
  if (campaign.brandId === viewerProfileId) return moderationState(campaign) !== 'deleted';

  return (
    moderationState(campaign) === 'ok' &&
    isCampaignPaid(campaign) &&
    !profileBlocked(campaign.brandId)
  );
}
