import express, { type NextFunction, type Request, type Response } from 'express';

import type {
  Account,
  BloggerProfile,
  BrandProfile,
  Campaign,
  CampaignReport,
  VerificationRequest,
  ChatMessage,
  ProposalBid,
} from '../types';
import { CAMPAIGN_FORMATS, REPORT_REASONS, buildThreadId } from '../types';
import {
  accountByPhone,
  accountByProfileId,
  db,
  makeId,
  persist,
  profileOf,
  todayLabel,
} from './db';
import {
  authPayload,
  clearSessionCookie,
  currentAccount,
  readBloggerBody,
  readBrandBody,
  readSessionToken,
  requireAccount,
  requireRole,
  startSession,
  verifyPassword,
  createAccount,
  assertPasswordStrength,
  hashPassword,
  generateTempPassword,
  revokeAllSessions,
} from './auth';
import { HttpError, handle, normalizePhone, num, oneOf, str, strList } from './validate';
import { notify, botInfo } from './bot';
import { verifyInitData } from './miniapp';
import { addClient, broadcast, connectedClients, startHeartbeat } from './events';
import { isAdminAccount, logAction, requireAdmin } from './admin';
import { blockedReason, canSeeCampaign, isAccountActive, moderationState } from './status';
import {
  canBloggerSeeCampaign,
  minutesUntilOpen,
  isOpenToEveryone,
  normalizeThemeColor,
  sortBidsForBrand,
  statsFor,
  withStats,
} from './community';
import {
  MAX_IMAGE_BYTES,
  imageId,
  imageStore,
  isValidImageId,
  mimeFromId,
  validateImage,
} from './images';

/* ------------------------------------------------------------------ */
/* Rate-limit                                                          */
/* ------------------------------------------------------------------ */

const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(maxPerMinute: number, scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${scope}:${req.ip ?? 'unknown'}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    if (bucket.count >= maxPerMinute) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return res
        .status(429)
        .json({ error: "So'rovlar juda tez-tez yuborilmoqda. Bir daqiqadan so'ng qayta urinib ko'ring." });
    }
    bucket.count += 1;
    return next();
  };
}

/** Har daqiqada eskirgan bucket va sessiyalarni tozalab turadi. */
export function startCleanupTimer(): void {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    const live = db.sessions.filter((session) => Date.parse(session.expiresAt) > now);
    if (live.length !== db.sessions.length) {
      db.sessions = live;
      void persist();
    }

    void releaseDelayedCampaigns(now);
  }, 60_000);
  timer.unref();

  startHeartbeat();
}

/**
 * Ptichka muddati tugagan e'lonlarni hammaga ochadi.
 *
 * Nega `setTimeout` emas: bepul tarifda server uxlab qolishi yoki qayta
 * ishga tushishi mumkin — o'shanda taymer yo'qolib, e'lon hech kimga
 * ochilmay qolardi. Har daqiqalik tekshiruv esa qayta ishga tushgandan
 * keyin ham ishlayveradi.
 */
async function releaseDelayedCampaigns(now: number): Promise<void> {
  const due = db.campaigns.filter(
    (campaign) =>
      campaign.publishedAt &&
      !campaign.notifiedAllAt &&
      moderationState(campaign) === 'ok' &&
      isOpenToEveryone(campaign, now),
  );

  if (due.length === 0) return;

  for (const campaign of due) {
    campaign.notifiedAllAt = new Date(now).toISOString();
    // Endi e'lon hamma uchun ochiq — jonli oqim orqali darhol ko'rinsin.
    broadcast({ type: 'campaign:new', campaign });
    void notify.newCampaign(campaign, false);
  }

  db.campaigns = [...db.campaigns];
  await persist();
}

const readLimit = rateLimit(240, 'read');
const writeLimit = rateLimit(40, 'write');
const authLimit = rateLimit(10, 'auth');

function asyncRoute(fn: (req: Request, res: Response) => Promise<void> | void) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export const api = express.Router();

api.get('/health', readLimit, (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

/** Mijozga kerak bo'ladigan ochiq sozlamalar (sirlar emas). */
api.get('/config', readLimit, (_req, res) => {
  res.json({
    telegramBot: botInfo.username ? `@${botInfo.username}` : null,
    telegramBotUrl: botInfo.username ? `https://t.me/${botInfo.username}` : null,
    demoMode: process.env.NODE_ENV !== 'production',
    liveClients: connectedClients(),
  });
});

/* ---------- Jonli yangilanishlar ---------- */

/**
 * Uzoq ulanish: server o'zgarish bo'lishi bilan xabar yuboradi.
 * Brauzerdagi `EventSource` uzilganda o'zi qayta ulanadi.
 */
api.get('/events', (req, res) => {
  const account = requireAccount(req);

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Nginx kabi proksilar javobni bufer qilmasin — aks holda xabarlar kechikadi.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  addClient(res, account.id, account.profileId);
});

/* ---------- Rasmlar ---------- */

const uploadLimit = rateLimit(20, 'upload');

/**
 * Rasm yuklash. Mijoz rasmni oldindan kichraytirib, JPEG/PNG/WEBP ko'rinishida
 * xom bayt sifatida yuboradi. Javobda `/api/images/<id>` manzili qaytadi —
 * uni profilning `avatar` yoki `logo` maydoniga yozish kifoya.
 */
api.post(
  '/images',
  uploadLimit,
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_IMAGE_BYTES }),
  asyncRoute(async (req, res) => {
    requireAccount(req);

    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const contentType = String(req.headers['content-type'] ?? '').split(';')[0].trim();
    const { mime, ext } = validateImage(contentType, bytes);

    const id = imageId(bytes, ext);
    const store = imageStore();
    // Bir xil rasm ikkinchi marta saqlanmaydi — id mazmun xeshidan olingan.
    if (!(await store.exists(id))) await store.save({ id, mime, bytes });

    res.status(201).json({ id, url: `/api/images/${id}`, bytes: bytes.length });
  }),
);

