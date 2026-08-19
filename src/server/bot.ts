/**
 * Telegram bot — platformaning ikkinchi kirish nuqtasi.
 *
 * Uchta foydalanuvchi turi:
 *   • Reklama beruvchi — o'z e'lonlari va ularga kelgan arizalar;
 *   • Bloger — reklama e'lonlari katalogi, ariza yuborish, o'z arizalari;
 *   • Support (yordam xizmati) — parolni tiklash murojaatlari va statistika.
 *
 * Muhim: botda parol hech qachon so'ralmaydi. Telefon raqami Telegramning
 * «kontaktni ulashish» tugmasi orqali tasdiqlanadi — bu SMS tasdiqlash bilan
 * bir xil kuchga ega va parol chat tarixida qolib ketmaydi.
 */

import crypto from 'crypto';

import type {
  Account,
  BloggerProfile,
  BotSession,
  BrandProfile,
  Campaign,
  ChatMessage,
  ProposalBid,
  SupportTicket,
  UserRole,
} from '../types';
import { NICHES } from '../types';
import {
  accountByPhone,
  accountByProfileId,
  accountByTelegramId,
  db,
  isSupportAdmin,
  makeId,
  persist,
  profileOf,
} from './db';
import { createAccount, generateTempPassword, hashPassword, revokeAllSessions } from './auth';
import { normalizePhone, prettyPhone, str } from './validate';

/* ------------------------------------------------------------------ */
/* Telegram API (kutubxonasiz, oddiy fetch orqali)                     */
/* ------------------------------------------------------------------ */

interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TgContact {
  phone_number: string;
  first_name: string;
  user_id?: number;
}

interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number };
  text?: string;
  contact?: TgContact;
}

interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
}

interface ReplyButton {
  text: string;
  request_contact?: boolean;
  web_app?: { url: string };
}

type Keyboard =
  | { inline_keyboard: InlineButton[][] }
  | {
      keyboard: ReplyButton[][];
      resize_keyboard?: boolean;
      one_time_keyboard?: boolean;
    }
  | { remove_keyboard: true };

/**
 * Telegram Mini App faqat HTTPS manzilni qabul qiladi. Localhost'da ishlaganda
 * panel tugmasi o'rniga oddiy havola beriladi — shunda dev rejimi ham buzilmaydi.
 */
function canOpenMiniApp(): boolean {
  return APP_URL.startsWith('https://');
}

/**
 * Panelni ochadigan tugma. HTTPS bo'lsa Mini App sifatida Telegram ichida ochiladi,
 * aks holda oddiy havola beriladi.
 *
 * `screen` berilsa, panel darhol kerakli ekranda ochiladi — masalan e'lon
 * yaratish formasi yoki tanlangan e'lon.
 */
function panelUrl(screen?: string): string {
  return screen ? `${APP_URL}/?${screen}` : APP_URL;
}

function panelButton(text = '🚀 Panelni ochish', screen?: string): InlineButton {
  const url = panelUrl(screen);
  return canOpenMiniApp() ? { text, web_app: { url } } : { text, url };
}

/**
 * Muhit o'zgaruvchilari `startBot()` ichida o'qiladi: `dotenv.config()` ES-modul
 * importlaridan keyin ishlaydi, shuning uchun modul darajasida o'qish erta bo'lardi.
 */
let TOKEN = '';
let ADMIN_SETUP_CODE = '';
let APP_URL = 'http://localhost:3000';
/** Webhook manzilining maxfiy qismi — faqat Telegram biladi. */
let WEBHOOK_SECRET = '';

export const botInfo: { username: string | null; enabled: boolean } = {
  username: null,
  enabled: false,
};

async function callApi<T>(method: string, payload?: Record<string, unknown>): Promise<T | null> {
  if (!TOKEN) return null;
  try {
    const response = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
    const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
    if (!data.ok) {
      // Foydalanuvchi botni bloklagan bo'lsa — bu oddiy holat, log'ni to'ldirmaymiz.
      if (!String(data.description).includes('bot was blocked')) {
        console.error(`[bot] ${method}: ${data.description}`);
      }
      return null;
    }
    return data.result ?? null;
  } catch (error) {
    console.error(`[bot] ${method} so'rovi bajarilmadi:`, error);
    return null;
  }
}

