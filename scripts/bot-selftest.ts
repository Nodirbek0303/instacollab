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
// Bot sinovi ro'yxatdan o'tish oqig'ini tekshiradi, admin tasdig'ini emas —
// tasdiq talabi alohida sinovda (`approval-selftest`) tekshiriladi.
process.env.REQUIRE_APPROVAL = 'false';
// E'lon to'lovi alohida sinovda (`payment-selftest`) tekshiriladi.
process.env.CAMPAIGN_PRICE = '0';
// Ommaviy yuborishda pauza kutib o'tirmaymiz.
process.env.BROADCAST_DELAY_MS = '0';
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
  photo?: string;
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
    case 'sendPhoto':
    case 'sendMessage':
    case 'editMessageText': {
      const item = {
        method,
        chatId: payload.chat_id as number,
        text: (payload.text ?? payload.caption) as string,
        photo: payload.photo as string | undefined,
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

function pushPhoto(fileId: string, caption: string, chatId = CHAT, from = USER): void {
  queue.push({
    update_id: updateId++,
    message: {
      message_id: updateId,
      from,
      chat: { id: chatId },
      photo: [{ file_id: fileId, width: 800, height: 600 }],
      caption,
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

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }

  failed += 1;
  const shown =
    detail === undefined
      ? ''
      : `\n      ${(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300)}`;
  console.log(`  ✗ ${name}${shown}`);
}

/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const { startBot, stopBot, notify } = await import('../src/server/bot');
  const { db, initDatabase } = await import('../src/server/db');
  const { createAccount } = await import('../src/server/auth');
  const { isAdminTelegramId, syncSupportAdmins } = await import('../src/server/admin');

  await initDatabase();
  await startBot();
  await settle(200);

  console.log('\n1. Yangi foydalanuvchi /start bosadi');
  pushMessage('/start');
  await settle();
  check('mehmon menyusi ko‘rsatildi', lastText().includes('xush kelibsiz'), lastText());
  {
    // Ro'yxatdan o'tish saytda bo'ladi — tugma panelni ochadi.
    const menu = JSON.stringify(sent[sent.length - 1].payload);
    check('ro‘yxatdan o‘tish tugmasi bor', menu.includes("Ro'yxatdan o'tish"), menu.slice(0, 300));
    check('tugma panelni ochadi', menu.includes('web_app') && menu.includes('action=register'), menu.slice(0, 300));
    check('hisobni ulash tugmasi qoldi', menu.includes('link:start'));
  }

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

  /*
   * Namunaviy profillar olib tashlangan — baza bo'sh boshlanadi.
   * Shuning uchun keyingi bosqichlar uchun e'lonni sinov o'zi yaratadi.
   */
  const brandAccount = await createAccount({
    role: 'advertiser',
    phone: '+998900000777',
    password: 'sinov_parol_777',
    profile: {
      name: 'Sinov Brend',
      category: 'Sport & Fitnes',
      contactTelegram: '@sinov_brend',
      phone: '+998900000777',
    },
  });

  db.campaigns = [
    {
      id: 'c_sinov_1',
      brandId: brandAccount.profileId,
      brandName: 'Sinov Brend',
      brandLogo: 'https://example.com/logo.png',
      title: 'Sinov reklama e‘loni',
      description: 'Bot sinovi uchun yaratilgan e‘lon.',
      niche: 'Sport & Fitnes',
      format: 'Reels Integratsiya',
      deadlineDays: 7,
      requiredFollowersMin: 1000,
      targetAudience: 'Barcha faol auditoriya',
      status: 'active',
      bidsCount: 0,
      createdDate: '20-avgust',
      talkingPoints: [],
      hashtags: [],
      contactTelegram: '@sinov_brend',
      contactInstagram: 'sinov_brend',
      phone: '+998900000777',
    },
  ];

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

  console.log('\n6b. ADMIN_PHONES belgilanganda kodning o‘zi yetarli emas');
  {
    // Ro'yxat berilgach, faqat o'sha raqamga ulangan hisob admin bo'la oladi.
    process.env.ADMIN_PHONES = '+998900000001';

    const OUTSIDER = 555003;
    const outsider = { id: OUTSIDER, first_name: 'Begona', username: 'begona' };
    sent.length = 0;
    pushMessage('/admin TESTCODE', OUTSIDER, outsider);
    await settle();
    check(
      'ulanmagan begona rad etildi',
      lastText(OUTSIDER).includes('hisobingizni botga ulang'),
      lastText(OUTSIDER),
    );
    check('begona ro‘yxatga qo‘shilmadi', !db.supportAdmins.includes(OUTSIDER));

    // Botga ulangan, lekin ro'yxatda yo'q hisob ham o'ta olmasligi kerak.
    const linked = db.accounts.find((account) => account.telegramId != null);
    if (linked) {
      sent.length = 0;
      pushMessage('/admin TESTCODE', linked.telegramId!, {
        id: linked.telegramId!,
        first_name: 'Ulangan',
        username: 'ulangan',
      });
      await settle();
      check(
        'ro‘yxatda yo‘q hisob rad etildi',
        lastText(linked.telegramId!).includes('oldindan belgilangan telefon'),
        lastText(linked.telegramId!),
      );
      check('u ham ro‘yxatga qo‘shilmadi', !db.supportAdmins.includes(linked.telegramId!));
    }

    // Ro'yxat kuchga kirgach, ilgari kod bilan tayinlangan admin huquqdan mahrum bo'ladi.
    check('eski admin endi huquqsiz', isAdminTelegramId(ADMIN) === false);

    const { kept } = syncSupportAdmins();
    check('tozalashdan keyin ro‘yxat bo‘shadi', kept === 0 && db.supportAdmins.length === 0);

    // Sinovning qolgan qismi eski tartibda davom etsin.
    delete process.env.ADMIN_PHONES;
    db.supportAdmins = [ADMIN];
  }

  console.log('\n6c. Ommaviy xabar — hammaga boradi');
  {
    const OUTSIDER = 555009;
    // Begona odam ham botni ishga tushirgan bo'lsin — u ham obunachi.
    pushMessage('/start', OUTSIDER, { id: OUTSIDER, first_name: 'Begona', username: 'begona9' });
    await settle();

    sent.length = 0;
    pushMessage('📣 Hammaga xabar', ADMIN, adminUser);
    await settle();
    check('matn so‘raldi', lastText(ADMIN).includes('Hammaga xabar'), lastText(ADMIN));
    check('qabul qiluvchilar soni aytildi', /\d+ ta<\/b> odamga/.test(lastText(ADMIN)), lastText(ADMIN));

    sent.length = 0;
    pushMessage('Yangi aksiya: chegirmalar boshlandi!', ADMIN, adminUser);
    await settle();
    check('ko‘rib chiqish ko‘rsatildi', lastText(ADMIN).includes('Yuborishdan oldin'), lastText(ADMIN));
    check(
      'tasdiqlash tugmasi bor',
      JSON.stringify(sent.map((i) => i.payload)).includes('bcast:send'),
      lastText(ADMIN),
    );

    // Oddiy foydalanuvchi tasdiqlay olmasligi kerak.
    sent.length = 0;
    pushCallback('bcast:send');
    await settle();
    check(
      'oddiy foydalanuvchi yubora olmaydi',
      sent.every((i) => (i.text ?? '').indexOf('Yangi aksiya') === -1),
      sent.map((i) => i.text).slice(0, 3),
    );

    sent.length = 0;
    pushCallback('bcast:send', ADMIN, adminUser);
    await settle(900);

    const delivered = sent.filter((i) => (i.text ?? '').includes('Yangi aksiya'));
    const chats = [...new Set(delivered.map((i) => i.chatId))];

    check('xabar tarqatildi', delivered.length > 0, delivered.length);
    check('ro‘yxatdan o‘tgan foydalanuvchi oldi', chats.includes(CHAT), chats);
    check('botni ishga tushirgan begona ham oldi', chats.includes(OUTSIDER), chats);
    check('adminning o‘ziga ham bordi', chats.includes(ADMIN), chats);
    check('hisobot berildi', allText(ADMIN).includes('Yuborish tugadi'), lastText(ADMIN));
    check(
      'yetkazilganlar soni ko‘rsatildi',
      /Yetkazildi: <b>\d+<\/b>/.test(allText(ADMIN)),
      lastText(ADMIN),
    );

    // Tugma ikkinchi marta bosilsa xabar takror ketmasligi kerak.
    sent.length = 0;
    pushCallback('bcast:send', ADMIN, adminUser);
    await settle(400);
    check(
      'takroriy bosishda qayta yuborilmadi',
      sent.every((i) => (i.text ?? '').indexOf('Yangi aksiya') === -1),
      sent.map((i) => i.text).slice(0, 3),
    );
  }

  console.log('\n6d. Rasmli e‘lon ham tarqatiladi');
  {
    sent.length = 0;
    pushMessage('📣 Hammaga xabar', ADMIN, adminUser);
    await settle();

    pushPhoto('FILE_ID_123', 'Rasmli reklama', ADMIN, adminUser);
    await settle();
    check('rasm qabul qilindi', lastText(ADMIN).includes('Rasm + matn'), lastText(ADMIN));

    sent.length = 0;
    pushCallback('bcast:send', ADMIN, adminUser);
    await settle(900);

    const photos = sent.filter((i) => i.method === 'sendPhoto');
    check('rasm sifatida yuborildi', photos.length > 0, photos.length);
    check('fayl id saqlandi', photos.every((i) => i.photo === 'FILE_ID_123'), photos[0]?.photo);
    check(
      'sarlavha bilan bordi',
      photos.every((i) => (i.text ?? '').includes('Rasmli reklama')),
      photos[0]?.text,
    );
  }

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