/** Rasmni berish. Manzil mazmunga bog'liq bo'lgani uchun abadiy keshlanadi. */
api.get(
  '/images/:id',
  readLimit,
  asyncRoute(async (req, res) => {
    const id = req.params.id;
    if (!isValidImageId(id)) {
      res.status(404).json({ error: 'Rasm topilmadi' });
      return;
    }

    const image = await imageStore().load(id);
    if (!image) {
      res.status(404).json({ error: 'Rasm topilmadi' });
      return;
    }

    res.setHeader('Content-Type', image.mime || mimeFromId(id));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(image.bytes.length));
    res.end(image.bytes);
  }),
);

/* ---------- Autentifikatsiya ---------- */

api.get('/auth/me', readLimit, (req, res) => {
  const account = currentAccount(req);
  if (!account) {
    res.status(401).json({ error: 'Tizimga kirilmagan' });
    return;
  }
  res.json(authPayload(account));
});

api.post(
  '/auth/register',
  authLimit,
  asyncRoute(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const role = oneOf(body.role, ['advertiser', 'blogger'] as const, 'advertiser');
    const phone = normalizePhone(body.phone);
    if (!phone) throw new HttpError(400, "Telefon raqamini to'g'ri kiriting: +998 90 123-45-67");

    const password = typeof body.password === 'string' ? body.password : '';
    const account = await createAccount({ role, phone, password, profile: body });

    await startSession(req, res, account.id);
    res.status(201).json(authPayload(account));
  }),
);

api.post(
  '/auth/login',
  authLimit,
  asyncRoute(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const phone = normalizePhone(body.phone);
    const password = typeof body.password === 'string' ? body.password : '';

    const account = phone ? accountByPhone(phone) : undefined;
    // Raqam ro'yxatda bor-yo'qligini oshkor qilmaslik uchun ikkala holatda bir xil xabar.
    const ok = account ? await verifyPassword(password, account.passwordHash) : false;
    if (!account || !ok) throw new HttpError(401, "Telefon raqami yoki parol noto'g'ri");
    // Parol to'g'ri bo'lsa ham muzlatilgan hisobga kirib bo'lmaydi. Sabab
    // aytiladi, aks holda odam nima bo'lganini tushunmay qoladi.
    if (!isAccountActive(account)) throw new HttpError(403, blockedReason(account));

    await startSession(req, res, account.id);
    res.json(authPayload(account));
  }),
);

/**
 * Telegram Mini App orqali kirish.
 *
 * Foydalanuvchi botdagi «Panel» tugmasini bosganda ilova Telegramdan imzolangan
 * `initData` oladi. Imzo to'g'ri bo'lsa — parol so'ralmaydi, sessiya darhol ochiladi.
 */
api.post(
  '/auth/telegram',
  authLimit,
  asyncRoute(async (req, res) => {
    const initData = str((req.body ?? {}).initData, 'initData', { max: 4096, required: true });
    const token = process.env.TELEGRAM_BOT_TOKEN ?? '';

    const telegramUser = verifyInitData(initData, token);
    if (!telegramUser) throw new HttpError(401, "Telegram ma'lumotlari tasdiqlanmadi. Botni qayta oching.");

    const account = db.accounts.find((item) => item.telegramId === telegramUser.id);
    if (!account) {
      // Hisob yo'q yoki Telegramga ulanmagan — botda ro'yxatdan o'tish kerak.
      res.status(403).json({
        error: "Bu Telegram hisobi platformaga ulanmagan. Botga qayting va «Ro'yxatdan o'tish» yoki «Mavjud hisobni ulash» tugmasini bosing.",
        needsRegistration: true,
        telegramName: [telegramUser.firstName, telegramUser.lastName].filter(Boolean).join(' '),
      });
      return;
    }

    if (!isAccountActive(account)) throw new HttpError(403, blockedReason(account));

    // Telegram username o'zgargan bo'lsa yangilaymiz.
    if (account.telegramUsername !== telegramUser.username) {
      account.telegramUsername = telegramUser.username;
      db.accounts = db.accounts.map((item) => (item.id === account.id ? account : item));
      await persist();
    }

    await startSession(req, res, account.id);
    res.json(authPayload(account));
  }),
);

api.post(
  '/auth/password',
  authLimit,
  asyncRoute(async (req, res) => {
    const account = requireAccount(req);
    const body = (req.body ?? {}) as Record<string, unknown>;

    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!(await verifyPassword(currentPassword, account.passwordHash))) {
      throw new HttpError(400, "Joriy parol noto'g'ri");
    }
    assertPasswordStrength(newPassword);
    if (newPassword === currentPassword) {
      throw new HttpError(400, "Yangi parol eskisidan farq qilishi kerak");
    }

    account.passwordHash = await hashPassword(newPassword);
    db.accounts = db.accounts.map((item) => (item.id === account.id ? account : item));

    // Boshqa qurilmalardagi sessiyalar bekor qilinadi, joriysi qoladi.
    const token = readSessionToken(req);
    db.sessions = db.sessions.filter(
      (session) => session.accountId !== account.id || session.token === token,
    );
    await persist();

    res.json({ ok: true });
  }),
);