/** HTML parse_mode uchun foydalanuvchi matnini xavfsizlantiradi. */
function esc(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function send(chatId: number, text: string, keyboard?: Keyboard): Promise<void> {
  await callApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

async function editText(chatId: number, messageId: number, text: string, keyboard?: Keyboard): Promise<void> {
  await callApi('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

async function answerCallback(id: string, text?: string): Promise<void> {
  await callApi('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) });
}

/* ------------------------------------------------------------------ */
/* Suhbat holati                                                       */
/* ------------------------------------------------------------------ */

function getSession(chatId: number): BotSession {
  let session = db.botSessions.find((item) => item.chatId === chatId);
  if (!session) {
    session = { chatId, step: 'idle', draft: {}, updatedAt: new Date().toISOString() };
    db.botSessions = [...db.botSessions, session];
  }
  return session;
}

async function setStep(chatId: number, step: string, draft?: Record<string, unknown>): Promise<void> {
  const session = getSession(chatId);
  session.step = step;
  if (draft) session.draft = draft;
  if (step === 'idle') session.draft = {};
  session.updatedAt = new Date().toISOString();
  await persist();
}

/* ------------------------------------------------------------------ */
/* Menyular                                                            */
/* ------------------------------------------------------------------ */

const BTN = {
  campaigns: "📢 Reklama e'lonlari",
  myCampaigns: "📋 Mening e'lonlarim",
  myBids: '📤 Mening arizalarim',
  incomingBids: '📥 Kelgan arizalar',
  profile: '👤 Mening profilim',
  site: '🚀 Panelni ochish',
  support: '🆘 Yordam',
  tickets: '🎫 Murojaatlar',
  stats: '📊 Statistika',
  resetPassword: '🔑 Parolni tiklash',
  createCampaign: '📣 Reklama joylash',
} as const;

function mainMenu(role: UserRole | 'support'): Keyboard {
  // Panel tugmasi — Mini App'ni to'g'ridan-to'g'ri Telegram ichida ochadi.
  const panel: ReplyButton = canOpenMiniApp()
    ? { text: BTN.site, web_app: { url: APP_URL } }
    : { text: BTN.site };

  if (role === 'support') {
    return {
      keyboard: [
        [{ text: BTN.tickets }, { text: BTN.resetPassword }],
        [{ text: BTN.stats }, panel],
      ],
      resize_keyboard: true,
    };
  }
  if (role === 'advertiser') {
    // «Reklama joylash» panelni to'g'ridan-to'g'ri e'lon yaratish formasida ochadi.
    const createBtn: ReplyButton = canOpenMiniApp()
      ? { text: BTN.createCampaign, web_app: { url: panelUrl('action=new-campaign') } }
      : { text: BTN.createCampaign };

    return {
      keyboard: [
        [createBtn],
        [{ text: BTN.myCampaigns }, { text: BTN.incomingBids }],
        [{ text: BTN.profile }],
        [panel, { text: BTN.support }],
      ],
      resize_keyboard: true,
    };
  }
  return {
    keyboard: [
      [panel],
      [{ text: BTN.campaigns }, { text: BTN.myBids }],
      [{ text: BTN.profile }, { text: BTN.support }],
    ],
    resize_keyboard: true,
  };
}

function guestMenuKeyboard(): Keyboard {
  return {
    inline_keyboard: [
      [{ text: "🆕 Ro'yxatdan o'tish", callback_data: 'reg:start' }],
      [{ text: '🔗 Mavjud hisobni ulash', callback_data: 'link:start' }],
      [{ text: '🆘 Yordam / parolni tiklash', callback_data: 'help:start' }],
    ],
  };
}

const contactKeyboard: Keyboard = {
  keyboard: [[{ text: '📱 Telefon raqamimni yuborish', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

/* ------------------------------------------------------------------ */
/* Matn shakllantirish                                                 */
/* ------------------------------------------------------------------ */

function formatFollowers(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

function formatUzs(amount?: number): string {
  return amount ? `${amount.toLocaleString('ru-RU')} so'm` : '—';
}

function bloggerCard(blogger: BloggerProfile, showContacts: boolean): string {
  const lines = [
    `<b>${esc(blogger.name)}</b> — @${esc(blogger.username)}`,
    `${esc(blogger.niche)} · ${esc(blogger.city)} · ${esc(blogger.tier)}`,
    `👥 ${formatFollowers(blogger.followersCount)} obunachi · 👁 Story ${formatFollowers(blogger.avgStoryViews)} · 🎬 Reels ${formatFollowers(blogger.avgReelsViews)} · ⚡️ ${blogger.engagementRate}%`,
  ];
  if (blogger.pricing?.story || blogger.pricing?.reels) {
    lines.push(`💰 Story: ${formatUzs(blogger.pricing.story)} · Reels: ${formatUzs(blogger.pricing.reels)}`);
  }
  if (showContacts) {
    const contacts = [blogger.contactTelegram, blogger.phone].filter(Boolean).map((c) => esc(c));
    if (contacts.length) lines.push(`📞 ${contacts.join(' · ')}`);
  }
  return lines.join('\n');
}

function campaignCard(campaign: Campaign): string {
  return [
    `<b>${esc(campaign.title)}</b>`,
    `🏢 ${esc(campaign.brandName)} · ${esc(campaign.niche)}`,
    `🎬 ${esc(campaign.format)} · ⏱ ${campaign.deadlineDays} kun · 👥 min ${formatFollowers(campaign.requiredFollowersMin)}`,
    `${esc(campaign.description).slice(0, 300)}`,
    `📞 ${esc(campaign.contactTelegram)} · ${esc(campaign.phone)}`,
    `📨 ${campaign.bidsCount} ta ariza`,
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Kataloglar (sahifalab ko'rsatish)                                   */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 4;

function pager(kind: string, page: number, total: number): Keyboard {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const row: { text: string; callback_data: string }[] = [];
  if (page > 0) row.push({ text: '◀️ Oldingi', callback_data: `page:${kind}:${page - 1}` });
  row.push({ text: `${page + 1} / ${pages}`, callback_data: 'noop' });
  if (page < pages - 1) row.push({ text: 'Keyingi ▶️', callback_data: `page:${kind}:${page + 1}` });
  return { inline_keyboard: [row] };
}

function campaignsPage(page: number): { text: string; keyboard: Keyboard } {
  const all = db.campaigns;
  const slice = all.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const text = [
    `<b>📢 Reklama e'lonlari</b> — jami ${all.length} ta`,
    '',
    ...slice.map((campaign) => `${campaignCard(campaign)}\n`),
  ].join('\n');

  // Har bir e'lon uchun «Batafsil» — u yerda to'liq ma'lumot va bog'lanish tugmalari.
  const rows: InlineButton[][] = slice.map((campaign) => [
    { text: `🔍 ${campaign.title.slice(0, 32)}`, callback_data: `view:${campaign.id}` },
  ]);

  const nav = (pager('campaigns', page, all.length) as { inline_keyboard: InlineButton[][] }).inline_keyboard[0];
  rows.push(nav);

  return { text: text || 'Hozircha e‘lon yo‘q.', keyboard: { inline_keyboard: rows } };
}

/** Telegram/Instagram username'ini to'g'ri havolaga aylantiradi. */
function telegramLink(handle?: string): string | null {
  const clean = (handle ?? '').trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^@/, '');
  return /^[A-Za-z0-9_]{4,}$/.test(clean) ? `https://t.me/${clean}` : null;
}

function instagramLink(handle?: string): string | null {
  const clean = (handle ?? '')
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '');
  return /^[A-Za-z0-9._]{2,}$/.test(clean) ? `https://instagram.com/${clean}` : null;
}

/**
 * E'lonning to'liq ko'rinishi: barcha shartlar va uchta bog'lanish kanali.
 * Bloger «Batafsil» tugmasini bosganda shu chiqadi.
 */
function campaignDetail(campaign: Campaign): { text: string; keyboard: Keyboard } {
  const lines = [
    `<b>${esc(campaign.title)}</b>`,
    '',
    `🏢 <b>${esc(campaign.brandName)}</b> · ${esc(campaign.niche)}`,
    `🎬 Format: <b>${esc(campaign.format)}</b>`,
    `⏱ Muddat: <b>${campaign.deadlineDays} kun</b>`,
    `👥 Minimal obunachi: <b>${formatFollowers(campaign.requiredFollowersMin)}</b>`,
    campaign.targetAudience ? `🎯 Auditoriya: ${esc(campaign.targetAudience)}` : '',
    '',
    esc(campaign.description),
  ];

  if (campaign.talkingPoints.length) {
    lines.push('', '<b>📋 Talablar:</b>');
    for (const point of campaign.talkingPoints) lines.push(`  • ${esc(point)}`);
  }

  const dos = campaign.dosAndDonts?.dos ?? [];
  const donts = campaign.dosAndDonts?.donts ?? [];
  if (dos.length) {
    lines.push('', '<b>✅ Qilish kerak:</b>');
    for (const item of dos) lines.push(`  • ${esc(item)}`);
  }
  if (donts.length) {
    lines.push('', '<b>❌ Qilmaslik kerak:</b>');
    for (const item of donts) lines.push(`  • ${esc(item)}`);
  }

  if (campaign.hashtags.length) lines.push('', campaign.hashtags.map((t) => esc(t)).join(' '));

  lines.push(
    '',
    '<b>📞 Bog‘lanish — o‘zingizga qulayini tanlang:</b>',
    campaign.phone ? `  ☎️ <code>${esc(campaign.phone)}</code> (bosib nusxalang)` : '',
    `  📨 ${campaign.bidsCount} ta ariza kelgan`,
  );

  // Har bir kanal alohida tugma: bosilganda darhol o'sha ilova ochiladi.
  const contactRow: InlineButton[] = [];
  const tg = telegramLink(campaign.contactTelegram);
  const ig = instagramLink(campaign.contactInstagram);
  if (tg) contactRow.push({ text: '✈️ Telegram', url: tg });
  if (ig) contactRow.push({ text: '📷 Instagram', url: ig });
  if (campaign.phone) contactRow.push({ text: '☎️ Telefon', callback_data: `phone:${campaign.id}` });

  const rows: InlineButton[][] = [];
  if (contactRow.length) rows.push(contactRow);
  rows.push([
    { text: '📤 Ariza yuborish', callback_data: `apply:${campaign.id}` },
    panelButton('🌐 Panelda ochish', `campaign=${campaign.id}`),
  ]);
  rows.push([{ text: '◀️ Ro‘yxatga qaytish', callback_data: 'page:campaigns:0' }]);

  return { text: lines.filter((line) => line !== '').join('\n'), keyboard: { inline_keyboard: rows } };
}

/* ------------------------------------------------------------------ */
/* Kim ekanini aniqlash                                                */
/* ------------------------------------------------------------------ */

interface Viewer {
  account: Account | null;
  isSupport: boolean;
}

function viewerOf(telegramId: number): Viewer {
  return { account: accountByTelegramId(telegramId) ?? null, isSupport: isSupportAdmin(telegramId) };
}

async function showMainMenu(chatId: number, viewer: Viewer): Promise<void> {
  if (viewer.isSupport) {
    await send(
      chatId,
      [
        '<b>🆘 Support paneli</b>',
        '',
        `🎫 Ochiq murojaatlar: <b>${db.tickets.filter((t) => t.status === 'open').length}</b>`,
        `👤 Hisoblar: <b>${db.accounts.length}</b>`,
        '',
        'Quyidagi tugmalardan foydalaning.',
      ].join('\n'),
      mainMenu('support'),
    );
    return;
  }

  if (!viewer.account) {
    await send(
      chatId,
      [
        '<b>👋 InstaCollab UZ botiga xush kelibsiz!</b>',
        '',
        'Bu — Instagram blogerlari va reklama beruvchilarni bog‘lovchi platforma.',
        '',
        '• <b>Reklama beruvchi</b> — e‘lon joylaysiz, blogerlardan ariza olasiz;',
        '• <b>Bloger</b> — e‘lonlarni ko‘rib, ariza yuborasiz.',
        '',
        'Boshlash uchun tanlang:',
      ].join('\n'),
      guestMenuKeyboard(),
    );
    return;
  }

  const profile = profileOf(viewer.account);
  await send(
    chatId,
    [
      `<b>Assalomu alaykum, ${esc(profile.name)}!</b>`,
      viewer.account.role === 'advertiser' ? '🏢 Reklama beruvchi hisobi' : '📸 Bloger hisobi',
      '',
      'Kerakli bo‘limni tanlang:',
    ].join('\n'),
    mainMenu(viewer.account.role),
  );
}

/* ------------------------------------------------------------------ */
/* Ro'yxatdan o'tish va hisobni ulash                                  */
/* ------------------------------------------------------------------ */

const roleKeyboard: Keyboard = {
  inline_keyboard: [
    [{ text: '🏢 Reklama beruvchiman', callback_data: 'reg:role:advertiser' }],
    [{ text: '📸 Blogerman', callback_data: 'reg:role:blogger' }],
  ],
};

function nicheKeyboard(prefix: string): Keyboard {
  const rows: { text: string; callback_data: string }[][] = [];
  NICHES.forEach((niche, index) => {
    const row = Math.floor(index / 2);
    rows[row] ??= [];
    rows[row].push({ text: niche, callback_data: `${prefix}:${index}` });
  });
  return { inline_keyboard: rows };
}

async function askPhone(chatId: number, step: string, draft: Record<string, unknown>): Promise<void> {
  await setStep(chatId, step, draft);
  await send(
    chatId,
    [
      '📱 <b>Telefon raqamingizni tasdiqlang</b>',
      '',
      'Pastdagi tugmani bosing — Telegram raqamingizni o‘zi yuboradi.',
      'Bu raqam sizning login’ingiz bo‘ladi.',
      '',
      '<i>Parol botda so‘ralmaydi — u chat tarixida qolib ketmasligi uchun.</i>',
    ].join('\n'),
    contactKeyboard,
  );
}

/** Ro'yxatdan o'tish yakuni: hisob yaratiladi va parol bir marta yuboriladi. */
async function finishRegistration(
  chatId: number,
  from: TgUser,
  phone: string,
  draft: Record<string, unknown>,
): Promise<void> {
  const role = (draft.role === 'blogger' ? 'blogger' : 'advertiser') as UserRole;
  const password = generateTempPassword();

  try {
    const account = await createAccount({
      role,
      phone,
      password,
      telegramId: from.id,
      telegramUsername: from.username,
      profile:
        role === 'advertiser'
          ? {
              name: draft.name,
              category: draft.niche,
              contactTelegram: from.username ? `@${from.username}` : undefined,
            }
          : {
              name: draft.name,
              username: draft.username,
              niche: draft.niche,
              followersCount: draft.followersCount,
              contactTelegram: from.username ? `@${from.username}` : undefined,
            },
    });

    await setStep(chatId, 'idle');
    await send(
      chatId,
      [
        '✅ <b>Hisobingiz yaratildi!</b>',
        '',
        `Login: <code>${esc(prettyPhone(phone))}</code>`,
        `Parol: <code>${esc(password)}</code>`,
        '',
        '⚠️ <b>Bu parolni saqlab qo‘ying va saytga kirgach o‘zgartiring.</b>',
        'Xavfsizlik uchun ushbu xabarni keyinroq o‘chirib tashlashingiz mumkin.',
        '',
        'Panelga kirish uchun pastdagi tugmani bosing — parol so‘ralmaydi.',
      ].join('\n'),
      mainMenu(account.role),
    );
  } catch (error) {
    await setStep(chatId, 'idle');
    const message = error instanceof Error ? error.message : "Hisob yaratib bo'lmadi.";
    await send(chatId, `❌ ${esc(message)}`, guestMenuKeyboard());
  }
}

/* ------------------------------------------------------------------ */
/* Support: murojaatlar va parolni tiklash                             */
/* ------------------------------------------------------------------ */

async function notifySupportAdmins(text: string, keyboard?: Keyboard): Promise<void> {
  for (const adminId of db.supportAdmins) {
    await send(adminId, text, keyboard);
  }
}

/** Parolni tiklaydi, barcha sessiyalarni bekor qiladi va yangi parolni qaytaradi. */
async function resetPasswordFor(account: Account): Promise<string> {
  const password = generateTempPassword();
  account.passwordHash = await hashPassword(password);
  revokeAllSessions(account.id);
  db.accounts = db.accounts.map((item) => (item.id === account.id ? account : item));
  await persist();
  return password;
}

async function createTicket(
  from: TgUser,
  chatId: number,
  kind: SupportTicket['kind'],
  phone?: string,
  text?: string,
): Promise<SupportTicket> {
  const ticket: SupportTicket = {
    id: makeId('tkt'),
    kind,
    phone,
    telegramId: from.id,
    telegramName: [from.first_name, from.last_name].filter(Boolean).join(' '),
    text,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  db.tickets = [ticket, ...db.tickets];
  await persist();

  if (db.supportAdmins.length === 0) {
    await send(
      chatId,
      '⚠️ Hozircha support admini tayinlanmagan. Murojaatingiz saqlandi, admin tayinlangach ko‘rib chiqiladi.',
    );
    return ticket;
  }

  const header =
    kind === 'password_reset'
      ? '🔑 <b>Parolni tiklash so‘rovi</b>'
      : '💬 <b>Yangi savol</b>';
  await notifySupportAdmins(
    [
      header,
      `👤 ${esc(ticket.telegramName)}${from.username ? ` (@${esc(from.username)})` : ''}`,
      phone ? `📱 ${esc(prettyPhone(phone))}` : '',
      text ? `\n${esc(text)}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    kind === 'password_reset'
      ? {
          inline_keyboard: [
            [
              { text: '✅ Parolni tiklash', callback_data: `tkt:approve:${ticket.id}` },
              { text: '❌ Rad etish', callback_data: `tkt:reject:${ticket.id}` },
            ],
          ],
        }
      : undefined,
  );

  return ticket;
}

/* ------------------------------------------------------------------ */
/* Xabarlarni qayta ishlash                                            */
/* ------------------------------------------------------------------ */

async function handleContact(message: TgMessage): Promise<void> {
  const from = message.from;
  const contact = message.contact;
  if (!from || !contact) return;

  const chatId = message.chat.id;
  const session = getSession(chatId);

  // Kontakt aynan shu foydalanuvchiniki ekanini tekshiramiz.
  if (contact.user_id !== from.id) {
    await send(chatId, '❌ Iltimos, <b>o‘zingizning</b> raqamingizni yuboring (tugma orqali).', contactKeyboard);
    return;
  }

  const phone = normalizePhone(contact.phone_number);
  if (!phone) {
    await send(chatId, '❌ Raqamni o‘qib bo‘lmadi. O‘zbekiston raqami bo‘lishi kerak.', contactKeyboard);
    return;
  }

  if (session.step === 'link:phone') {
    const account = accountByPhone(phone);
    if (!account) {
      await setStep(chatId, 'idle');
      await send(
        chatId,
        [
          `❌ <b>${esc(prettyPhone(phone))}</b> raqami bilan hisob topilmadi.`,
          '',
          'Yangi hisob ochishingiz mumkin:',
        ].join('\n'),
        guestMenuKeyboard(),
      );
      return;
    }

    account.telegramId = from.id;
    account.telegramUsername = from.username;
    db.accounts = db.accounts.map((item) => (item.id === account.id ? account : item));
    await persist();
    await setStep(chatId, 'idle');

    await send(chatId, '✅ Hisobingiz Telegramga ulandi.', { remove_keyboard: true });
    await showMainMenu(chatId, viewerOf(from.id));
    return;
  }

  if (session.step === 'reg:phone') {
    await finishRegistration(chatId, from, phone, session.draft);
    return;
  }

  if (session.step === 'help:phone') {
    const account = accountByPhone(phone);
    await setStep(chatId, 'idle');

    if (!account) {
      await send(chatId, `❌ <b>${esc(prettyPhone(phone))}</b> bilan hisob topilmadi.`, guestMenuKeyboard());
      return;
    }

    // Raqam Telegram orqali tasdiqlangan va hisob shu Telegramga ulangan bo'lsa —
    // support kutmasdan darhol yangi parol beramiz.
    if (account.telegramId === from.id) {
      const password = await resetPasswordFor(account);
      await send(
        chatId,
        [
          '🔑 <b>Yangi parol tayyor</b>',
          '',
          `Login: <code>${esc(prettyPhone(account.phone))}</code>`,
          `Parol: <code>${esc(password)}</code>`,
          '',
          '⚠️ Saytga kirgach parolni o‘zgartiring. Eski sessiyalar bekor qilindi.',
        ].join('\n'),
        { remove_keyboard: true },
      );
      await showMainMenu(chatId, viewerOf(from.id));
      return;
    }

    await createTicket(from, chatId, 'password_reset', phone);
    await send(
      chatId,
      [
        '📨 <b>Murojaatingiz support xizmatiga yuborildi.</b>',
        '',
        'Tasdiqlangach, yangi parol shu yerga yuboriladi.',
      ].join('\n'),
      { remove_keyboard: true },
    );
    return;
  }

  await send(chatId, 'Rahmat! Hozircha raqam kerak emas.', { remove_keyboard: true });
}

async function handleStep(message: TgMessage, viewer: Viewer): Promise<boolean> {
  const chatId = message.chat.id;
  const from = message.from;
  const text = (message.text ?? '').trim();
  const session = getSession(chatId);

  switch (session.step) {
    case 'reg:name': {
      if (text.length < 2) {
        await send(chatId, '❌ Kamida 2 ta belgi kiriting.');
        return true;
      }
      const draft: Record<string, unknown> = { ...session.draft, name: text };
      if (session.draft.role === 'blogger') {
        await setStep(chatId, 'reg:username', draft);
        await send(chatId, '📸 Instagram <b>username</b>ingizni yuboring (masalan: @shahzod_vlog):');
      } else {
        await setStep(chatId, 'reg:niche', draft);
        await send(chatId, '🏷 Faoliyat <b>yo‘nalishingizni</b> tanlang:', nicheKeyboard('reg:niche'));
      }
      return true;
    }

    case 'reg:username': {
      const username = text.replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, '');
      if (username.length < 2) {
        await send(chatId, '❌ Username noto‘g‘ri. Masalan: @shahzod_vlog');
        return true;
      }
      const draft: Record<string, unknown> = { ...session.draft, username };
      await setStep(chatId, 'reg:niche', draft);
      await send(chatId, '🏷 <b>Yo‘nalishingizni</b> tanlang:', nicheKeyboard('reg:niche'));
      return true;
    }

    case 'reg:followers': {
      const followers = Number(text.replace(/\D/g, ''));
      if (!Number.isFinite(followers) || followers <= 0) {
        await send(chatId, '❌ Faqat raqam kiriting. Masalan: 15000');
        return true;
      }
      const draft: Record<string, unknown> = { ...session.draft, followersCount: followers };
      await askPhone(chatId, 'reg:phone', draft);
      return true;
    }

    case 'apply:message': {
      if (!viewer.account || viewer.account.role !== 'blogger') {
        await setStep(chatId, 'idle');
        return true;
      }
      if (text.length < 10) {
        await send(chatId, '❌ Taklif matni kamida 10 ta belgidan iborat bo‘lsin.');
        return true;
      }

      const campaign = db.campaigns.find((c) => c.id === session.draft.campaignId);
      if (!campaign) {
        await setStep(chatId, 'idle');
        await send(chatId, '❌ E‘lon topilmadi yoki o‘chirilgan.', mainMenu('blogger'));
        return true;
      }

      const blogger = profileOf(viewer.account) as BloggerProfile;
      if (db.bids.some((b) => b.campaignId === campaign.id && b.bloggerId === blogger.id)) {
        await setStep(chatId, 'idle');
        await send(chatId, '⚠️ Siz bu e‘longa allaqachon ariza qoldirgansiz.', mainMenu('blogger'));
        return true;
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
        bloggerTelegram: blogger.contactTelegram,
        bloggerPhone: blogger.phone,
        message: str(text, 'Taklif matni', { max: 1500, required: true }),
        creativeIdea: 'Botda yuborilgan ariza',
        status: 'pending',
        submittedAt: new Date().toISOString(),
        belowRequirement: blogger.followersCount < campaign.requiredFollowersMin,
      };

      db.bids = [bid, ...db.bids];
      db.campaigns = db.campaigns.map((c) =>
        c.id === campaign.id ? { ...c, bidsCount: c.bidsCount + 1 } : c,
      );
      await persist();
      await setStep(chatId, 'idle');

      await send(
        chatId,
        [
          '✅ <b>Ariza yuborildi!</b>',
          `E‘lon: ${esc(campaign.title)}`,
          bid.belowRequirement
            ? '\n⚠️ Obunachilar soni e‘lon talabidan past — brend rad etishi mumkin.'
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
        mainMenu('blogger'),
      );
      void notify.newBid(bid, campaign);
      return true;
    }

    case 'help:question': {
      if (!from) return true;
      await setStep(chatId, 'idle');
      await createTicket(from, chatId, 'question', undefined, text.slice(0, 1000));
      await send(chatId, '📨 Savolingiz support xizmatiga yuborildi.', { remove_keyboard: true });
      await showMainMenu(chatId, viewer);
      return true;
    }

    case 'admin:reset': {
      if (!viewer.isSupport) {
        await setStep(chatId, 'idle');
        return true;
      }
      const phone = normalizePhone(text);
      await setStep(chatId, 'idle');

      if (!phone) {
        await send(chatId, '❌ Raqam noto‘g‘ri. Masalan: +998901234567', mainMenu('support'));
        return true;
      }
      const account = accountByPhone(phone);
      if (!account) {
        await send(chatId, `❌ ${esc(prettyPhone(phone))} bilan hisob topilmadi.`, mainMenu('support'));
        return true;
      }

      const password = await resetPasswordFor(account);
      await send(
        chatId,
        [
          '✅ <b>Parol tiklandi</b>',
          `👤 ${esc(profileOf(account).name)}`,
          `📱 ${esc(prettyPhone(account.phone))}`,
          `🔑 <code>${esc(password)}</code>`,
          '',
          account.telegramId
            ? 'Yangi parol foydalanuvchining Telegramiga ham yuborildi.'
            : '⚠️ Foydalanuvchi Telegramga ulanmagan — parolni o‘zingiz yetkazing.',
        ].join('\n'),
        mainMenu('support'),
      );

      if (account.telegramId) {
        await send(
          account.telegramId,
          [
            '🔑 <b>Parolingiz support tomonidan tiklandi</b>',
            '',
            `Login: <code>${esc(prettyPhone(account.phone))}</code>`,
            `Parol: <code>${esc(password)}</code>`,
            '',
            '⚠️ Saytga kirgach parolni o‘zgartiring.',
          ].join('\n'),
        );
      }
      return true;
    }

    default:
      return false;
  }
}

async function handleMessage(message: TgMessage): Promise<void> {
  const from = message.from;
  if (!from) return;

  const chatId = message.chat.id;
  const text = (message.text ?? '').trim();
  const viewer = viewerOf(from.id);

  if (message.contact) {
    await handleContact(message);
    return;
  }

  /* ---- Buyruqlar ---- */

  if (text === '/start') {
    await setStep(chatId, 'idle');
    await showMainMenu(chatId, viewer);
    return;
  }

  if (text.startsWith('/admin')) {
    const code = text.slice('/admin'.length).trim();
    if (!ADMIN_SETUP_CODE) {
      await send(chatId, '❌ Support admin kodi sozlanmagan (.env → ADMIN_SETUP_CODE).');
      return;
    }
    if (code !== ADMIN_SETUP_CODE) {
      await send(chatId, '❌ Kod noto‘g‘ri.');
      return;
    }
    if (!db.supportAdmins.includes(from.id)) {
      db.supportAdmins = [...db.supportAdmins, from.id];
      await persist();
    }
    await send(chatId, '✅ Siz support admin sifatida tayinlandingiz.', mainMenu('support'));
    return;
  }

  if (text === '/help') {
    await send(
      chatId,
      [
        '<b>Yordam</b>',
        '',
        '/start — bosh menyu',
        '/help — shu ma‘lumot',
        '',
        'Parolni unutgan bo‘lsangiz «🆘 Yordam» tugmasini bosing.',
      ].join('\n'),
    );
    return;
  }

  /* ---- Ko'p bosqichli suhbat ---- */

  if (await handleStep(message, viewer)) return;

  /* ---- Menyu tugmalari ---- */

  switch (text) {
    case BTN.campaigns: {
      const { text: body, keyboard } = campaignsPage(0);
      await send(chatId, body, keyboard);
      return;
    }

    case BTN.myCampaigns: {
      if (viewer.account?.role !== 'advertiser') break;
      const mine = db.campaigns.filter((c) => c.brandId === viewer.account?.profileId);
      await send(
        chatId,
        mine.length
          ? [`<b>📋 Sizning e‘lonlaringiz (${mine.length})</b>`, '', ...mine.map((c) => `${campaignCard(c)}\n`)].join('\n')
          : 'Siz hali e‘lon joylamadingiz. Saytda «Reklama berish» tugmasi orqali joylashingiz mumkin.',
        mainMenu('advertiser'),
      );
      return;
    }

    case BTN.incomingBids: {
      if (viewer.account?.role !== 'advertiser') break;
      const myCampaignIds = new Set(
        db.campaigns.filter((c) => c.brandId === viewer.account?.profileId).map((c) => c.id),
      );
      const bids = db.bids.filter((b) => myCampaignIds.has(b.campaignId));
      if (!bids.length) {
        await send(chatId, 'Hozircha ariza kelmadi.', mainMenu('advertiser'));
        return;
      }
      for (const bid of bids.slice(0, 8)) {
        await send(
          chatId,
          [
            `<b>${esc(bid.bloggerName)}</b> — @${esc(bid.bloggerUsername)}`,
            `👥 ${formatFollowers(bid.bloggerFollowers)} · ${esc(bid.bloggerNiche)}`,
            bid.belowRequirement ? '⚠️ Obunachilar talabdan past' : '',
            `📢 ${esc(bid.campaignTitle)}`,
            `💬 ${esc(bid.message).slice(0, 400)}`,
            `📞 ${esc(bid.bloggerTelegram)} · ${esc(bid.bloggerPhone)}`,
            `Holat: <b>${bid.status === 'accepted' ? 'Kelishildi' : bid.status === 'rejected' ? 'Rad etilgan' : 'Ko‘rib chiqilmoqda'}</b>`,
          ]
            .filter(Boolean)
            .join('\n'),
          bid.status === 'pending'
            ? {
                inline_keyboard: [
                  [
                    { text: '✅ Tasdiqlash', callback_data: `bid:accept:${bid.id}` },
                    { text: '❌ Rad etish', callback_data: `bid:reject:${bid.id}` },
                  ],
                ],
              }
            : undefined,
        );
      }
      return;
    }

    case BTN.myBids: {
      if (viewer.account?.role !== 'blogger') break;
      const bids = db.bids.filter((b) => b.bloggerId === viewer.account?.profileId);
      await send(
        chatId,
        bids.length
          ? [
              `<b>📤 Sizning arizalaringiz (${bids.length})</b>`,
              '',
              ...bids.map((b) =>
                [
                  `<b>${esc(b.campaignTitle)}</b>`,
                  `🏢 ${esc(b.brandName)}`,
                  `Holat: ${b.status === 'accepted' ? '✅ Kelishildi' : b.status === 'rejected' ? '❌ Rad etildi' : '⏳ Ko‘rib chiqilmoqda'}\n`,
                ].join('\n'),
              ),
            ].join('\n')
          : 'Siz hali ariza yubormadingiz. «📢 Reklama e‘lonlari» bo‘limiga o‘ting.',
        mainMenu('blogger'),
      );
      return;
    }

    case BTN.profile: {
      if (!viewer.account) break;
      const profile = profileOf(viewer.account);
      const body =
        viewer.account.role === 'advertiser'
          ? [
              `<b>🏢 ${esc(profile.name)}</b>`,
              `${esc((profile as BrandProfile).category)}`,
              `📱 ${esc(prettyPhone(viewer.account.phone))}`,
              `📢 E‘lonlar: ${(profile as BrandProfile).totalCampaignsCreated ?? 0} ta`,
            ].join('\n')
          : bloggerCard(profile as BloggerProfile, true);
      await send(
        chatId,
        [body, '', `Tahrirlash: ${APP_URL}`].join('\n'),
        mainMenu(viewer.account.role),
      );
      return;
    }

    case BTN.createCampaign: {
      if (viewer.account?.role !== 'advertiser') break;
      await send(
        chatId,
        [
          '📣 <b>Yangi reklama e‘loni</b>',
          '',
          'Panel ochiladi va u yerda: sarlavha, mahsulot haqida ma‘lumot, format,',
          'minimal obunachilar soni va bog‘lanish kontaktlaringizni to‘ldirasiz.',
          '',
          'E‘lon joylangach, mos blogerlarga darhol xabar boradi.',
        ].join('\n'),
        { inline_keyboard: [[panelButton('📣 E‘lon berish formasini ochish', 'action=new-campaign')]] },
      );
      return;
    }

    case BTN.site: {
      // Mini App yoqilgan bo'lsa bu tugma Telegramning o'zida ochiladi va bu yergacha yetib kelmaydi.
      await send(
        chatId,
        canOpenMiniApp()
          ? 'Panelni ochish uchun pastdagi «🚀 Panelni ochish» tugmasini bosing.'
          : `🌐 <a href="${APP_URL}">InstaCollab panelini ochish</a>`,
        { inline_keyboard: [[panelButton()]] },
      );
      return;
    }

    case BTN.support: {
      await send(
        chatId,
        '<b>🆘 Yordam</b>\n\nNima bo‘yicha yordam kerak?',
        {
          inline_keyboard: [
            [{ text: '🔑 Parolimni unutdim', callback_data: 'help:password' }],
            [{ text: '💬 Savol berish', callback_data: 'help:question' }],
          ],
        },
      );
      return;
    }

    case BTN.tickets: {
      if (!viewer.isSupport) break;
      const open = db.tickets.filter((t) => t.status === 'open');
      if (!open.length) {
        await send(chatId, '✅ Ochiq murojaatlar yo‘q.', mainMenu('support'));
        return;
      }
      for (const ticket of open.slice(0, 10)) {
        await send(
          chatId,
          [
            ticket.kind === 'password_reset' ? '🔑 <b>Parolni tiklash</b>' : '💬 <b>Savol</b>',
            `👤 ${esc(ticket.telegramName)}`,
            ticket.phone ? `📱 ${esc(prettyPhone(ticket.phone))}` : '',
            ticket.text ? `\n${esc(ticket.text)}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          ticket.kind === 'password_reset'
            ? {
                inline_keyboard: [
                  [
                    { text: '✅ Tiklash', callback_data: `tkt:approve:${ticket.id}` },
                    { text: '❌ Rad etish', callback_data: `tkt:reject:${ticket.id}` },
                  ],
                ],
              }
            : { inline_keyboard: [[{ text: '✅ Yopish', callback_data: `tkt:reject:${ticket.id}` }]] },
        );
      }
      return;
    }

    case BTN.resetPassword: {
      if (!viewer.isSupport) break;
      await setStep(chatId, 'admin:reset');
      await send(chatId, '📱 Parolini tiklash kerak bo‘lgan <b>telefon raqamni</b> yuboring:');
      return;
    }

    case BTN.stats: {
      if (!viewer.isSupport) break;
      await send(
        chatId,
        [
          '<b>📊 Platforma statistikasi</b>',
          '',
          `👤 Hisoblar: <b>${db.accounts.length}</b>`,
          `   • reklama beruvchi: ${db.accounts.filter((a) => a.role === 'advertiser').length}`,
          `   • bloger: ${db.accounts.filter((a) => a.role === 'blogger').length}`,
          `🔗 Telegramga ulangan: <b>${db.accounts.filter((a) => a.telegramId).length}</b>`,
          `📢 E‘lonlar: <b>${db.campaigns.length}</b>`,
          `📨 Arizalar: <b>${db.bids.length}</b>`,
          `💬 Xabarlar: <b>${db.messages.length}</b>`,
          `🎫 Ochiq murojaatlar: <b>${db.tickets.filter((t) => t.status === 'open').length}</b>`,
        ].join('\n'),
        mainMenu('support'),
      );
      return;
    }

    default:
      break;
  }

  await showMainMenu(chatId, viewer);
}

/* ------------------------------------------------------------------ */
/* Inline tugmalar                                                     */
/* ------------------------------------------------------------------ */

async function handleCallback(query: TgCallbackQuery): Promise<void> {
  const from = query.from;
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const data = query.data ?? '';
  if (!chatId) {
    await answerCallback(query.id);
    return;
  }

  const viewer = viewerOf(from.id);
  const parts = data.split(':');

  /* --- Sahifalash --- */
  if (parts[0] === 'page' && messageId) {
    const page = Number(parts[2]) || 0;
    const { text, keyboard } = campaignsPage(page);
    await editText(chatId, messageId, text, keyboard);
    await answerCallback(query.id);
    return;
  }

  /* --- Ro'yxatdan o'tish --- */
  if (data === 'reg:start') {
    await setStep(chatId, 'idle');
    await send(chatId, '<b>Kim sifatida qo‘shilasiz?</b>', roleKeyboard);
    await answerCallback(query.id);
    return;
  }

  if (parts[0] === 'reg' && parts[1] === 'role') {
    const role = parts[2] === 'blogger' ? 'blogger' : 'advertiser';
    await setStep(chatId, 'reg:name', { role });
    await send(
      chatId,
      role === 'advertiser'
        ? '🏢 <b>Brend / do‘kon nomini</b> yuboring:'
        : '📸 <b>Ism va familiyangizni</b> yuboring:',
    );
    await answerCallback(query.id);
    return;
  }

  if (parts[0] === 'reg' && parts[1] === 'niche') {
    const niche = NICHES[Number(parts[2])] ?? NICHES[0];
    const session = getSession(chatId);
    const draft: Record<string, unknown> = { ...session.draft, niche };

    if (session.draft.role === 'blogger') {
      await setStep(chatId, 'reg:followers', draft);
      await send(chatId, '👥 <b>Obunachilaringiz sonini</b> yuboring (masalan: 15000):');
    } else {
      await askPhone(chatId, 'reg:phone', draft);
    }
    await answerCallback(query.id);
    return;
  }

  /* --- Hisobni ulash --- */
  if (data === 'link:start') {
    await askPhone(chatId, 'link:phone', {});
    await answerCallback(query.id);
    return;
  }

  /* --- Yordam --- */
  if (data === 'help:start') {
    await send(chatId, '<b>🆘 Yordam</b>\n\nNima bo‘yicha yordam kerak?', {
      inline_keyboard: [
        [{ text: '🔑 Parolimni unutdim', callback_data: 'help:password' }],
        [{ text: '💬 Savol berish', callback_data: 'help:question' }],
      ],
    });
    await answerCallback(query.id);
    return;
  }

  if (data === 'help:password') {
    await askPhone(chatId, 'help:phone', {});
    await answerCallback(query.id);
    return;
  }

  if (data === 'help:question') {
    await setStep(chatId, 'help:question');
    await send(chatId, '💬 Savolingizni yozib yuboring — support xizmatiga uzatamiz:');
    await answerCallback(query.id);
    return;
  }

  /* --- E'lon tafsiloti --- */
  if (parts[0] === 'view') {
    const campaign = db.campaigns.find((c) => c.id === parts[1]);
    if (!campaign) {
      await answerCallback(query.id, 'E‘lon topilmadi yoki o‘chirilgan');
      return;
    }
    const detail = campaignDetail(campaign);
    if (messageId) await editText(chatId, messageId, detail.text, detail.keyboard);
    else await send(chatId, detail.text, detail.keyboard);
    await answerCallback(query.id);
    return;
  }

  /* --- Telefon raqamini ko'rsatish --- */
  if (parts[0] === 'phone') {
    const campaign = db.campaigns.find((c) => c.id === parts[1]);
    if (!campaign?.phone) {
      await answerCallback(query.id, 'Telefon raqami ko‘rsatilmagan');
      return;
    }
    await send(
      chatId,
      [
        `☎️ <b>${esc(campaign.brandName)}</b>`,
        '',
        `<code>${esc(campaign.phone)}</code>`,
        '',
        '<i>Raqamni bosib nusxalang yoki telefon ilovangizda tering.</i>',
      ].join('\n'),
    );
    await answerCallback(query.id, 'Raqam yuborildi');
    return;
  }

  /* --- Ariza yuborish --- */
  if (parts[0] === 'apply') {
    if (viewer.account?.role !== 'blogger') {
      await answerCallback(query.id, 'Ariza faqat bloger hisobidan yuboriladi');
      return;
    }
    const campaign = db.campaigns.find((c) => c.id === parts[1]);
    if (!campaign) {
      await answerCallback(query.id, 'E‘lon topilmadi');
      return;
    }
    await setStep(chatId, 'apply:message', { campaignId: campaign.id });
    await send(
      chatId,
      [
        `📤 <b>${esc(campaign.title)}</b>`,
        '',
        'Brendga yuboriladigan <b>taklif matnini</b> yozing:',
      ].join('\n'),
    );
    await answerCallback(query.id);
    return;
  }

  /* --- Arizani tasdiqlash / rad etish --- */
  if (parts[0] === 'bid') {
    if (viewer.account?.role !== 'advertiser') {
      await answerCallback(query.id, 'Ruxsat yo‘q');
      return;
    }
    const bid = db.bids.find((b) => b.id === parts[2]);
    const campaign = bid ? db.campaigns.find((c) => c.id === bid.campaignId) : undefined;
    if (!bid || !campaign || campaign.brandId !== viewer.account.profileId) {
      await answerCallback(query.id, 'Ruxsat yo‘q yoki ariza topilmadi');
      return;
    }

    const status = parts[1] === 'accept' ? 'accepted' : 'rejected';
    const updated: ProposalBid = { ...bid, status };
    db.bids = db.bids.map((b) => (b.id === bid.id ? updated : b));
    await persist();

    if (messageId) {
      await editText(
        chatId,
        messageId,
        `${status === 'accepted' ? '✅' : '❌'} <b>${esc(bid.bloggerName)}</b> — ${
          status === 'accepted' ? 'tasdiqlandi' : 'rad etildi'
        }\n📞 ${esc(bid.bloggerTelegram)} · ${esc(bid.bloggerPhone)}`,
      );
    }
    await answerCallback(query.id, status === 'accepted' ? 'Tasdiqlandi' : 'Rad etildi');
    void notify.bidStatusChanged(updated);
    return;
  }

  /* --- Support: murojaatni yopish --- */
  if (parts[0] === 'tkt') {
    if (!viewer.isSupport) {
      await answerCallback(query.id, 'Ruxsat yo‘q');
      return;
    }
    const ticket = db.tickets.find((t) => t.id === parts[2]);
    if (!ticket || ticket.status !== 'open') {
      await answerCallback(query.id, 'Murojaat allaqachon yopilgan');
      return;
    }

    if (parts[1] === 'approve' && ticket.phone) {
      const account = accountByPhone(ticket.phone);
      if (!account) {
        await answerCallback(query.id, 'Hisob topilmadi');
        return;
      }
      const password = await resetPasswordFor(account);
      ticket.status = 'resolved';
      ticket.resolvedAt = new Date().toISOString();
      ticket.resolvedBy = from.id;
      await persist();

      await send(
        ticket.telegramId,
        [
          '🔑 <b>Parolingiz tiklandi</b>',
          '',
          `Login: <code>${esc(prettyPhone(account.phone))}</code>`,
          `Parol: <code>${esc(password)}</code>`,
          '',
          '⚠️ Saytga kirgach parolni o‘zgartiring.',
        ].join('\n'),
      );
      if (messageId) {
        await editText(chatId, messageId, `✅ Parol tiklandi va foydalanuvchiga yuborildi.\n🔑 <code>${esc(password)}</code>`);
      }
      await answerCallback(query.id, 'Parol tiklandi');
      return;
    }

    ticket.status = 'rejected';
    ticket.resolvedAt = new Date().toISOString();
    ticket.resolvedBy = from.id;
    await persist();
    if (messageId) await editText(chatId, messageId, '❌ Murojaat yopildi.');
    await answerCallback(query.id, 'Yopildi');
    return;
  }

  await answerCallback(query.id);
}

/* ------------------------------------------------------------------ */
/* Bildirishnomalar (saytdagi amallar → Telegram)                      */
/* ------------------------------------------------------------------ */

async function sendToAccount(account: Account | undefined, text: string): Promise<void> {
  if (!botInfo.enabled || !account?.telegramId) return;
  await send(account.telegramId, text);
}

export const notify = {
  async newBid(bid: ProposalBid, campaign: Campaign): Promise<void> {
    await sendToAccount(
      accountByProfileId(campaign.brandId),
      [
        '📥 <b>Yangi ariza keldi!</b>',
        '',
        `📢 ${esc(campaign.title)}`,
        `👤 ${esc(bid.bloggerName)} — @${esc(bid.bloggerUsername)}`,
        `👥 ${formatFollowers(bid.bloggerFollowers)} obunachi`,
        bid.belowRequirement ? '⚠️ Obunachilar talabdan past' : '',
        '',
        `💬 ${esc(bid.message).slice(0, 400)}`,
        `📞 ${esc(bid.bloggerTelegram)} · ${esc(bid.bloggerPhone)}`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  },

  async bidStatusChanged(bid: ProposalBid): Promise<void> {
    if (bid.status === 'pending') return;
    await sendToAccount(
      accountByProfileId(bid.bloggerId),
      [
        bid.status === 'accepted' ? '✅ <b>Arizangiz tasdiqlandi!</b>' : '❌ <b>Arizangiz rad etildi</b>',
        '',
        `📢 ${esc(bid.campaignTitle)}`,
        `🏢 ${esc(bid.brandName)}`,
        bid.status === 'accepted' ? '\nBrend siz bilan tez orada bog‘lanadi.' : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  },

  async newMessage(message: ChatMessage, recipient: Account): Promise<void> {
    await sendToAccount(
      recipient,
      [
        '💬 <b>Yangi xabar</b>',
        '',
        `👤 ${esc(message.senderName)}`,
        `${esc(message.text).slice(0, 400)}`,
        '',
        `Javob berish: ${APP_URL}`,
      ].join('\n'),
    );
  },

  /** Yangi e'lon — mos yo'nalishdagi, Telegramga ulangan blogerlarga. */
  async newCampaign(campaign: Campaign): Promise<void> {
    if (!botInfo.enabled) return;
    const targets = db.accounts.filter((account) => {
      if (account.role !== 'blogger' || !account.telegramId) return false;
      const blogger = db.bloggers.find((b) => b.id === account.profileId);
      if (!blogger) return false;
      if (blogger.followersCount < campaign.requiredFollowersMin) return false;
      return blogger.niche === campaign.niche;
    });

    for (const account of targets.slice(0, 50)) {
      await sendToAccount(
        account,
        ['🆕 <b>Sizning yo‘nalishingizda yangi e‘lon!</b>', '', campaignCard(campaign)].join('\n'),
      );
    }
  },
};

/* ------------------------------------------------------------------ */
/* Ishga tushirish: webhook yoki long polling                          */
/* ------------------------------------------------------------------ */

let offset = 0;
let running = false;

/** Bitta yangilanishni qayta ishlaydi. Webhook ham, polling ham shuni chaqiradi. */
export async function handleUpdate(update: TgUpdate): Promise<void> {
  try {
    if (update.message) await handleMessage(update.message);
    else if (update.callback_query) await handleCallback(update.callback_query);
  } catch (error) {
    console.error('[bot] update qayta ishlashda xatolik:', error);
  }
}

/** Webhook so'rovi shu maxfiy yo'l orqali keladi. */
export function webhookPath(): string | null {
  return WEBHOOK_SECRET ? `/api/telegram/${WEBHOOK_SECRET}` : null;
}

async function pollLoop(): Promise<void> {
  while (running) {
    const updates = await callApi<TgUpdate[]>('getUpdates', {
      offset,
      timeout: 30,
      allowed_updates: ['message', 'callback_query'],
    });

    if (!updates) {
      // Tarmoq xatosi yoki 409 (bot boshqa joyda ishlayapti) — biroz kutamiz.
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }

    for (const update of updates) {
      offset = Math.max(offset, update.update_id + 1);
      await handleUpdate(update);
    }
  }
}

export async function startBot(): Promise<void> {
  TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
  ADMIN_SETUP_CODE = process.env.ADMIN_SETUP_CODE ?? '';
  // Render tashqi manzilni o'zi beradi — qo'lda yozish shart emas.
  APP_URL =
    process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${process.env.PORT ?? 3000}`;
  APP_URL = APP_URL.replace(/\/+$/, '');

  // Webhook faqat HTTPS bilan ishlaydi. Mahalliy ishlashda long polling qoladi.
  if (APP_URL.startsWith('https://') && process.env.BOT_MODE !== 'polling') {
    WEBHOOK_SECRET =
      process.env.WEBHOOK_SECRET ||
      crypto.createHash('sha256').update(TOKEN).digest('hex').slice(0, 32);
  }

  if (!TOKEN) {
    console.log('[bot] TELEGRAM_BOT_TOKEN kiritilmagan — bot ishga tushmadi.');
    return;
  }

  const me = await callApi<{ username: string }>('getMe');
  if (!me) {
    console.error('[bot] Token bilan bog‘lanib bo‘lmadi — bot o‘chirilgan holda davom etamiz.');
    return;
  }

  botInfo.username = me.username;
  botInfo.enabled = true;

  await callApi('setMyCommands', {
    commands: [
      { command: 'start', description: 'Bosh menyu' },
      { command: 'help', description: 'Yordam' },
    ],
  });

  // Chatning pastki-chap burchagidagi tugma ham panelni ochsin.
  if (canOpenMiniApp()) {
    await callApi('setChatMenuButton', {
      menu_button: { type: 'web_app', text: 'Panel', web_app: { url: APP_URL } },
    });
    console.log(`[bot] Mini App yoqildi: ${APP_URL}`);
  } else {
    await callApi('setChatMenuButton', { menu_button: { type: 'commands' } });
    console.log(
      `[bot] APP_URL HTTPS emas (${APP_URL}) — Mini App o'chirilgan, panel oddiy havola sifatida beriladi.`,
    );
  }

  if (WEBHOOK_SECRET) {
    // Render kabi uxlab qoladigan hostlarda webhook kerak: Telegram so'rov
    // yuborganda xizmat o'zi uyg'onadi. Long polling esa uyquda ishlamaydi.
    const url = `${APP_URL}${webhookPath()}`;
    const set = await callApi<boolean>('setWebhook', {
      url,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
      max_connections: 20,
    });
    if (set) console.log(`[bot] webhook o'rnatildi: ${APP_URL}/api/telegram/***`);
    else console.error('[bot] webhook o\'rnatilmadi — Telegram rad etdi');
  } else {
    await callApi('deleteWebhook', { drop_pending_updates: false });
    running = true;
    void pollLoop();
    console.log('[bot] long polling rejimi');
  }

  console.log(`[bot] @${me.username} ishga tushdi.`);
  if (db.supportAdmins.length === 0 && ADMIN_SETUP_CODE) {
    console.log(`[bot] Support admin bo'lish uchun botga yozing:  /admin ${ADMIN_SETUP_CODE}`);
  }
}

export function stopBot(): void {
  running = false;
}

/** Webhook'ni o'chiradi (mahalliy ishlashga qaytishda kerak bo'ladi). */
export async function clearWebhook(): Promise<void> {
  if (TOKEN) await callApi('deleteWebhook', { drop_pending_updates: false });
}
