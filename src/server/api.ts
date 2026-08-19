import express, { type NextFunction, type Request, type Response } from 'express';

import type { BloggerProfile, BrandProfile, Campaign, ChatMessage, ProposalBid } from '../types';
import { CAMPAIGN_FORMATS, buildThreadId } from '../types';
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
} from './auth';
import { HttpError, handle, normalizePhone, num, oneOf, str, strList } from './validate';
import { notify, botInfo } from './bot';
import { verifyInitData } from './miniapp';
import { addClient, broadcast, connectedClients, startHeartbeat } from './events';
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
  }, 60_000);
  timer.unref();

  startHeartbeat();
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

api.get('/state', readLimit, (req, res) => {
  requireAccount(req);
  res.json({
    brands: db.brands,
    bloggers: db.bloggers,
    campaigns: db.campaigns,
    bids: db.bids,
    messages: db.messages,
  });
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

    broadcast({ type: 'campaign:new', campaign });
    void notify.newCampaign(campaign);
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
      { type: 'bid:new', bid, campaignId: campaign.id, bidsCount: updatedCampaign?.bidsCount ?? 0 },
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

    const status = oneOf(req.body?.status, ['pending', 'accepted', 'rejected'] as const, 'pending');
    const updated: ProposalBid = { ...bid, status };
    db.bids = db.bids.map((b) => (b.id === bid.id ? updated : b));
    await persist();

    broadcast({ type: 'bid:updated', bid: updated }, [campaign.brandId, bid.bloggerId]);
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