api.post(
  '/auth/logout',
  writeLimit,
  asyncRoute(async (req, res) => {
    const token = readSessionToken(req);
    if (token) {
      db.sessions = db.sessions.filter((session) => session.token !== token);
      await persist();
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  }),
);

/* ---------- Platforma holati ---------- */

/** Suhbat identifikatori `${brandId}::${bloggerId}` — tomonlarni ajratib olamiz. */
function threadParties(threadId: string): { brandId: string; bloggerId: string } {
  const [brandId = '', bloggerId = ''] = threadId.split('::');
  return { brandId, bloggerId };
}

/**
 * Foydalanuvchiga ko'rsatiladigan ma'lumot.
 *
 * Blogerlar katalogi hammaga ochiq. Shaxsiy narsalar esa yopiq: ariza
 * kontaktlari va yozishmalar faqat ikki tomonga ko'rinadi.
 *
 * E'lonlarda ikki qatlam filtr bor:
 *   • moderatsiya — admin yashirgani va bloklangan hisobniki chiqib ketadi;
 *   • ptichka — yangi e'lonni ptichkasiz bloger 15 daqiqa kechroq ko'radi.
 */
function visibleState(account: Account) {
  const now = Date.now();

  const moderated = db.campaigns.filter((c) => canSeeCampaign(c, account.profileId));

  if (account.role === 'blogger') {
    return {
      brands: db.brands,
      // Ptichkasiz bloger yangi e'lonni biroz kechroq ko'radi.
      campaigns: moderated.filter((c) => canBloggerSeeCampaign(c, account.profileId, now)),
      bloggers: withStats(db.bloggers),
      bids: db.bids.filter((b) => b.bloggerId === account.profileId),
      messages: db.messages.filter((m) => threadParties(m.threadId).bloggerId === account.profileId),
      follows: db.follows,
    };
  }

  const myCampaigns = new Set(
    db.campaigns.filter((c) => c.brandId === account.profileId).map((c) => c.id),
  );

  return {
    brands: db.brands,
    campaigns: moderated,
    bloggers: withStats(db.bloggers),
    // Arizalar tartibi: ptichkalilar tepada.
    bids: sortBidsForBrand(db.bids.filter((b) => myCampaigns.has(b.campaignId))),
    messages: db.messages.filter((m) => threadParties(m.threadId).brandId === account.profileId),
    follows: db.follows,
  };
}

api.get('/state', readLimit, (req, res) => {
  res.json(visibleState(requireAccount(req)));
});

/* ---------- Profillar ---------- */

api.patch(
  '/brands/:id',
  writeLimit,
  asyncRoute(async (req, res) => {
    const account = requireRole(req, 'advertiser');
    if (account.profileId !== req.params.id) {
      throw new HttpError(403, "Faqat o'z brend profilingizni tahrirlay olasiz");
    }

    const existing = db.brands.find((b) => b.id === account.profileId);
    if (!existing) throw new HttpError(404, 'Brend topilmadi');

    const updated = readBrandBody((req.body ?? {}) as Record<string, unknown>, existing);
    db.brands = db.brands.map((b) => (b.id === updated.id ? updated : b));

    const ownCampaignIds = new Set(db.campaigns.filter((c) => c.brandId === updated.id).map((c) => c.id));
    db.campaigns = db.campaigns.map((campaign) =>
      campaign.brandId === updated.id
        ? { ...campaign, brandName: updated.name, brandLogo: updated.logo }
        : campaign,
    );
    db.bids = db.bids.map((bid) =>
      ownCampaignIds.has(bid.campaignId) ? { ...bid, brandName: updated.name } : bid,
    );

    await persist();

    broadcast({ type: 'brand:updated', brand: updated });
    res.json(updated);
  }),
);

api.patch(
  '/bloggers/:id',
  writeLimit,
  asyncRoute(async (req, res) => {
    const account = requireRole(req, 'blogger');
    if (account.profileId !== req.params.id) {
      throw new HttpError(403, "Faqat o'z profilingizni tahrirlay olasiz");
    }

    const existing = db.bloggers.find((b) => b.id === account.profileId);
    if (!existing) throw new HttpError(404, 'Bloger topilmadi');

    const updated = readBloggerBody((req.body ?? {}) as Record<string, unknown>, existing);
    db.bloggers = db.bloggers.map((b) => (b.id === updated.id ? updated : b));

    db.bids = db.bids.map((bid) =>
      bid.bloggerId === updated.id
        ? {
            ...bid,
            bloggerName: updated.name,
            bloggerUsername: updated.username,
            bloggerAvatar: updated.avatar,
            bloggerFollowers: updated.followersCount,
            bloggerNiche: updated.niche,
            bloggerTelegram: updated.contactTelegram,
            bloggerPhone: updated.phone,
          }
        : bid,
    );

    await persist();

    // Bloger profili hammaga emas — faqat o'ziga va u bilan ishlagan brendlarga.
    broadcast({ type: 'blogger:updated', blogger: updated });
    res.json(updated);
  }),
);

/* ---------- E'lonlar ---------- */

api.post(
  '/campaigns',
  writeLimit,
  asyncRoute(async (req, res) => {
    const account = requireRole(req, 'advertiser');
    const brand = profileOf(account) as BrandProfile;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const campaign: Campaign = {
      id: makeId('c'),
      brandId: brand.id,
      brandName: brand.name,
      brandLogo: brand.logo,
      title: str(body.title, "E'lon sarlavhasi", { max: 140, required: true }),
      description: str(body.description, "Ma'lumot", { max: 2000, required: true }),
      niche: str(body.niche, "Yo'nalish", { max: 60, fallback: 'Lifestyle & Kundalik' }),
      format: oneOf(body.format, CAMPAIGN_FORMATS, 'Reels Integratsiya'),
      deadlineDays: num(body.deadlineDays, 'Muddat', { min: 1, max: 90, fallback: 5 }),
      requiredFollowersMin: num(body.requiredFollowersMin, 'Minimal obunachilar', {
        min: 0,
        max: 100_000_000,
        fallback: 0,
      }),
      targetAudience: str(body.targetAudience, 'Auditoriya', { max: 200, fallback: 'Barcha faol auditoriya' }),
      status: 'active',
      bidsCount: 0,
      createdDate: todayLabel(),
      // Ptichka ustunligi shu vaqtdan hisoblanadi.
      publishedAt: new Date().toISOString(),
      talkingPoints: strList(body.talkingPoints, { max: 12, itemMax: 200 }),
      hashtags: strList(body.hashtags, { max: 10, itemMax: 40 }),
      contactTelegram: handle(body.contactTelegram, 'Telegram', brand.contactTelegram),
      contactInstagram:
        str(body.contactInstagram, 'Instagram', { max: 60 }).replace(/^@/, '') ||
        brand.websiteOrInstagram ||
        brand.username,
      phone: str(body.phone, 'Telefon', { max: 32, fallback: brand.phone }),
      dosAndDonts: {
        dos: strList((body.dosAndDonts as Record<string, unknown>)?.dos, { max: 8, itemMax: 160 }),
        donts: strList((body.dosAndDonts as Record<string, unknown>)?.donts, { max: 8, itemMax: 160 }),
      },
    };

    db.campaigns = [campaign, ...db.campaigns];
    db.brands = db.brands.map((b) =>
      b.id === brand.id ? { ...b, totalCampaignsCreated: (b.totalCampaignsCreated ?? 0) + 1 } : b,
    );
    await persist();

    /**
     * Birinchi 15 daqiqa — faqat ptichkalilar uchun.
     *
     * Jonli oqim ham shu qoidaga bo'ysunadi: e'lon reklama beruvchilarga
     * (ular bozorni to'liq ko'radi) va ptichkali blogerlarga yuboriladi.
     * Qolganlarga `releaseDelayedCampaigns` muddati kelganda yuboradi.
     */
    const earlyAudience = [
      ...db.brands.map((b) => b.id),
      ...db.bloggers.filter((b) => b.isVerified).map((b) => b.id),
    ];
    broadcast({ type: 'campaign:new', campaign }, earlyAudience);
    void notify.newCampaign(campaign, true);
    res.status(201).json(campaign);
  }),
);

api.delete(
  '/campaigns/:id',
  writeLimit,
  asyncRoute(async (req, res) => {
    const account = requireRole(req, 'advertiser');
    const campaign = db.campaigns.find((c) => c.id === req.params.id);
    if (!campaign) throw new HttpError(404, "Bunday e'lon topilmadi");
    if (campaign.brandId !== account.profileId) {
      throw new HttpError(403, "Bu e'lonni faqat uni joylagan brend o'chira oladi");
    }

    db.campaigns = db.campaigns.filter((c) => c.id !== campaign.id);
    db.bids = db.bids.filter((b) => b.campaignId !== campaign.id);
    await persist();

    broadcast({ type: 'campaign:deleted', campaignId: campaign.id });
    res.json({ ok: true });
  }),
);

/* ---------- Arizalar ---------- */

api.post(
  '/bids',
  writeLimit,
  asyncRoute(async (req, res) => {
    const account = requireRole(req, 'blogger');
    const blogger = profileOf(account) as BloggerProfile;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const campaign = db.campaigns.find((c) => c.id === body.campaignId);
    if (!campaign) throw new HttpError(404, "Bunday e'lon topilmadi");

    // Ko'ra olmaydigan e'longa ariza ham yubora olmaydi: aks holda id'ni
    // bilgan odam ptichka kutish davrini chetlab o'tardi.
    if (!canSeeCampaign(campaign, account.profileId)) {
      throw new HttpError(404, "Bunday e'lon topilmadi");
    }
    if (!canBloggerSeeCampaign(campaign, blogger.id)) {
      throw new HttpError(
        403,
        `Bu e'lon hozircha faqat ptichkali blogerlar uchun ochiq. ${minutesUntilOpen(campaign)} daqiqadan keyin siz ham ariza yubora olasiz.`,
      );
    }

    if (db.bids.some((b) => b.campaignId === campaign.id && b.bloggerId === blogger.id)) {
      throw new HttpError(409, "Siz bu e'longa allaqachon ariza qoldirgansiz");
    }

    const bid: ProposalBid = {
      id: makeId('bid'),
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      brandName: campaign.brandName,
      bloggerId: blogger.id,
      bloggerName: blogger.name,
      bloggerUsername: blogger.username,
      bloggerAvatar: blogger.avatar,
      bloggerFollowers: blogger.followersCount,
      bloggerNiche: blogger.niche,
      bloggerTelegram: handle(body.bloggerTelegram, 'Telegram', blogger.contactTelegram ?? '@bloger_aloqa'),
      bloggerPhone: str(body.bloggerPhone, 'Telefon', { max: 32, fallback: blogger.phone ?? '+998 90 000-00-00' }),
      message: str(body.message, 'Taklif matni', { max: 1500, required: true }),
      creativeIdea: str(body.creativeIdea, "Kreativ g'oya", {
        max: 500,
        fallback: 'Tabiiy tavsiya va sifatli kontent',
      }),
      status: 'pending',
      submittedAt: new Date().toISOString(),
      belowRequirement: blogger.followersCount < campaign.requiredFollowersMin,
    };

    db.bids = [bid, ...db.bids];
    db.campaigns = db.campaigns.map((c) => (c.id === campaign.id ? { ...c, bidsCount: c.bidsCount + 1 } : c));
    await persist();

    // Arizada kontaktlar bor — faqat ikkala tomonga yuboriladi.
    const updatedCampaign = db.campaigns.find((c) => c.id === campaign.id);
    broadcast(
      { type: 'bid:new', bid, campaignId: campaign.id, bidsCount: updatedCampaign?.bidsCount ?? 0, blogger },
      [campaign.brandId, blogger.id],
    );
    void notify.newBid(bid, campaign);
    res.status(201).json(bid);
  }),
);

api.patch(
  '/bids/:id',
  writeLimit,
  asyncRoute(async (req, res) => {
    const account = requireRole(req, 'advertiser');
    const bid = db.bids.find((b) => b.id === req.params.id);
    if (!bid) throw new HttpError(404, 'Bunday ariza topilmadi');

    const campaign = db.campaigns.find((c) => c.id === bid.campaignId);
    if (!campaign || campaign.brandId !== account.profileId) {
      throw new HttpError(403, "Bu arizani faqat e'lon egasi ko'rib chiqa oladi");
    }

    const status = oneOf(
      req.body?.status,
      ['pending', 'accepted', 'rejected', 'completed'] as const,
      'pending',
    );
    const updated: ProposalBid = {
      ...bid,
      status,
      // Yakunlangan sana statistikada «oxirgi zakaz» sifatida ishlatiladi.
      completedAt: status === 'completed' ? (bid.completedAt ?? new Date().toISOString()) : undefined,
    };
    db.bids = db.bids.map((b) => (b.id === bid.id ? updated : b));
    await persist();

    broadcast({ type: 'bid:updated', bid: updated }, [campaign.brandId, bid.bloggerId]);

    // Statistika o'zgardi — blogerning kartasi hamma joyda yangilansin.
    const blogger = db.bloggers.find((b) => b.id === bid.bloggerId);
    if (blogger) broadcast({ type: 'blogger:updated', blogger: { ...blogger, stats: statsFor(blogger.id) } });

    if (status !== bid.status) void notify.bidStatusChanged(updated);
    res.json(updated);
  }),
);

/* ---------- Chat ---------- */

api.post(
  '/messages',
  writeLimit,
  asyncRoute(async (req, res) => {
    const account = requireAccount(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const partnerId = str(body.partnerId, 'partnerId', { max: 60, required: true });

    // Suhbat kimlar o'rtasida ekanini serverning o'zi aniqlaydi — mijoz aytmaydi.
    const brand =
      account.role === 'advertiser'
        ? db.brands.find((b) => b.id === account.profileId)
        : db.brands.find((b) => b.id === partnerId);
    const blogger =
      account.role === 'blogger'
        ? db.bloggers.find((b) => b.id === account.profileId)
        : db.bloggers.find((b) => b.id === partnerId);

    if (!brand || !blogger) throw new HttpError(400, 'Suhbat ishtirokchisi topilmadi');

    const sender = account.role === 'advertiser' ? brand : blogger;
    const message: ChatMessage = {
      id: makeId('msg'),
      threadId: buildThreadId(brand.id, blogger.id),
      senderId: sender.id,
      senderName: sender.name,
      senderAvatar: account.role === 'advertiser' ? brand.logo : blogger.avatar,
      senderRole: account.role,
      text: str(body.text, 'Xabar', { max: 2000, required: true }),
      createdAt: new Date().toISOString(),
    };

    db.messages = [...db.messages, message].slice(-5000);
    await persist();

    broadcast({ type: 'message:new', message }, [brand.id, blogger.id]);

    const recipientProfileId = account.role === 'advertiser' ? blogger.id : brand.id;
    const recipient = accountByProfileId(recipientProfileId);
    if (recipient) void notify.newMessage(message, recipient);

    res.status(201).json(message);
  }),
);

/* ------------------------------------------------------------------ */
/* Shikoyatlar — yolg'on e'lonni foydalanuvchi belgilaydi              */
/* ------------------------------------------------------------------ */

/**
 * E'lon ustidan shikoyat. Admin har bir e'lonni o'qib chiqmasligi uchun
 * shubhali e'lonni foydalanuvchining o'zi belgilab qo'yadi.
 *
 * Bir foydalanuvchi bitta e'longa faqat bir marta shikoyat qila oladi —
 * aks holda ro'yxatni takroriy yozuvlar bilan to'ldirib yuborish mumkin edi.
 */
api.post(
  '/reports',
  writeLimit,
  asyncRoute(async (req, res) => {
    const account = requireAccount(req);
    const body = (req.body ?? {}) as Record<string, unknown>;

    const campaign = db.campaigns.find((c) => c.id === str(body.campaignId, 'E‘lon', { max: 120, required: true }));
    if (!campaign) throw new HttpError(404, "Bunday e'lon topilmadi");
    if (campaign.brandId === account.profileId) {
      throw new HttpError(400, "O'z e'loningiz ustidan shikoyat qila olmaysiz");
    }

    const already = db.reports.find(
      (r) => r.campaignId === campaign.id && r.reporterId === account.profileId,
    );
    if (already) throw new HttpError(409, "Siz bu e'lon ustidan allaqachon shikoyat qilgansiz");

    const profile = profileOf(account);
    const report: CampaignReport = {
      id: makeId('rep'),
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      reporterId: account.profileId,
      reporterName: profile.name,
      reason: oneOf(body.reason, REPORT_REASONS, REPORT_REASONS[0]),
      comment: str(body.comment, 'Izoh', { max: 1000 }) || undefined,
      createdAt: new Date().toISOString(),
    };

    db.reports = [report, ...db.reports].slice(0, 2000);
    await persist();

    void notify.newReport(report);
    res.status(201).json(report);
  }),
);

/* ------------------------------------------------------------------ */
/* Admin paneli                                                        */
/* ------------------------------------------------------------------ */

/**
 * Adminga ko'rinadigan to'liq manzara.
 *
 * Oddiy `/state` dan farqi: bu yerda hech narsa yashirilmaydi — bloklangan
 * hisoblar, yashirilgan e'lonlar, hamma arizalar va shikoyatlar ko'rinadi.
 * Aynan shuning uchun marshrut `requireAdmin` bilan qattiq yopilgan.
 */
api.get(
  '/admin/overview',
  readLimit,
  asyncRoute(async (req, res) => {
    requireAdmin(req);

    const accounts = db.accounts.map((account) => {
      let profile: { name: string; avatar: string } | null = null;
      try {
        const found = profileOf(account);
        profile = {
          name: found.name,
          avatar: 'logo' in found ? found.logo : found.avatar,
        };
      } catch {
        profile = null;
      }

      return {
        id: account.id,
        phone: account.phone,
        role: account.role,
        profileId: account.profileId,
        profileName: profile?.name ?? '(profil topilmadi)',
        profileAvatar: profile?.avatar ?? '',
        createdAt: account.createdAt,
        telegramId: account.telegramId ?? null,
        telegramUsername: account.telegramUsername ?? null,
        status: account.status ?? 'active',
        statusReason: account.statusReason ?? null,
        statusAt: account.statusAt ?? null,
        isAdmin: isAdminAccount(account),
        campaignsCount: db.campaigns.filter((c) => c.brandId === account.profileId).length,
        bidsCount: db.bids.filter((b) => b.bloggerId === account.profileId).length,
      };
    });

    const campaigns = db.campaigns.map((campaign) => ({
      ...campaign,
      moderationState: moderationState(campaign),
      reportsCount: db.reports.filter((r) => r.campaignId === campaign.id && !r.resolvedAt).length,
      ownerStatus: db.accounts.find((a) => a.profileId === campaign.brandId)?.status ?? 'active',
    }));

    res.json({
      stats: {
        accounts: db.accounts.length,
        frozen: db.accounts.filter((a) => (a.status ?? 'active') === 'frozen').length,
        deleted: db.accounts.filter((a) => a.status === 'deleted').length,
        brands: db.brands.length,
        bloggers: db.bloggers.length,
        campaigns: db.campaigns.length,
        hiddenCampaigns: db.campaigns.filter((c) => moderationState(c) !== 'ok').length,
        bids: db.bids.length,
        messages: db.messages.length,
        openReports: db.reports.filter((r) => !r.resolvedAt).length,
        verified: db.bloggers.filter((b) => b.isVerified).length,
        verificationPending: db.verificationRequests.filter((r) => r.status === 'pending').length,
        follows: db.follows.length,
        openTickets: db.tickets.filter((t) => t.status === 'open').length,
        liveClients: connectedClients(),
      },
      accounts,
      campaigns,
      reports: db.reports,
      verificationRequests: db.verificationRequests,
      // Ptichkali blogerlar — panelda ptichkani olib qo'yish uchun kerak.
      verifiedBloggers: db.bloggers
        .filter((b) => b.isVerified)
        .map((b) => ({
          id: b.id,
          name: b.name,
          username: b.username,
          avatar: b.avatar,
          verifiedAt: b.verifiedAt ?? null,
          themeColor: b.themeColor ?? null,
        })),
      log: db.adminLog,
    });
  }),
);

/** Adminning o'ziga xabar: panel ko'rsatilsinmi. */
api.get(
  '/admin/me',
  readLimit,
  asyncRoute(async (req, res) => {
    const account = requireAccount(req);
    res.json({ isAdmin: isAdminAccount(account) });
  }),
);

const ACCOUNT_ACTIONS = ['freeze', 'unfreeze', 'delete', 'restore'] as const;

/**
 * Hisob holatini o'zgartirish.
 *
 * Hech qanday ma'lumot o'chirilmaydi — faqat belgilanadi, shuning uchun
 * «qayta tiklash» har doim ishlaydi. Muzlatilgan hisobning sessiyalari
 * bekor qilinadi, aks holda ochiq turgan brauzer ishlayveradi.
 */
api.patch(
  '/admin/accounts/:id',
  writeLimit,
  asyncRoute(async (req, res) => {
    const admin = requireAdmin(req);
    const target = db.accounts.find((a) => a.id === req.params.id);
    if (!target) throw new HttpError(404, 'Bunday hisob topilmadi');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const action = oneOf(body.action, ACCOUNT_ACTIONS, 'freeze');
    const reason = str(body.reason, 'Sabab', { max: 500 });

    if (target.id === admin.id && action !== 'unfreeze' && action !== 'restore') {
      throw new HttpError(400, "O'z hisobingizni bloklay olmaysiz");
    }
    if (isAdminAccount(target) && target.id !== admin.id && (action === 'freeze' || action === 'delete')) {
      throw new HttpError(403, 'Boshqa administrator hisobini bloklab bo‘lmaydi');
    }

    const nextStatus =
      action === 'freeze' ? 'frozen' : action === 'delete' ? 'deleted' : 'active';

    target.status = nextStatus;
    target.statusReason = nextStatus === 'active' ? undefined : reason || undefined;
    target.statusAt = new Date().toISOString();
    target.statusBy = admin.id;
    db.accounts = db.accounts.map((a) => (a.id === target.id ? target : a));

    // Bloklangan hisob ochiq turgan brauzerda ishlayvermasligi uchun.
    if (nextStatus !== 'active') revokeAllSessions(target.id);

    let label = target.phone;
    try {
      label = `${profileOf(target).name} (${target.phone})`;
    } catch {
      // profil topilmasa telefon yetarli
    }

    const entry = logAction({
      admin,
      action:
        action === 'freeze'
          ? 'Hisob muzlatildi'
          : action === 'delete'
            ? "Hisob o'chirildi"
            : action === 'unfreeze'
              ? 'Muzlatish bekor qilindi'
              : 'Hisob qayta tiklandi',
      targetType: 'account',
      targetId: target.id,
      targetLabel: label,
      reason: reason || undefined,
    });

    await persist();

    // Egasi o'zgarishdan xabardor bo'lsin.
    void notify.accountStatusChanged(target, nextStatus, reason);

    // Hisob bloklansa e'lonlari bozordan yo'qoladi (yoki qaytadi) —
    // hamma ochiq turgan sahifa buni darhol ko'rishi kerak.
    for (const campaign of db.campaigns.filter((c) => c.brandId === target.profileId)) {
      broadcast(
        nextStatus === 'active'
          ? { type: 'campaign:new', campaign }
          : { type: 'campaign:deleted', campaignId: campaign.id },
      );
    }

    res.json({ ok: true, status: nextStatus, log: entry });
  }),
);

const CAMPAIGN_ACTIONS = ['hide', 'show', 'delete', 'restore'] as const;

/**
 * E'lonni yashirish / o'chirish / qaytarish.
 *
 * Yolg'on e'lon topilganda `hide` yoki `delete` qilinadi. Ikkalasi ham
 * qaytariladigan: yozuv bazada qoladi, faqat belgisi o'zgaradi.
 */
api.patch(
  '/admin/campaigns/:id',
  writeLimit,
  asyncRoute(async (req, res) => {
    const admin = requireAdmin(req);
    const campaign = db.campaigns.find((c) => c.id === req.params.id);
    if (!campaign) throw new HttpError(404, "Bunday e'lon topilmadi");

    const body = (req.body ?? {}) as Record<string, unknown>;
    const action = oneOf(body.action, CAMPAIGN_ACTIONS, 'hide');
    const reason = str(body.reason, 'Sabab', { max: 500 });

    const nextState = action === 'hide' ? 'hidden' : action === 'delete' ? 'deleted' : 'ok';

    campaign.moderation = {
      state: nextState,
      reason: nextState === 'ok' ? undefined : reason || undefined,
      at: new Date().toISOString(),
      by: admin.id,
    };
    db.campaigns = db.campaigns.map((c) => (c.id === campaign.id ? campaign : c));

    const entry = logAction({
      admin,
      action:
        action === 'hide'
          ? "E'lon yashirildi"
          : action === 'delete'
            ? "E'lon o'chirildi"
            : "E'lon qaytarildi",
      targetType: 'campaign',
      targetId: campaign.id,
      targetLabel: `${campaign.title} — ${campaign.brandName}`,
      reason: reason || undefined,
    });

    await persist();

    void notify.campaignModerated(campaign, nextState, reason);

    broadcast(
      nextState === 'ok'
        ? { type: 'campaign:new', campaign }
        : { type: 'campaign:deleted', campaignId: campaign.id },
    );

    res.json({ ok: true, state: nextState, log: entry });
  }),
);

/** Shikoyatni yopish: e'lon o'chirildi yoki shikoyat asossiz topildi. */
api.patch(
  '/admin/reports/:id',
  writeLimit,
  asyncRoute(async (req, res) => {
    const admin = requireAdmin(req);
    const report = db.reports.find((r) => r.id === req.params.id);
    if (!report) throw new HttpError(404, 'Bunday shikoyat topilmadi');

    const outcome = oneOf((req.body ?? {}).outcome, ['removed', 'rejected'] as const, 'rejected');

    report.resolvedAt = new Date().toISOString();
    report.resolvedBy = admin.id;
    report.outcome = outcome;
    db.reports = db.reports.map((r) => (r.id === report.id ? report : r));

    logAction({
      admin,
      action: outcome === 'removed' ? 'Shikoyat tasdiqlandi' : 'Shikoyat asossiz topildi',
      targetType: 'report',
      targetId: report.id,
      targetLabel: report.campaignTitle,
    });

    await persist();
    res.json({ ok: true });
  }),
);

/**
 * Foydalanuvchining parolini tiklash.
 *
 * Yangi vaqtinchalik parol qaytariladi va barcha sessiyalar bekor qilinadi.
 * Admin uni foydalanuvchiga yetkazadi; hisob Telegramga ulangan bo'lsa
 * parol botga ham yuboriladi.
 */
api.post(
  '/admin/accounts/:id/reset-password',
  writeLimit,
  asyncRoute(async (req, res) => {
    const admin = requireAdmin(req);
    const target = db.accounts.find((a) => a.id === req.params.id);
    if (!target) throw new HttpError(404, 'Bunday hisob topilmadi');

    const temporary = generateTempPassword();
    target.passwordHash = await hashPassword(temporary);
    db.accounts = db.accounts.map((a) => (a.id === target.id ? target : a));
    revokeAllSessions(target.id);

    logAction({
      admin,
      action: 'Parol tiklandi',
      targetType: 'account',
      targetId: target.id,
      targetLabel: target.phone,
    });

    await persist();
    void notify.passwordReset(target, temporary);

    res.json({ ok: true, password: temporary });
  }),
);

/* ------------------------------------------------------------------ */
/* Obunalar — bloger blogerga                                          */
/* ------------------------------------------------------------------ */

/**
 * Obuna bo'lish yoki bekor qilish. Bir so'rov ikkalasini ham bajaradi:
 * bosilganda holat teskarisiga o'tadi, shunda mijozda alohida hisob
 * yuritish shart emas.
 */
api.post(
  '/follows',
  writeLimit,
  asyncRoute(async (req, res) => {
    const account = requireRole(req, 'blogger');
    const targetId = str((req.body ?? {}).targetId, 'Bloger', { max: 120, required: true });

    if (targetId === account.profileId) throw new HttpError(400, "O'zingizga obuna bo'la olmaysiz");

    const target = db.bloggers.find((b) => b.id === targetId);
    if (!target) throw new HttpError(404, 'Bunday bloger topilmadi');

    const existing = db.follows.find(
      (f) => f.followerId === account.profileId && f.targetId === targetId,
    );

    if (existing) {
      db.follows = db.follows.filter((f) => f.id !== existing.id);
    } else {
      db.follows = [
        { id: makeId('fol'), followerId: account.profileId, targetId, createdAt: new Date().toISOString() },
        ...db.follows,
      ];
    }

    await persist();

    // Ikkala profilning sanagichi o'zgardi — hammaga yangi holat yuboriladi.
    for (const id of [targetId, account.profileId]) {
      const blogger = db.bloggers.find((b) => b.id === id);
      if (blogger) broadcast({ type: 'blogger:updated', blogger: { ...blogger, stats: statsFor(id) } });
    }

    if (!existing) {
      const me = db.bloggers.find((b) => b.id === account.profileId);
      if (me) void notify.newFollower(target, me);
    }

    res.json({ following: !existing, followers: statsFor(targetId).followers });
  }),
);

/* ------------------------------------------------------------------ */
/* Ptichka (rasmiy tasdiq belgisi)                                     */
/* ------------------------------------------------------------------ */

/**
 * Bloger ptichka so'raydi. To'lov kod ichida emas — admin uni tashqarida
 * olib, panelda tasdiqlaydi. Shuning uchun bu shunchaki so'rov yozuvi.
 */
api.post(
  '/verification/request',
  writeLimit,
  asyncRoute(async (req, res) => {
    const account = requireRole(req, 'blogger');
    const blogger = db.bloggers.find((b) => b.id === account.profileId);
    if (!blogger) throw new HttpError(404, 'Profil topilmadi');

    if (blogger.isVerified) throw new HttpError(409, 'Sizda ptichka allaqachon bor');

    const pending = db.verificationRequests.find(
      (r) => r.bloggerId === blogger.id && r.status === 'pending',
    );
    if (pending) throw new HttpError(409, "So'rovingiz ko'rib chiqilmoqda, biroz kuting");

    const request: VerificationRequest = {
      id: makeId('ver'),
      bloggerId: blogger.id,
      bloggerName: blogger.name,
      bloggerUsername: blogger.username,
      phone: blogger.phone,
      contactTelegram: blogger.contactTelegram,
      note: str((req.body ?? {}).note, 'Izoh', { max: 500 }) || undefined,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    db.verificationRequests = [request, ...db.verificationRequests].slice(0, 2000);
    await persist();

    void notify.newVerificationRequest(request);
    res.status(201).json(request);
  }),
);

/** Blogerning o'z so'rovi qay holatda — tugmani to'g'ri ko'rsatish uchun. */
api.get(
  '/verification/mine',
  readLimit,
  asyncRoute(async (req, res) => {
    const account = requireAccount(req);
    const latest = db.verificationRequests.find((r) => r.bloggerId === account.profileId);
    res.json({ request: latest ?? null, price: process.env.VERIFICATION_PRICE ?? null });
  }),
);

/**
 * Profil rangini o'zgartirish — faqat ptichkali blogerga.
 *
 * Rang profilning bir qismi, shuning uchun uni hamma ko'radi.
 */
api.patch(
  '/verification/color',
  writeLimit,
  asyncRoute(async (req, res) => {
    const account = requireRole(req, 'blogger');
    const blogger = db.bloggers.find((b) => b.id === account.profileId);
    if (!blogger) throw new HttpError(404, 'Profil topilmadi');

    if (!blogger.isVerified) {
      throw new HttpError(403, 'Rangni faqat ptichkali blogerlar o‘zgartira oladi');
    }

    const raw = (req.body ?? {}).color;
    // Bo'sh qiymat — rangdan voz kechish.
    const color = raw === null || raw === '' ? null : normalizeThemeColor(raw);
    if (raw !== null && raw !== '' && color === null) {
      throw new HttpError(400, 'Rang #RRGGBB ko‘rinishida va yetarlicha to‘q bo‘lishi kerak');
    }

    blogger.themeColor = color ?? undefined;
    db.bloggers = db.bloggers.map((b) => (b.id === blogger.id ? blogger : b));
    await persist();

    broadcast({ type: 'blogger:updated', blogger: { ...blogger, stats: statsFor(blogger.id) } });
    res.json({ ok: true, themeColor: blogger.themeColor ?? null });
  }),
);

/* ---------- Admin: ptichka boshqaruvi ---------- */

/** So'rovni tasdiqlash yoki rad etish. */
api.patch(
  '/admin/verification/requests/:id',
  writeLimit,
  asyncRoute(async (req, res) => {
    const admin = requireAdmin(req);
    const request = db.verificationRequests.find((r) => r.id === req.params.id);
    if (!request) throw new HttpError(404, "Bunday so'rov topilmadi");

    const body = (req.body ?? {}) as Record<string, unknown>;
    const decision = oneOf(body.decision, ['approved', 'rejected'] as const, 'rejected');
    const note = str(body.note, 'Izoh', { max: 500 });

    request.status = decision;
    request.decidedAt = new Date().toISOString();
    request.decidedBy = admin.id;
    request.decisionNote = note || undefined;
    db.verificationRequests = db.verificationRequests.map((r) => (r.id === request.id ? request : r));

    const blogger = db.bloggers.find((b) => b.id === request.bloggerId);
    if (decision === 'approved' && blogger) {
      blogger.isVerified = true;
      blogger.verifiedAt = new Date().toISOString();
      blogger.verifiedBy = admin.id;
      db.bloggers = db.bloggers.map((b) => (b.id === blogger.id ? blogger : b));
    }

    logAction({
      admin,
      action: decision === 'approved' ? 'Ptichka berildi' : "Ptichka so'rovi rad etildi",
      targetType: 'account',
      targetId: request.bloggerId,
      targetLabel: `${request.bloggerName} (@${request.bloggerUsername})`,
      reason: note || undefined,
    });

    await persist();

    if (blogger) broadcast({ type: 'blogger:updated', blogger: { ...blogger, stats: statsFor(blogger.id) } });
    void notify.verificationDecision(request, decision, note);

    res.json({ ok: true, status: decision });
  }),
);

/**
 * Ptichkani to'g'ridan-to'g'ri berish yoki olib qo'yish — so'rovsiz ham.
 * Olib qo'yilganda tanlangan rang ham bekor qilinadi, chunki rang
 * ptichkaning bir qismi.
 */
api.patch(
  '/admin/verification/:bloggerId',
  writeLimit,
  asyncRoute(async (req, res) => {
    const admin = requireAdmin(req);
    const blogger = db.bloggers.find((b) => b.id === req.params.bloggerId);
    if (!blogger) throw new HttpError(404, 'Bunday bloger topilmadi');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const action = oneOf(body.action, ['grant', 'revoke'] as const, 'grant');
    const reason = str(body.reason, 'Sabab', { max: 500 });

    if (action === 'grant') {
      blogger.isVerified = true;
      blogger.verifiedAt = new Date().toISOString();
      blogger.verifiedBy = admin.id;
    } else {
      blogger.isVerified = false;
      blogger.verifiedAt = undefined;
      blogger.verifiedBy = undefined;
      blogger.themeColor = undefined;
    }
    db.bloggers = db.bloggers.map((b) => (b.id === blogger.id ? blogger : b));

    logAction({
      admin,
      action: action === 'grant' ? 'Ptichka berildi' : 'Ptichka olib qo‘yildi',
      targetType: 'account',
      targetId: blogger.id,
      targetLabel: `${blogger.name} (@${blogger.username})`,
      reason: reason || undefined,
    });

    await persist();

    broadcast({ type: 'blogger:updated', blogger: { ...blogger, stats: statsFor(blogger.id) } });
    void notify.verificationChanged(blogger, action === 'grant', reason);

    res.json({ ok: true, isVerified: blogger.isVerified });
  }),
);
