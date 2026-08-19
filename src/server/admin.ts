import type { Request } from 'express';

import type { Account, AdminAction } from '../types';
import { db, makeId, profileOf } from './db';
import { requireAccount } from './auth';
import { HttpError } from './validate';

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
 * Zaxira yo'l: Telegram ulanmagan bo'lsa ham egasi panelga kira olsin.
 * `.env` da `ADMIN_PHONES=+998901234567,+998907654321` ko'rinishida beriladi.
 */
function adminPhones(): string[] {
  return (process.env.ADMIN_PHONES ?? '')
    .split(',')
    .map((phone) => phone.trim())
    .filter(Boolean);
}

/**
 * Hisob admin huquqiga egami.
 *
 * Asosiy manba — botdagi `/admin KOD` orqali tayinlangan Telegram id'lari.
 * Shu hisob Telegramga ulangan bo'lsa, u veb-panelda ham admin bo'ladi.
 */
export function isAdminAccount(account: Account): boolean {
  if (account.telegramId != null && db.supportAdmins.includes(account.telegramId)) return true;
  return adminPhones().includes(account.phone);
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
