/**
 * Telegram bildirishnomalari **aynan kimga** ketishini tekshiradi.
 *
 * Har bir tekshiruvda ikki narsa isbotlanadi:
 *   1. xabar kerakli odamga bordi;
 *   2. **boshqa hech kimga bormadi**.
 *
 * Ikkinchisi muhimroq: xabar ketmasligi noqulaylik, begonaga ketishi esa
 * shaxsiy ma'lumot sizib chiqishi. Shuning uchun har safar barcha chatlar
 * ro'yxati solishtiriladi, faqat kutilgani emas.
 *
 * Ishga tushirish:  npx tsx scripts/notify-selftest.ts
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'instacollab-notify-test-'));
delete process.env.DATABASE_URL;
process.env.TELEGRAM_BOT_TOKEN = 'TEST:TOKEN';
process.env.REQUIRE_APPROVAL = 'false';
process.env.CAMPAIGN_PRICE = '0';
process.env.SAVE_DEBOUNCE_MS = '0';
process.env.BOT_MODE = 'polling';

interface Sent {
  chatId: number;
  text: string;
}

const sent: Sent[] = [];
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (!url.includes('api.telegram.org')) return realFetch(input as never, init);

  const method = url.split('/').pop() ?? '';
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

  if (method === 'sendMessage') {
    sent.push({ chatId: Number(body.chat_id), text: String(body.text ?? '') });
  }

  if (method === 'getMe') {
    return new Response(
      JSON.stringify({ ok: true, result: { id: 1, username: 'bleggerbot_test', first_name: 'Bot' } }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (method === 'getUpdates') {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return new Response(JSON.stringify({ ok: true, result: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, result: {} }), {
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
    if (detail !== undefined) console.log(`      ${JSON.stringify(detail)}`);
  }
}

/** Yuborilgan xabarlarni tozalab, keyingi tekshiruvga tayyorlaydi. */
function reset(): void {
  sent.length = 0;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 120));

/**
 * Xabar aynan kutilgan chatlarga (va faqat ularga) borganini tekshiradi.
 */
function expectRecipients(name: string, expected: number[]): void {
  const actual = [...new Set(sent.map((item) => item.chatId))].sort((a, b) => a - b);
  const want = [...new Set(expected)].sort((a, b) => a - b);

  const same = actual.length === want.length && actual.every((id, i) => id === want[i]);
  check(name, same, { kutilgan: want, haqiqiy: actual });
}

/* ------------------------------------------------------------------ */

// Telegram id'lari — kim kim ekanini oson ajratish uchun alohida raqamlar.
const TG_ADMIN = 900_001;
const TG_BRAND = 900_002;
const TG_BLOGGER = 900_003;
const TG_OTHER_BRAND = 900_004;
const TG_OTHER_BLOGGER = 900_005;

