/**
 * Botning suhbat mantiqini Telegramga ulanmasdan sinaydi.
 *
 * `fetch` almashtiriladi: `getUpdates` soxta yangilanishlarni qaytaradi,
 * `sendMessage` esa javoblarni yig'ib boradi. Shu tariqa ro'yxatdan o'tish,
 * hisobni ulash, katalog, ariza va parolni tiklash oqimlari tekshiriladi.
 *
 * Ishga tushirish:  npx tsx scripts/bot-selftest.ts
 * (alohida `data/` katalogida ishlaydi — asosiy bazaga tegmaydi)
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Sinov o'z vaqtinchalik katalogida ishlaydi — loyihaning haqiqiy `data/`
// bazasiga tegmaydi, aks holda mavjud telefon raqamlari sinovni yiqitadi.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'instacollab-bot-test-'));
delete process.env.DATABASE_URL;
process.env.TELEGRAM_BOT_TOKEN = 'TEST:TOKEN';
process.env.ADMIN_SETUP_CODE = 'TESTCODE';
// HTTPS manzil — Mini App tugmalari sinovi uchun.
process.env.APP_URL = 'https://sinov.example.com';
// Lekin sinovda yangilanishlar getUpdates orqali beriladi, shuning uchun
// webhook emas, long polling rejimini majburlaymiz.
process.env.BOT_MODE = 'polling';
process.env.SAVE_DEBOUNCE_MS = '0';

interface Sent {
  method: string;
  chatId?: number;
  text?: string;
  payload: Record<string, unknown>;
}

const sent: Sent[] = [];
/** `sent` tozalansa ham yo'qolmaydigan to'liq tarix. */
const allCalls: Sent[] = [];
const queue: unknown[] = [];
let updateId = 1;

const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (!url.includes('api.telegram.org')) return realFetch(input as never, init);

  const method = url.split('/').pop() ?? '';
  const payload = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

  const reply = (result: unknown) =>
    new Response(JSON.stringify({ ok: true, result }), {
      headers: { 'Content-Type': 'application/json' },
    });

  switch (method) {
    case 'getMe':
      return reply({ username: 'bleggerbot_test' });
    case 'getUpdates': {
      const batch = queue.splice(0, queue.length);
      // Bo'sh bo'lsa biroz kutamiz — cheksiz aylanib CPU yemasin.
      if (batch.length === 0) await new Promise((r) => setTimeout(r, 20));
      return reply(batch);
    }
    case 'sendMessage':
    case 'editMessageText': {
      const item = {
        method,
        chatId: payload.chat_id as number,
        text: payload.text as string,
        payload,
      };
      sent.push(item);
      allCalls.push(item);
      return reply({ message_id: sent.length });
    }
    default: {
      const item = { method, payload };
      sent.push(item);
      allCalls.push(item);
      return reply(true);
    }
  }
}) as typeof fetch;

/* ------------------------------------------------------------------ */

const CHAT = 555001;
const USER = { id: CHAT, first_name: 'Sinov', username: 'sinov_user' };

function pushMessage(text: string, chatId = CHAT, from = USER): void {
  queue.push({ update_id: updateId++, message: { message_id: updateId, from, chat: { id: chatId }, text } });
}

function pushContact(phone: string, chatId = CHAT, from = USER): void {
  queue.push({
    update_id: updateId++,
    message: {
      message_id: updateId,
      from,
      chat: { id: chatId },
      contact: { phone_number: phone, first_name: from.first_name, user_id: from.id },
    },
  });
}

function pushCallback(data: string, chatId = CHAT, from = USER): void {
  queue.push({
    update_id: updateId++,
    callback_query: {
      id: String(updateId),
      from,
      data,
      message: { message_id: 1, chat: { id: chatId }, from },
    },
  });
}

/** Navbat bo'shashini va javoblar kelishini kutadi. */
async function settle(ms = 400): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function lastText(chatId = CHAT): string {
  const items = sent.filter((item) => item.chatId === chatId && item.text);
  return items.length ? (items[items.length - 1].text ?? '') : '';
}

