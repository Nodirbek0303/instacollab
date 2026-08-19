/**
 * Ko'rinish qoidalarini tekshiradi — kim kimni ko'radi.
 *
 * Asosiy qoida: blogerlar katalogi yopiq. Reklama beruvchi blogerlar ro'yxatini
 * ko'ra olmaydi, u faqat o'z e'loniga ariza yuborgan blogerni ko'radi. Bloger
 * ham boshqa blogerlarni ko'rmaydi.
 *
 * Bu cheklov interfeysdagi tugmani olib tashlash bilan emas, serverda
 * bajarilishi kerak — shuning uchun sinov haqiqiy serverni ko'taradi va unga
 * to'g'ridan-to'g'ri HTTP so'rovlar yuboradi, xuddi API'ni qo'lda kovlagan
 * odam kabi.
 *
 * Ishga tushirish:  npx tsx scripts/visibility-selftest.ts
 * (avval `npm run build` kerak — sinov `dist/server.cjs` ni ishga tushiradi)
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 34567;
const BASE = `http://127.0.0.1:${PORT}/api`;
const DATA_DIR = mkdtempSync(join(tmpdir(), 'instacollab-vis-test-'));

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

/** Bitta foydalanuvchi sessiyasi — cookie'ni o'zi eslab qoladi. */
class Session {
  private cookie = '';

  constructor(readonly label: string) {}

  async request(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];

    const text = await response.text();
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: response.status, data };
  }

  state() {
    return this.request('GET', '/state').then((r) => r.data);
  }
}

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) {
        const body = (await response.json()) as { status?: string };
        if (body.status === 'ok') return;
      }
    } catch {
      /* hali ko'tarilmadi */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Server ko‘tarilmadi');
}

let child: ChildProcess | null = null;

