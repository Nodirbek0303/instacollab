/**
 * Ko'rinish qoidalarini tekshiradi — kim nimani ko'radi.
 *
 * Katalog ochiq: blogerlar ham, reklama beruvchilar ham bir-birini ko'radi.
 * Lekin **shaxsiy narsalar yopiq**: ariza kontaktlari va chat xabarlari
 * faqat ikki tomonga ko'rinadi, begonaga emas.
 *
 * Cheklov interfeysda emas, serverda bo'lishi kerak — shuning uchun sinov
 * haqiqiy serverga tashqaridan so'rov yuboradi, xuddi API'ni qo'lda
 * kovlagan odam kabi.
 *
 * Ptichka kutish oynasi bu yerda 0 ga qo'yiladi — u alohida sinovda
 * (`community-selftest`) tekshiriladi va bu yerda faqat xalaqit berardi.
 *
 * Ishga tushirish:  npm run build && npx tsx scripts/visibility-selftest.ts
 */

import { createChecker, startTestServer, type Harness } from './http-harness';

const { check, report } = createChecker();

let harness: Harness | null = null;

async function main(): Promise<void> {
  harness = await startTestServer({ port: 34567, env: { EARLY_ACCESS_MINUTES: '0' } });

  const brandA = harness.session('Brend A');
  const brandB = harness.session('Brend B');
  const blogX = harness.session('Bloger X');
  const blogY = harness.session('Bloger Y');

  await brandA.post('/auth/register', {
    role: 'advertiser',
    phone: '+998911110001',
    password: 'sinov_parol_1',
    name: 'Brend A',
    category: 'Sport & Fitnes',
  });
  await brandB.post('/auth/register', {
    role: 'advertiser',
    phone: '+998911110002',
    password: 'sinov_parol_2',
    name: 'Brend B',
    category: 'Moda & Stil',
  });
  await blogX.post('/auth/register', {
    role: 'blogger',
    phone: '+998911110003',
    password: 'sinov_parol_3',
    name: 'Bloger X',
    username: 'blog_x',
    niche: 'Sport & Fitnes',
    followersCount: 50_000,
  });
  await blogY.post('/auth/register', {
    role: 'blogger',
    phone: '+998911110004',
    password: 'sinov_parol_4',
    name: 'Bloger Y',
    username: 'blog_y',
    niche: 'Moda & Stil',
    followersCount: 30_000,
  });

  const bloggerXId = (await blogX.get('/auth/me')).data.profile.id as string;
  const bloggerYId = (await blogY.get('/auth/me')).data.profile.id as string;
  const brandAId = (await brandA.get('/auth/me')).data.profile.id as string;

  console.log('\n1. Katalog ochiq');

  const seenByBrand = (await brandA.state()).bloggers.map((b: { id: string }) => b.id);
  check('reklama beruvchi blogerlarni ko‘radi', seenByBrand.includes(bloggerXId), seenByBrand.length);

  const seenByBlogger = (await blogX.state()).bloggers.map((b: { id: string }) => b.id);
  check('bloger boshqa blogerni ko‘radi', seenByBlogger.includes(bloggerYId), seenByBlogger.length);

  console.log('\n2. E‘lonlar hammaga ochiq');

  const created = await brandA.post('/campaigns', {
    title: 'A e‘loni',
    description: 'Brend A ning e‘loni',
    niche: 'Sport & Fitnes',
    requiredFollowersMin: 1000,
  });
  check('e‘lon yaratildi', created.status === 201, created.data);
  const campaignId = created.data.id as string;

  const seenByY = (await blogY.state()).campaigns.some((c: { id: string }) => c.id === campaignId);
  check('bloger begona brendning e‘lonini ko‘radi', seenByY);

  console.log('\n3. Arizalar faqat tegishli tomonlarga');

  const bid = await blogX.post('/bids', {
    campaignId,
    price: 500_000,
    message: 'Qiziqdim',
    contactTelegram: '@blog_x',
  });
  check('ariza yuborildi', bid.status === 201, bid.data);

  check('e‘lon egasi arizani ko‘radi', (await brandA.state()).bids.length === 1);
  check('ariza egasi o‘z arizasini ko‘radi', (await blogX.state()).bids.length === 1);
  check('begona reklama beruvchi arizani ko‘rmaydi', (await brandB.state()).bids.length === 0);
  check('begona bloger arizani ko‘rmaydi', (await blogY.state()).bids.length === 0);

  console.log('\n4. Yozishmalar faqat ikki tomonga');

  const message = await brandA.post('/messages', {
    partnerId: bloggerXId,
    text: 'Salom, kelishamizmi?',
  });
  check('xabar yuborildi', message.status === 201, message.data);

  check('yuboruvchi xabarni ko‘radi', (await brandA.state()).messages.length === 1);
  check('qabul qiluvchi xabarni ko‘radi', (await blogX.state()).messages.length === 1);
  check('begona reklama beruvchi xabarni ko‘rmaydi', (await brandB.state()).messages.length === 0);
  check('begona bloger xabarni ko‘rmaydi', (await blogY.state()).messages.length === 0);

  console.log('\n5. Begona profilni tahrirlab bo‘lmaydi');

  const hijack = await brandB.patch(`/bloggers/${bloggerXId}`, {
    name: 'Buzilgan',
    username: 'blog_x',
    niche: 'Sport & Fitnes',
    followersCount: 1,
  });
  check('reklama beruvchi bloger profilini o‘zgartira olmaydi', hijack.status === 403, hijack.status);

  const hijack2 = await blogY.patch(`/brands/${brandAId}`, {
    name: 'Buzilgan',
    category: 'Sport & Fitnes',
  });
  check('bloger brend profilini o‘zgartira olmaydi', hijack2.status === 403, hijack2.status);

  const hijack3 = await blogY.patch(`/bloggers/${bloggerXId}`, {
    name: 'Buzilgan',
    username: 'blog_x',
    niche: 'Sport & Fitnes',
    followersCount: 1,
  });
  check('bloger begona bloger profilini o‘zgartira olmaydi', hijack3.status === 403, hijack3.status);

  console.log('\n6. Begona arizani boshqarib bo‘lmaydi');

  const bidId = bid.data.id as string;
  const notOwner = await brandB.patch(`/bids/${bidId}`, { status: 'accepted' });
  check('begona brend arizani tasdiqlay olmaydi', notOwner.status === 403, notOwner.status);

  const byBlogger = await blogX.patch(`/bids/${bidId}`, { status: 'accepted' });
  check('bloger o‘z arizasini o‘zi tasdiqlay olmaydi', byBlogger.status === 403, byBlogger.status);

  console.log('\n7. Kirmagan odam hech narsa ko‘rmaydi');

  const anon = await fetch(`${harness.base}/state`);
  check('kirmagan foydalanuvchiga 401', anon.status === 401, anon.status);

  const anonEvents = await fetch(`${harness.base}/events`);
  check('jonli oqim ham yopiq', anonEvents.status === 401, anonEvents.status);

  const anonBloggers = await fetch(`${harness.base}/follows`, { method: 'POST' });
  check('obuna ham yopiq', anonBloggers.status === 401, anonBloggers.status);
}

main()
  .catch((error) => {
    console.error('\nKutilmagan xatolik:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    harness?.stop();
    process.exit(report() > 0 || process.exitCode === 1 ? 1 : 0);
  });