function allText(chatId = CHAT): string {
  return sent
    .filter((item) => item.chatId === chatId && item.text)
    .map((item) => item.text)
    .join('\n---\n');
}

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? `\n      ${detail.slice(0, 300)}` : ''}`);
  }
}

/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const { startBot, stopBot, notify } = await import('../src/server/bot');
  const { db, initDatabase } = await import('../src/server/db');
  const { createAccount } = await import('../src/server/auth');

  await initDatabase();
  await startBot();
  await settle(200);

  console.log('\n1. Yangi foydalanuvchi /start bosadi');
  pushMessage('/start');
  await settle();
  check('mehmon menyusi ko‘rsatildi', lastText().includes('xush kelibsiz'), lastText());
  check(
    'ro‘yxatdan o‘tish tugmasi bor',
    JSON.stringify(sent[sent.length - 1].payload).includes('reg:start'),
  );

  console.log('\n2. Bloger sifatida ro‘yxatdan o‘tish');
  pushCallback('reg:start');
  await settle();
  check('rol so‘raldi', lastText().includes('Kim sifatida'), lastText());

  pushCallback('reg:role:blogger');
  await settle();
  check('ism so‘raldi', lastText().includes('Ism va familiya'), lastText());

  pushMessage('Sinov Blogeri');
  await settle();
  check('username so‘raldi', lastText().includes('username'), lastText());

  pushMessage('@sinov_blog');
  await settle();
  check('yo‘nalish so‘raldi', lastText().includes('nalishingizni'), lastText());

  pushCallback('reg:niche:5'); // Sport & Fitnes
  await settle();
  check('obunachilar so‘raldi', lastText().includes('Obunachilaringiz'), lastText());

  pushMessage('25000');
  await settle();
  check('telefon so‘raldi', lastText().includes('Telefon raqamingizni tasdiqlang'), lastText());

  pushContact('+998 99 111-22-33');
  await settle(600);
  const created = db.accounts.find((a) => a.phone === '+998991112233');
  check('hisob yaratildi', Boolean(created));
  check('roli bloger', created?.role === 'blogger');
  check('telegram ulandi', created?.telegramId === CHAT);
  check('parol yuborildi', lastText().includes('Parol:'), lastText());

  const bloggerProfile = db.bloggers.find((b) => b.id === created?.profileId);
  check('profil nomi to‘g‘ri', bloggerProfile?.name === 'Sinov Blogeri');
  check('username to‘g‘ri', bloggerProfile?.username === 'sinov_blog');
  check('obunachilar to‘g‘ri', bloggerProfile?.followersCount === 25000);
  check('yo‘nalish to‘g‘ri', bloggerProfile?.niche === 'Sport & Fitnes');

  console.log('\n3. Katalog va sahifalash');
  sent.length = 0;
  pushMessage("📢 Reklama e'lonlari");
  await settle();
  check('e‘lonlar katalogi chiqdi', lastText().includes("Reklama e'lonlari"), lastText());
  check(
    'har bir e‘lon uchun «Batafsil» tugmasi bor',
    JSON.stringify(sent.map((i) => i.payload)).includes('view:'),
  );

  console.log('\n4. E‘lon tafsiloti va bog‘lanish kanallari');
  const campaign = db.campaigns[db.campaigns.length - 1];
  sent.length = 0;
  pushCallback(`view:${campaign.id}`);
  await settle();
  {
    const detail = JSON.stringify(sent.map((i) => i.payload));
    check('to‘liq tafsilot ko‘rsatildi', allText().includes(campaign.title), allText().slice(0, 200));
    check('Telegram tugmasi bor', detail.includes('t.me/'), detail.slice(0, 300));
    check('Instagram tugmasi bor', detail.includes('instagram.com/'));
    check('Telefon tugmasi bor', detail.includes('phone:'));
    check('ariza tugmasi bor', detail.includes('apply:'));
    check('panelda ochish tugmasi bor', detail.includes('web_app'));
  }

  console.log('\n4b. Telefon raqamini ko‘rish');
  sent.length = 0;
  pushCallback(`phone:${campaign.id}`);
  await settle();
  check('raqam yuborildi', allText().includes(campaign.phone), allText().slice(0, 200));

  console.log('\n4c. Botdan ariza yuborish');
  sent.length = 0;
  pushCallback(`apply:${campaign.id}`);
  await settle();
  check('taklif matni so‘raldi', lastText().includes('taklif matnini'), lastText());

  pushMessage('Assalomu alaykum, ushbu reklamani sifatli tayyorlab beraman.');
  await settle(600);
  const bid = db.bids.find((b) => b.campaignId === campaign.id && b.bloggerId === created?.profileId);
  check('ariza yaratildi', Boolean(bid));
  check('ariza matni saqlandi', Boolean(bid?.message.includes('sifatli tayyorlab')));
  check('tasdiq xabari', lastText().includes('Ariza yuborildi'), lastText());

  console.log('\n5. Takroriy ariza rad etiladi');
  sent.length = 0;
  pushCallback(`apply:${campaign.id}`);
  await settle();
  pushMessage('Yana bir marta yuboraman, iltimos.');
  await settle(500);
  check('takroriy ariza to‘xtatildi', allText().includes('allaqachon ariza qoldirgansiz'), allText());

  console.log('\n6. Support admin tayinlash');
  const ADMIN = 555002;
  const adminUser = { id: ADMIN, first_name: 'Support', username: 'support_user' };
  sent.length = 0;
  pushMessage('/admin NOTOGRI', ADMIN, adminUser);
  await settle();
  check('noto‘g‘ri kod rad etildi', lastText(ADMIN).includes("Kod noto‘g‘ri"), lastText(ADMIN));

  pushMessage('/admin TESTCODE', ADMIN, adminUser);
  await settle();
  check('admin tayinlandi', db.supportAdmins.includes(ADMIN));
  check('support menyusi', lastText(ADMIN).includes('support admin'), lastText(ADMIN));

  console.log('\n7. Parolni unutgan — Telegramga ulangan foydalanuvchi darhol oladi');
  const oldHash = created?.passwordHash;
  sent.length = 0;
  pushCallback('help:password');
  await settle();
  check('telefon so‘raldi', lastText().includes('tasdiqlang'), lastText());

  pushContact('+998 99 111-22-33');
  await settle(600);
  check('yangi parol berildi', allText().includes('Yangi parol tayyor'), allText());
  check('parol xeshi o‘zgardi', db.accounts.find((a) => a.id === created?.id)?.passwordHash !== oldHash);

  console.log('\n8. Ulanmagan raqam — support murojaati ochiladi');
  const OTHER = 555003;
  const otherUser = { id: OTHER, first_name: 'Boshqa', username: 'boshqa' };
  // Telegramga ulanmagan reklama beruvchi hisobi — support oqimini sinash uchun.
  const offline = await createAccount({
    role: 'advertiser',
    phone: '+998977654321',
    password: 'sinovparol1',
    profile: { name: 'Ulanmagan Brend', category: 'Texnologiya & IT' },
  });
  const demoPhone = offline.phone;
  sent.length = 0;
  pushCallback('help:password', OTHER, otherUser);
  await settle();
  pushContact(demoPhone, OTHER, otherUser);
  await settle(600);

  const ticket = db.tickets.find((t) => t.phone === demoPhone && t.status === 'open');
  check('murojaat yaratildi', Boolean(ticket));
  check('foydalanuvchiga javob berildi', lastText(OTHER).includes('support xizmatiga yuborildi'), lastText(OTHER));
  check('admin xabardor qilindi', allText(ADMIN).includes('Parolni tiklash'), allText(ADMIN));

  console.log('\n9. Support parolni tiklaydi');
  sent.length = 0;
  pushCallback(`tkt:approve:${ticket?.id}`, ADMIN, adminUser);
  await settle(700);
  check('murojaat yopildi', db.tickets.find((t) => t.id === ticket?.id)?.status === 'resolved');
  check('adminga parol ko‘rsatildi', allText(ADMIN).includes('IC-'), allText(ADMIN));

  console.log('\n10. Begona odam murojaatni yopa olmaydi');
  const before = db.tickets.length;
  sent.length = 0;
  pushCallback('tkt:approve:tkt_yoq', CHAT);
  await settle();
  check('ruxsatsiz amal to‘xtatildi', db.tickets.length === before);

  console.log('\n11. Saytdagi amal → Telegram bildirishnomasi');
  sent.length = 0;
  if (bid) await notify.bidStatusChanged({ ...bid, status: 'accepted' });
  await settle(200);
  check('blogerga xabar keldi', lastText().includes('tasdiqlandi'), lastText());

  console.log('\n11b. Reklama joylash tugmasi (reklama beruvchi)');
  {
    const ADV = 555004;
    const advUser = { id: ADV, first_name: 'Brend', username: 'brend_user' };
    const advAccount = db.accounts.find((a) => a.role === 'advertiser');
    if (advAccount) {
      advAccount.telegramId = ADV;
      db.accounts = db.accounts.map((a) => (a.id === advAccount.id ? advAccount : a));
    }
    sent.length = 0;
    pushMessage('/start', ADV, advUser);
    await settle();
    const menu = JSON.stringify(sent.map((i) => i.payload));
    check('«Reklama joylash» tugmasi bor', menu.includes('Reklama joylash'), menu.slice(0, 400));
    check('tugma e‘lon formasini ochadi', menu.includes('action%3Dnew-campaign') || menu.includes('action=new-campaign'));
  }

  console.log('\n12. Telegram Mini App tugmalari');
  sent.length = 0;
  pushMessage('/start');
  await settle();
  const menuPayload = JSON.stringify(sent.map((item) => item.payload));
  check('panel web_app tugmasi bor', menuPayload.includes('"web_app"'), menuPayload.slice(0, 400));
  check('panel manzili to‘g‘ri', menuPayload.includes('https://sinov.example.com'));
  const menuButtonCall = allCalls.find((item) => item.method === 'setChatMenuButton');
  check('chat menyu tugmasi Mini App‘ga bog‘landi', JSON.stringify(menuButtonCall?.payload ?? {}).includes('web_app'));

  console.log('\n13. initData imzosini tekshirish');
  {
    const { verifyInitData } = await import('../src/server/miniapp');
    const crypto = await import('crypto');
    const token = 'TEST:TOKEN';
    const user = JSON.stringify({ id: CHAT, first_name: 'Sinov', username: 'sinov_user' });
    const authDate = Math.floor(Date.now() / 1000);
    const dataCheck = `auth_date=${authDate}\nuser=${user}`;
    const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const hash = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
    const initData = `auth_date=${authDate}&user=${encodeURIComponent(user)}&hash=${hash}`;

    const ok = verifyInitData(initData, token);
    check('to‘g‘ri imzo qabul qilindi', ok?.id === CHAT);
    const tamperedHash = (hash[0] === 'a' ? 'b' : 'a') + hash.slice(1);
    const tampered = `auth_date=${authDate}&user=${encodeURIComponent(user)}&hash=${tamperedHash}`;
    check('buzilgan imzo rad etildi', verifyInitData(tampered, token) === null);
    check(
      "o'zgartirilgan ma'lumot rad etildi",
      verifyInitData(
        `auth_date=${authDate}&user=${encodeURIComponent(user.replace('Sinov', 'Buzgan'))}&hash=${hash}`,
        token,
      ) === null,
    );
    check('boshqa token bilan rad etildi', verifyInitData(initData, 'BOSHQA:TOKEN') === null);

    const oldDate = authDate - 90000;
    const oldCheck = `auth_date=${oldDate}\nuser=${user}`;
    const oldHash = crypto.createHmac('sha256', secret).update(oldCheck).digest('hex');
    check(
      'eskirgan initData rad etildi',
      verifyInitData(`auth_date=${oldDate}&user=${encodeURIComponent(user)}&hash=${oldHash}`, token) === null,
    );
  }

  console.log('\n14. Support statistikasi');
  sent.length = 0;
  pushMessage('📊 Statistika', ADMIN, adminUser);
  await settle();
  check('statistika chiqdi', lastText(ADMIN).includes('Platforma statistikasi'), lastText(ADMIN));

  stopBot();
  await settle(100);

  console.log(`\n${'='.repeat(46)}`);
  console.log(`  Muvaffaqiyatli: ${passed}   Xato: ${failed}`);
  console.log('='.repeat(46));
  process.exit(failed === 0 ? 0 : 1);
}

void main();