async function main(): Promise<void> {
  console.log('Server ko‘tarilmoqda…');
  child = spawn('node', ['dist/server.cjs'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATA_DIR,
      DATABASE_URL: '',
      TELEGRAM_BOT_TOKEN: '',
      NODE_ENV: 'production',
    },
    stdio: 'ignore',
  });
  await waitForServer();

  /* ---------------- Ishtirokchilar ---------------- */

  const brendA = new Session('Brend A');
  const brendB = new Session('Brend B');
  const blogX = new Session('Bloger X');
  const blogY = new Session('Bloger Y');

  await brendA.request('POST', '/auth/register', {
    role: 'advertiser',
    phone: '+998911110001',
    password: 'sinov_parol_1',
    name: 'Brend A',
    category: 'Sport & Fitnes',
  });
  await brendB.request('POST', '/auth/register', {
    role: 'advertiser',
    phone: '+998911110002',
    password: 'sinov_parol_2',
    name: 'Brend B',
    category: 'Moda & Stil',
  });
  await blogX.request('POST', '/auth/register', {
    role: 'blogger',
    phone: '+998911110003',
    password: 'sinov_parol_3',
    name: 'Bloger X',
    username: 'blog_x',
    niche: 'Sport & Fitnes',
    followersCount: 50_000,
  });
  await blogY.request('POST', '/auth/register', {
    role: 'blogger',
    phone: '+998911110004',
    password: 'sinov_parol_4',
    name: 'Bloger Y',
    username: 'blog_y',
    niche: 'Moda & Stil',
    followersCount: 30_000,
  });

  console.log('\n1. Boshlang‘ich holat — hech kim aloqaga kirmagan');

  const seeded = await brendA.state();
  check(
    'bazada blogerlar bor (seed)',
    Array.isArray(seeded.bloggers),
  );
  check('reklama beruvchi hech qanday blogerni ko‘rmaydi', (await brendA.state()).bloggers.length === 0);
  check('ikkinchi reklama beruvchi ham ko‘rmaydi', (await brendB.state()).bloggers.length === 0);

  const xState = await blogX.state();
  check('bloger faqat o‘zini ko‘radi', xState.bloggers.length === 1 && xState.bloggers[0].username === 'blog_x');
  const yState = await blogY.state();
  check('boshqa bloger ham faqat o‘zini ko‘radi', yState.bloggers.length === 1 && yState.bloggers[0].username === 'blog_y');

  console.log('\n2. E‘lonlar hammaga ochiq');

  const created = await brendA.request('POST', '/campaigns', {
    title: 'A e‘loni',
    description: 'Brend A ning e‘loni',
    niche: 'Sport & Fitnes',
    requiredFollowersMin: 1000,
  });
  check('e‘lon yaratildi', created.status === 201, created.data);
  const campaignId = created.data.id as string;

  const seenByY = (await blogY.state()).campaigns.some((c: { id: string }) => c.id === campaignId);
  check('bloger begona brendning e‘lonini ko‘radi', seenByY);

  console.log('\n3. Ariza yuborilgach — aynan o‘sha bloger ko‘rinadi');

  const bid = await blogX.request('POST', '/bids', {
    campaignId,
    price: 500_000,
    message: 'Qiziqdim',
    contactTelegram: '@blog_x',
  });
  check('ariza yuborildi', bid.status === 201, bid.data);

  const afterBid = await brendA.state();
  check(
    'e‘lon egasi ariza yuborgan blogerni ko‘radi',
    afterBid.bloggers.length === 1 && afterBid.bloggers[0].username === 'blog_x',
    afterBid.bloggers.map((b: { username: string }) => b.username),
  );
  check(
    'boshqa reklama beruvchi o‘sha blogerni baribir ko‘rmaydi',
    (await brendB.state()).bloggers.length === 0,
  );
  check('begona bloger ham ko‘rmaydi', (await blogY.state()).bloggers.length === 1);

  console.log('\n4. Arizalar faqat tegishli tomonlarga ko‘rinadi');

  check('e‘lon egasi arizani ko‘radi', (await brendA.state()).bids.length === 1);
  check('ariza egasi o‘z arizasini ko‘radi', (await blogX.state()).bids.length === 1);
  check('begona reklama beruvchi arizani ko‘rmaydi', (await brendB.state()).bids.length === 0);
  check('begona bloger arizani ko‘rmaydi', (await blogY.state()).bids.length === 0);

  console.log('\n5. Yozishmalar faqat ikki tomonga');

  const bloggerXId = (await blogX.request('GET', '/auth/me')).data.profile.id as string;
  const brandAId = (await brendA.request('GET', '/auth/me')).data.profile.id as string;

  const message = await brendA.request('POST', '/messages', {
    partnerId: bloggerXId,
    text: 'Salom, kelishamizmi?',
  });
  check('xabar yuborildi', message.status === 201, message.data);

  check('yuboruvchi xabarni ko‘radi', (await brendA.state()).messages.length === 1);
  check('qabul qiluvchi xabarni ko‘radi', (await blogX.state()).messages.length === 1);
  check('begona reklama beruvchi xabarni ko‘rmaydi', (await brendB.state()).messages.length === 0);
  check('begona bloger xabarni ko‘rmaydi', (await blogY.state()).messages.length === 0);

  console.log('\n6. Begona profilni tahrirlab bo‘lmaydi');

  const hijack = await brendB.request('PATCH', `/bloggers/${bloggerXId}`, {
    name: 'Buzilgan',
    username: 'blog_x',
    niche: 'Sport & Fitnes',
    followersCount: 1,
  });
  check('reklama beruvchi bloger profilini o‘zgartira olmaydi', hijack.status === 403, hijack.status);

  const hijack2 = await blogY.request('PATCH', `/brands/${brandAId}`, {
    name: 'Buzilgan',
    category: 'Sport & Fitnes',
  });
  check('bloger brend profilini o‘zgartira olmaydi', hijack2.status === 403, hijack2.status);

  console.log('\n7. Kirmagan odam hech narsa ko‘rmaydi');

  const anon = await fetch(`${BASE}/state`);
  check('kirmagan foydalanuvchiga 401', anon.status === 401, anon.status);
  const anonEvents = await fetch(`${BASE}/events`);
  check('jonli oqim ham yopiq', anonEvents.status === 401, anonEvents.status);
}

main()
  .catch((error) => {
    failed++;
    console.error('\nKutilmagan xatolik:', error);
  })
  .finally(() => {
    child?.kill('SIGKILL');
    rmSync(DATA_DIR, { recursive: true, force: true });
    console.log('\n==============================================');
    console.log(`  Muvaffaqiyatli: ${passed}   Xato: ${failed}`);
    console.log('==============================================\n');
    process.exit(failed > 0 ? 1 : 0);
  });
