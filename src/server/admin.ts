import type { Request } from 'express';

import type { Account, AdminAction } from '../types';
import { db, makeId, profileOf } from './db';
import { requireAccount } from './auth';
import { HttpError, normalizePhone } from './validate';

/**
 * Admin (support) huquqlari va moderatsiya qoidalari.
 *
 * Kim admin ekani va adminning amallari shu yerda. Holat qoidalarining o'zi
 * `status.ts` da — ularni kirish tekshiruvi ham ishlatadi.
 */

/* ------------------------------------------------------------------ */
/* Kim admin                                                           */
/* ------------------------------------------------------------------ */

/**
 * Adminlar ro'yxati — `.env` dagi `ADMIN_PHONES`.
 *
 * `ADMIN_PHONES=+998901234567,998907654321,901234567` — vergul bilan.
 * Raqam qaysi ko'rinishda yozilishidan qat'i nazar bir xil shaklga keltiriladi.
 */
export function adminPhones(): string[] {
  return (process.env.ADMIN_PHONES ?? '')
    .split(',')
    .map((raw) => normalizePhone(raw))
    .filter((phone): phone is string => phone !== null);
}

/**
 * Hisob admin huquqiga egami.
 *
 * `ADMIN_PHONES` berilgan bo'lsa — **faqat o'sha raqamlar** admin bo'ladi va
 * boshqa hech qanday yo'l ishlamaydi. Bu ataylab qattiq: aks holda botdagi
 * `/admin KOD` ni bilib olgan har kim o'ziga huquq berib olardi.
 *
 * Ro'yxat berilmagan bo'lsa — eski tartib: botda `/admin KOD` orqali
 * tayinlanganlar. Bu yangi o'rnatishlar uchun qoldirilgan.
 */
export function isAdminAccount(account: Account): boolean {
  const allowed = adminPhones();
  if (allowed.length > 0) return allowed.includes(account.phone);
  return account.telegramId != null && db.supportAdmins.includes(account.telegramId);
}

/**
 * Telegram foydalanuvchisi admin huquqiga egami — bot shu orqali tekshiradi.
 *
 * Ro'yxat berilgan bo'lsa, Telegram id'ning o'zi yetarli emas: u ruxsat
 * berilgan telefon raqamiga ulangan hisobga tegishli bo'lishi shart.
 */
export function isAdminTelegramId(telegramId: number): boolean {
  const allowed = adminPhones();
  if (allowed.length === 0) return db.supportAdmins.includes(telegramId);

  const account = db.accounts.find((item) => item.telegramId === telegramId);
  return account ? allowed.includes(account.phone) : false;
}

/**
 * `db.supportAdmins` ni ruxsat etilgan ro'yxatga moslaydi.
 *
 * Server har ishga tushganda chaqiriladi. Ilgari `/admin KOD` orqali huquq
 * olgan begona hisoblar shu yerda tushib qoladi — ya'ni ro'yxatni
 * o'zgartirish darhol kuchga kiradi, bazani qo'lda tahrirlash shart emas.
 *
 * Bu ro'yxat botda faqat bildirishnoma manzili sifatida ishlatiladi
 * (murojaat va shikoyat kimga borishi); huquqning o'zi har safar
 * `isAdminTelegramId` orqali qayta tekshiriladi.
 */
export function syncSupportAdmins(): { removed: number; kept: number } {
  const allowed = adminPhones();
  if (allowed.length === 0) return { removed: 0, kept: db.supportAdmins.length };

  const before = db.supportAdmins;
  const kept = before.filter((telegramId) => isAdminTelegramId(telegramId));

  // Ruxsat etilgan hisob botga ulangan bo'lsa — ro'yxatda bo'lishi kerak.
  for (const account of db.accounts) {
    if (account.telegramId == null) continue;
    if (!allowed.includes(account.phone)) continue;
    if (!kept.includes(account.telegramId)) kept.push(account.telegramId);
  }

  db.supportAdmins = kept;
  return { removed: before.length - kept.filter((id) => before.includes(id)).length, kept: kept.length };
}

export function requireAdmin(req: Request): Account {
  const account = requireAccount(req);
  if (!isAdminAccount(account)) {
    throw new HttpError(403, 'Bu bo‘lim faqat administratorlar uchun');
  }
  return account;
}

/* ------------------------------------------------------------------ */
/* Kuzatuv jurnali                                                     */
/* ------------------------------------------------------------------ */

/** Jurnal cheksiz o'smasligi uchun oxirgi shuncha yozuv saqlanadi. */
const LOG_LIMIT = 500;

/**
 * Adminning har bir amalini yozib qo'yadi. Keyinchalik «bu hisobni kim va
 * nega muzlatgan?» degan savolga javob beradi.
 */
export function logAction(input: {
  admin: Account;
  action: string;
  targetType: AdminAction['targetType'];
  targetId: string;
  targetLabel: string;
  reason?: string;
}): AdminAction {
  let adminName = input.admin.phone;
  try {
    adminName = profileOf(input.admin).name;
  } catch {
    // Profil topilmasa telefon raqami yetarli.
  }

  const entry: AdminAction = {
    id: makeId('log'),
    adminId: input.admin.id,
    adminName,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    reason: input.reason,
    createdAt: new Date().toISOString(),
  };

  db.adminLog = [entry, ...db.adminLog].slice(0, LOG_LIMIT);
  return entry;
}
