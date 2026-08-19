import crypto from 'crypto';
import { promisify } from 'util';
import type { Request, Response } from 'express';

import type { Account, BloggerProfile, BrandProfile, SessionRecord, UserRole } from '../types';
import { TIERS } from '../types';
import { db, makeId, persist, profileOf } from './db';
import { HttpError, handle, num, oneOf, str, strList } from './validate';

const SESSION_COOKIE = 'instacollab_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 kun

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/* ------------------------------------------------------------------ */
/* Parollar                                                            */
/* ------------------------------------------------------------------ */

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;

  const derived = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

/** Parolni tiklashda beriladigan vaqtinchalik parol. */
export function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `IC-${out}`;
}

export function assertPasswordStrength(password: string): void {
  if (password.length < 8) throw new HttpError(400, "Parol kamida 8 ta belgidan iborat bo'lishi kerak");
  if (password.length > 200) throw new HttpError(400, 'Parol juda uzun');
}

/* ------------------------------------------------------------------ */
/* Sessiyalar (cookie)                                                 */
/* ------------------------------------------------------------------ */

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function isSecureRequest(req: Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const parts = [`${SESSION_COOKIE}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (isSecureRequest(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export async function startSession(req: Request, res: Response, accountId: string): Promise<void> {
  const token = crypto.randomBytes(32).toString('base64url');
  const session: SessionRecord = {
    token,
    accountId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
  db.sessions = [...db.sessions, session];
  setSessionCookie(req, res, token);
  await persist();
}

export function readSessionToken(req: Request): string | null {
  return readCookie(req, SESSION_COOKIE);
}

export function currentAccount(req: Request): Account | null {
  const token = readSessionToken(req);
  if (!token) return null;

  const session = db.sessions.find((item) => item.token === token);
  if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;

  return db.accounts.find((account) => account.id === session.accountId) ?? null;
}

export function requireAccount(req: Request): Account {
  const account = currentAccount(req);
  if (!account) throw new HttpError(401, 'Bu amal uchun tizimga kiring');
  return account;
}

export function requireRole(req: Request, role: UserRole): Account {
  const account = requireAccount(req);
  if (account.role !== role) {
    throw new HttpError(
      403,
      role === 'advertiser'
        ? 'Bu amalni faqat reklama beruvchi hisobi bajara oladi'
        : 'Bu amalni faqat bloger hisobi bajara oladi',
    );
  }
  return account;
}

/** Foydalanuvchining barcha sessiyalarini bekor qiladi (parol tiklangandan keyin). */
export function revokeAllSessions(accountId: string): void {
  db.sessions = db.sessions.filter((session) => session.accountId !== accountId);
}

export function publicAccount(account: Account) {
  return {
    id: account.id,
    phone: account.phone,
    role: account.role,
    profileId: account.profileId,
    telegramId: account.telegramId,
    telegramUsername: account.telegramUsername,
  };
}

export function authPayload(account: Account) {
  return { account: publicAccount(account), profile: profileOf(account) };
}

/* ------------------------------------------------------------------ */
/* Profil o'qish/yozish                                                */
/* ------------------------------------------------------------------ */

const DEFAULT_LOGO =
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80';
const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80';

export function readBrandBody(body: Record<string, unknown>, existing?: BrandProfile): BrandProfile {
  const name = str(body.name, 'Brend nomi', { max: 80, required: !existing, fallback: existing?.name });

  return {
    id: existing?.id ?? makeId('brand'),
    name,
    username:
      str(body.username, 'username', { max: 40 }).replace(/^@/, '') ||
      existing?.username ||
      name.toLowerCase().replace(/\s+/g, '_'),
    logo: str(body.logo, 'logo', { max: 500 }) || existing?.logo || DEFAULT_LOGO,
    category: str(body.category, "Yo'nalish", { max: 60, fallback: existing?.category ?? 'Umumiy' }),
    description: str(body.description, 'Tavsif', {
      max: 600,
      fallback: existing?.description ?? "Yangi ro'yxatdan o'tgan brend.",
    }),
    contactPerson: str(body.contactPerson, "Mas'ul shaxs", {
      max: 80,
      fallback: existing?.contactPerson ?? "Mas'ul menejer",
    }),
    contactTelegram: handle(body.contactTelegram, 'Telegram', existing?.contactTelegram ?? '@brand_admin'),
    phone: str(body.phone, 'Telefon', { max: 32, fallback: existing?.phone ?? '+998 90 000-00-00' }),
    websiteOrInstagram:
      str(body.websiteOrInstagram, 'Instagram', { max: 120 }).replace(/^@/, '') ||
      existing?.websiteOrInstagram ||
      '',
    totalCampaignsCreated: existing?.totalCampaignsCreated ?? 0,
  };
}

export function readBloggerBody(
  body: Record<string, unknown>,
  existing?: BloggerProfile,
): BloggerProfile {
  const name = str(body.name, 'Ism', { max: 80, required: !existing, fallback: existing?.name });
  const followersCount = num(body.followersCount, 'Obunachilar', {
    min: 0,
    max: 500_000_000,
    fallback: existing?.followersCount ?? 0,
  });

  const rawPricing = (body.pricing ?? {}) as Record<string, unknown>;
  const tags = strList(body.tags, { max: 8, itemMax: 30 });

  return {
    id: existing?.id ?? makeId('blogger'),
    name,
    username:
      str(body.username, 'username', { max: 40 }).replace(/^@/, '') ||
      existing?.username ||
      name.toLowerCase().replace(/\s+/g, '_'),
    avatar: str(body.avatar, 'avatar', { max: 500 }) || existing?.avatar || DEFAULT_AVATAR,
    niche: str(body.niche, "Yo'nalish", { max: 60, fallback: existing?.niche ?? 'Lifestyle & Kundalik' }),
    bio: str(body.bio, 'Bio', { max: 600, fallback: existing?.bio ?? 'Instagram bloger va influenser.' }),
    city: str(body.city, 'Shahar', { max: 60, fallback: existing?.city ?? 'Toshkent' }),
    followersCount,
    avgStoryViews: num(body.avgStoryViews, "Story ko'rishlar", {
      min: 0,
      max: 500_000_000,
      fallback: existing?.avgStoryViews ?? 0,
    }),
    avgReelsViews: num(body.avgReelsViews, "Reels ko'rishlar", {
      min: 0,
      max: 500_000_000,
      fallback: existing?.avgReelsViews ?? 0,
    }),
    engagementRate: Math.min(100, Math.max(0, Number(body.engagementRate) || existing?.engagementRate || 0)),
    tier: existing?.tier ?? oneOf(body.tier, TIERS, followersCount > 50_000 ? 'Pro Bloger' : "O'sayotgan Bloger"),
    isVerified: existing?.isVerified ?? false,
    rating: existing?.rating ?? 5,
    completedDeals: existing?.completedDeals ?? 0,
    audienceDemographics: existing?.audienceDemographics,
    pricing: {
      story: num(rawPricing.story, 'Story narxi', {
        min: 0,
        max: 1_000_000_000,
        fallback: existing?.pricing?.story ?? 0,
      }),
      post: num(rawPricing.post, 'Post narxi', {
        min: 0,
        max: 1_000_000_000,
        fallback: existing?.pricing?.post ?? 0,
      }),
      reels: num(rawPricing.reels, 'Reels narxi', {
        min: 0,
        max: 1_000_000_000,
        fallback: existing?.pricing?.reels ?? 0,
      }),
    },
    tags: tags.length ? tags : (existing?.tags ?? ['#bloger', '#reklama']),
    contactTelegram: handle(body.contactTelegram, 'Telegram', existing?.contactTelegram ?? '@bloger_aloqa'),
    phone: str(body.phone, 'Telefon', { max: 32, fallback: existing?.phone ?? '+998 90 000-00-00' }),
  };
}

/**
 * Yangi hisob va unga bog'langan profil yaratadi.
 * Ham veb-formadan, ham Telegram botdan chaqiriladi.
 */
export async function createAccount(input: {
  role: UserRole;
  phone: string;
  password: string;
  profile: Record<string, unknown>;
  telegramId?: number;
  telegramUsername?: string;
}): Promise<Account> {
  assertPasswordStrength(input.password);

  if (db.accounts.some((account) => account.phone === input.phone)) {
    throw new HttpError(409, "Bu telefon raqami allaqachon ro'yxatdan o'tgan. «Kirish» bo'limidan foydalaning.");
  }

  const profileBody = { ...input.profile, phone: input.phone };
  let profileId: string;

  if (input.role === 'advertiser') {
    const brand = readBrandBody(profileBody);
    db.brands = [brand, ...db.brands];
    profileId = brand.id;
  } else {
    const blogger = readBloggerBody(profileBody);
    db.bloggers = [blogger, ...db.bloggers];
    profileId = blogger.id;
  }

  const account: Account = {
    id: makeId('acc'),
    phone: input.phone,
    passwordHash: await hashPassword(input.password),
    role: input.role,
    profileId,
    createdAt: new Date().toISOString(),
    telegramId: input.telegramId,
    telegramUsername: input.telegramUsername,
  };

  db.accounts = [...db.accounts, account];
  await persist();
  return account;
}