async function main(): Promise<void> {
  const { startBot, stopBot, notify } = await import('../src/server/bot');
  const { db, initDatabase, persist, claimTelegramId } = await import('../src/server/db');
  const { createAccount } = await import('../src/server/auth');

  await initDatabase();
  await startBot();
  await settle();

  await createAccount({
    role: 'advertiser',
    phone: '+998900000001',
    password: 'sinov_parol_1',
    telegramId: TG_ADMIN,
    profile: { name: 'Admin Brend', category: 'Sport & Fitnes' },
  });
  const brand = await createAccount({
    role: 'advertiser',
    phone: '+998900000002',
    password: 'sinov_parol_2',
    telegramId: TG_BRAND,
    profile: { name: 'Brend', category: 'Sport & Fitnes' },
  });
  const blogger = await createAccount({
    role: 'blogger',
    phone: '+998900000003',
    password: 'sinov_parol_3',
    telegramId: TG_BLOGGER,
    profile: { name: 'Bloger', username: 'bloger', niche: 'Sport & Fitnes', followersCount: 30_000 },
  });
  const otherBrand = await createAccount({
    role: 'advertiser',
    phone: '+998900000004',
    password: 'sinov_parol_4',
    telegramId: TG_OTHER_BRAND,
    profile: { name: 'Begona Brend', category: 'Moda & Stil' },
  });
  const otherBlogger = await createAccount({
    role: 'blogger',
    phone: '+998900000005',
    password: 'sinov_parol_5',
    telegramId: TG_OTHER_BLOGGER,
    profile: {
      name: 'Begona Bloger',
      username: 'begona',
      niche: 'Moda & Stil',
      followersCount: 20_000,
    },
  });

  db.supportAdmins = [TG_ADMIN];
  await persist();

  const campaign = {
    id: 'c_sinov',
    brandId: brand.profileId,
    brandName: 'Brend',
    brandLogo: '',
    title: 'Sinov e‘loni',
    description: 'Bildirishnoma sinovi',
    niche: 'Sport & Fitnes',
    format: 'Reels Integratsiya' as const,
    deadlineDays: 7,
    requiredFollowersMin: 1000,
    targetAudience: 'Barchasi',
    status: 'active' as const,
    bidsCount: 0,
    createdDate: '20-avgust',
    talkingPoints: [],
    hashtags: [],
    contactTelegram: '@brend',
    phone: '+998900000002',
  };
  db.campaigns = [campaign];

  const bid = {
    id: 'bid_sinov',
    campaignId: campaign.id,
    campaignTitle: campaign.title,
    brandName: 'Brend',
    bloggerId: blogger.profileId,
    bloggerName: 'Bloger',
    bloggerUsername: 'bloger',
    bloggerAvatar: '',
    bloggerFollowers: 30_000,
    price: 100_000,
    message: 'Qiziqdim',
    bloggerNiche: 'Sport & Fitnes',
    creativeIdea: '',
    status: 'pending' as const,
    submittedAt: new Date().toISOString(),
  };
  db.bids = [bid];
  await persist();

  console.log('\n1. Ariza — faqat e‘lon egasiga');
  reset();
  await notify.newBid(bid as never, campaign as never);
  await settle();
  expectRecipients('ariza faqat brendga bordi', [TG_BRAND]);

  console.log('\n2. Ariza holati — faqat ariza egasiga');
  reset();
  await notify.bidStatusChanged({ ...bid, status: 'accepted' } as never);
  await settle();
  expectRecipients('javob faqat blogerga bordi', [TG_BLOGGER]);

  console.log('\n3. Chat xabari — faqat qabul qiluvchiga');
  reset();
  await notify.newMessage(
    {
      id: 'm1',
      threadId: `${brand.profileId}::${blogger.profileId}`,
      senderId: brand.profileId,
      senderName: 'Brend',
      senderAvatar: '',
      senderRole: 'advertiser',
      text: 'Salom',
      createdAt: new Date().toISOString(),
    } as never,
    blogger as never,
  );
  await settle();
  expectRecipients('xabar faqat blogerga bordi', [TG_BLOGGER]);

  console.log('\n4. Yangi e‘lon — faqat mos yo‘nalishdagi blogerlarga');
  reset();
  await notify.newCampaign(campaign as never, false);
  await settle();
  expectRecipients('boshqa yo‘nalishdagi bloger olmadi', [TG_BLOGGER]);

  console.log('\n5. Admin xabarlari — faqat adminga');

  reset();
  await notify.campaignAwaitingPayment(campaign as never, 10_000);
  await settle();
  expectRecipients('to‘lov kutilmoqda — faqat adminga', [TG_ADMIN]);

  reset();
  await notify.newRegistration(otherBlogger as never);
  await settle();
  expectRecipients('yangi ro‘yxat — faqat adminga', [TG_ADMIN]);

  reset();
  await notify.newReport({
    id: 'r1',
    campaignId: campaign.id,
    campaignTitle: campaign.title,
    reporterId: blogger.profileId,
    reporterName: 'Bloger',
    reason: 'Yolg‘on ma‘lumot',
    status: 'pending',
    createdAt: new Date().toISOString(),
  } as never);
  await settle();
  expectRecipients('shikoyat — faqat adminga', [TG_ADMIN]);

  reset();
  await notify.newVerificationRequest({
    id: 'v1',
    bloggerId: blogger.profileId,
    bloggerName: 'Bloger',
    bloggerUsername: 'bloger',
    status: 'pending',
    createdAt: new Date().toISOString(),
  } as never);
  await settle();
  expectRecipients('ptichka so‘rovi — faqat adminga', [TG_ADMIN]);

  console.log('\n6. Shaxsiy qarorlar — faqat egasiga');

  reset();
  await notify.accountApproved(otherBlogger as never);
  await settle();
  expectRecipients('hisob tasdig‘i — faqat egasiga', [TG_OTHER_BLOGGER]);

  reset();
  await notify.accountStatusChanged(otherBrand as never, 'frozen', 'sinov');
  await settle();
  expectRecipients('muzlatish — faqat egasiga', [TG_OTHER_BRAND]);

  reset();
  await notify.passwordReset(otherBrand as never, 'IC-TEST1234');
  await settle();
  expectRecipients('yangi parol — faqat egasiga', [TG_OTHER_BRAND]);
  check(
    'parol boshqa hech qayerda chiqmadi',
    sent.every((item) => item.chatId === TG_OTHER_BRAND),
    sent.map((item) => item.chatId),
  );

  reset();
  await notify.campaignModerated(campaign as never, 'hidden', 'sinov');
  await settle();
  expectRecipients('e‘lon yashirildi — faqat egasiga', [TG_BRAND]);

  reset();
  await notify.campaignPaymentConfirmed(campaign as never);
  await settle();
  expectRecipients('to‘lov tasdig‘i — faqat e‘lon egasiga', [TG_BRAND]);

  reset();
  await notify.newFollower(
    { id: blogger.profileId, name: 'Bloger', username: 'bloger' } as never,
    { id: otherBlogger.profileId, name: 'Begona', username: 'begona' } as never,
  );
  await settle();
  expectRecipients('yangi obunachi — faqat obuna bo‘linganga', [TG_BLOGGER]);

  reset();
  await notify.verificationChanged(
    { id: blogger.profileId, name: 'Bloger', username: 'bloger' } as never,
    true,
  );
  await settle();
  expectRecipients('ptichka qarori — faqat blogerga', [TG_BLOGGER]);

  console.log('\n7. Telegramga ulanmagan hisob — xabar umuman ketmaydi');

  const offline = await createAccount({
    role: 'blogger',
    phone: '+998900000006',
    password: 'sinov_parol_6',
    profile: {
      name: 'Ulanmagan',
      username: 'ulanmagan',
      niche: 'Sport & Fitnes',
      followersCount: 5000,
    },
  });

  reset();
  await notify.accountApproved(offline as never);
  await settle();
  check('ulanmagan hisobga xabar yuborilmadi', sent.length === 0, sent);

  console.log('\n8. Bir Telegram — bir hisob');

  // Begona bloger o'z Telegramini brend hisobiga ham ulamoqchi bo'ldi.
  const detached = claimTelegramId(otherBrand.id, TG_OTHER_BLOGGER);
  check('eski bog‘lanish uzildi', detached === 1, detached);

  const stillLinked = db.accounts.filter((a) => a.telegramId === TG_OTHER_BLOGGER);
  check('bitta hisob qoldi', stillLinked.length === 1, stillLinked.map((a) => a.phone));
  check('aynan yangi hisob', stillLinked[0]?.id === otherBrand.id, stillLinked[0]?.phone);

  const freed = db.accounts.find((a) => a.id === otherBlogger.id);
  check('eski hisob Telegramdan uzildi', freed?.telegramId === undefined, freed?.telegramId);

  // Endi eski hisobga yuborilgan xabar hech kimga bormasligi kerak.
  reset();
  await notify.accountApproved(freed as never);
  await settle();
  check('uzilgan hisobga xabar ketmadi', sent.length === 0, sent);

  // Yangi hisobga esa boradi.
  reset();
  await notify.accountApproved(stillLinked[0] as never);
  await settle();
  expectRecipients('yangi hisobga bordi', [TG_OTHER_BLOGGER]);

  stopBot();
}

main()
  .catch((error) => {
    failed++;
    console.error('\nKutilmagan xatolik:', error);
  })
  .finally(() => {
    console.log('\n==============================================');
    console.log(`  Muvaffaqiyatli: ${passed}   Xato: ${failed}`);
    console.log('==============================================\n');
    process.exit(failed > 0 ? 1 : 0);
  });
