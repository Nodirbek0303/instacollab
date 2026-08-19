/**
 * Ro'yxatdan o'tish → to'lov → admin tasdig'i oqimini tekshiradi.
 *
 * Asosiy savol: tasdiqlanmagan hisob **haqiqatan** yopiqmi. Parol to'g'ri
 * bo'lsa ham kira olmasligi, sessiya ochilmasligi va API'ga to'g'ridan-to'g'ri
 * murojaat qilib ham hech narsa ololmasligi kerak.
 *
 * Ishga tushirish:  npm run build && npx tsx scripts/approval-selftest.ts
 */

import { createChecker, startTestServer, type Harness } from './http-harness';

const ADMIN_PHONE = '+998933330001';
const NEW_PHONE = '+998933330002';
const PASSWORD = 'sinov_parol_123';

const { check, report } = createChecker();

let harness: Harness | null = null;

async function main(): Promise<void> {
  /*
   * Admin hisobi ham tasdiq talab qilsa, uni tasdiqlaydigan odam qolmaydi —
   * shuning uchun avval tasdiqsiz rejimda ochamiz, keyin talabni yoqamiz.
   */
  harness = await startTestServer({
    port: 34571,
    env: { ADMIN_PHONES: ADMIN_PHONE, REQUIRE_APPROVAL: 'false' },
  });

  const admin = harness.session('admin');
  const created = await admin.post('/auth/register', {
    role: 'advertiser',
    phone: ADMIN_PHONE,
    password: PASSWORD,
    name: 'Admin Brend',
    category: 'Sport & Fitnes',
  });
  check('tasdiqsiz rejimda darhol kirdi', created.status === 201, created.data);
  check('admin huquqi bor', (await admin.get('/admin/me')).data.isAdmin === true);

  harness.stop();

  /* ---------------------------------------------------------------- */

  console.log('\n1. Tasdiq talab qilingan holat');

  harness = await startTestServer({
    port: 34572,
    env: { ADMIN_PHONES: ADMIN_PHONE, ADMIN_CONTACT: '@sinov_admin' },
  });

  const admin2 = harness.session('admin');
  await admin2.post('/auth/register', {
    role: 'advertiser',
    phone: ADMIN_PHONE,
    password: PASSWORD,
    name: 'Admin Brend',
    category: 'Sport & Fitnes',
  });

  // Admin ham tasdiq kutadi — o'zini o'zi tasdiqlay olmaydi, shuning uchun
  // uni to'g'ridan-to'g'ri tasdiqlash uchun boshqa yo'l kerak emas:
  // `ADMIN_PHONES` ro'yxatidagi hisob baribir admin huquqiga ega, lekin
  // kira olmaydi. Bu holatni ham tekshiramiz.
  const adminLogin = await harness
    .session('admin kirish')
    .post('/auth/login', { phone: ADMIN_PHONE, password: PASSWORD });
  check(
    'tasdiqlanmagan admin ham kira olmaydi',
    adminLogin.status === 403 && adminLogin.data.pending === true,
    adminLogin.data,
  );

  const config = await harness.session('mehmon').get('/config');
  check('sozlamalarda admin manzili bor', config.data.adminContact === 'sinov_admin', config.data);

  console.log('\n2. Yangi foydalanuvchi ro‘yxatdan o‘tadi');

  const guest = harness.session('yangi');
  const registered = await guest.post('/auth/register', {
    role: 'blogger',
    phone: NEW_PHONE,
    password: PASSWORD,
    name: 'Yangi Bloger',
    username: 'yangi_bloger',
    niche: 'Sport & Fitnes',
    followersCount: 12_000,
  });

  check('javob 202 (kutilmoqda)', registered.status === 202, registered.status);
  check('pending belgisi bor', registered.data.pending === true, registered.data);
  check('admin manzili qaytdi', registered.data.adminContact === 'sinov_admin', registered.data);
  check(
    'tushuntirish matni bor',
    typeof registered.data.message === 'string' && registered.data.message.length > 20,
    registered.data.message,
  );

  console.log('\n3. Tasdiqlanmagan hisob yopiq');

  check('sessiya ochilmadi', (await guest.get('/auth/me')).status === 401);
  check('holatni ololmaydi', (await guest.get('/state')).status === 401);

  const login = await harness
    .session('yangi kirish')
    .post('/auth/login', { phone: NEW_PHONE, password: PASSWORD });
  check('to‘g‘ri parol bilan ham kira olmaydi (403)', login.status === 403, login.status);
  check('pending sababi aytiladi', login.data.pending === true, login.data);
  check('admin manzili ko‘rsatiladi', login.data.adminContact === 'sinov_admin', login.data);

  const wrong = await harness
    .session('xato parol')
    .post('/auth/login', { phone: NEW_PHONE, password: 'butunlay_boshqa' });
  check('xato parol baribir 401 beradi', wrong.status === 401, wrong.status);
  check('xato parolda pending oshkor qilinmaydi', wrong.data.pending === undefined, wrong.data);

  console.log('\n4. Tasdiqlanmagan profil boshqalarga ko‘rinmaydi');

  // Admin hisobini qo'lda ochish uchun tasdiq talabini vaqtincha o'chirib
  // bo'lmaydi, shuning uchun tekshiruvni admin API'siz o'tkazamiz:
  // tasdiqlanmagan hisob hech qanday ma'lumot ololmasligi yuqorida
  // tekshirildi. Bu yerda faqat ochiq API'ni tekshiramiz.
  const anonymous = await fetch(`${harness.base}/state`);
  check('kirmagan odam ham hech narsa ko‘rmaydi', anonymous.status === 401, anonymous.status);

  harness.stop();

  /* ---------------------------------------------------------------- */

  console.log('\n5. Admin tasdiqlaydi — hisob ochiladi');

  /*
   * Endi admin faol, yangi foydalanuvchi esa tasdiq kutadi: buning uchun
   * serverni tasdiqsiz rejimda ochib admin yaratamiz, so'ng talabni yoqib
   * qayta ishga tushiramiz — baza saqlanib qoladi.
   */
  harness = await startTestServer({
    port: 34573,
    env: { ADMIN_PHONES: ADMIN_PHONE, ADMIN_CONTACT: '@sinov_admin', REQUIRE_APPROVAL: 'false' },
  });
  const dataDir = harness.dataDir;

  const admin3 = harness.session('admin');
  await admin3.post('/auth/register', {
    role: 'advertiser',
    phone: ADMIN_PHONE,
    password: PASSWORD,
    name: 'Admin Brend',
    category: 'Sport & Fitnes',
  });
  harness.stop({ keepData: true });

  harness = await startTestServer({
    port: 34574,
    env: { ADMIN_PHONES: ADMIN_PHONE, ADMIN_CONTACT: '@sinov_admin' },
    dataDir,
  });

  const boss = harness.session('admin');
  const bossLogin = await boss.post('/auth/login', { phone: ADMIN_PHONE, password: PASSWORD });
  check('avval yaratilgan admin kira oladi', bossLogin.status === 200, bossLogin.status);

  const applicant = harness.session('nomzod');
  const application = await applicant.post('/auth/register', {
    role: 'blogger',
    phone: NEW_PHONE,
    password: PASSWORD,
    name: 'Yangi Bloger',
    username: 'yangi_bloger',
    niche: 'Sport & Fitnes',
    followersCount: 12_000,
  });
  check('nomzod tasdiq kutmoqda', application.status === 202, application.status);

  const overview = await boss.get('/admin/overview');
  const pending = overview.data.accounts.filter((a: { status: string }) => a.status === 'pending');
  check('admin kutayotgan hisobni ko‘radi', pending.length === 1, pending.length);
  check('statistikada sanaldi', overview.data.stats.pending === 1, overview.data.stats.pending);

  const approved = await boss.patch(`/admin/accounts/${pending[0].id}`, { action: 'approve' });
  check('tasdiqlandi', approved.status === 200 && approved.data.status === 'active', approved.data);

  const afterApproval = await harness
    .session('nomzod kirish')
    .post('/auth/login', { phone: NEW_PHONE, password: PASSWORD });
  check('endi erkin kira oladi', afterApproval.status === 200, afterApproval.status);
  check(
    'profili qaytarildi',
    afterApproval.data.profile?.username === 'yangi_bloger',
    afterApproval.data.profile,
  );

  const log = (await boss.get('/admin/overview')).data.log;
  check(
    'jurnalga yozildi',
    log.some((entry: { action: string }) => entry.action === 'Hisob tasdiqlandi'),
    log.map((e: { action: string }) => e.action),
  );

  console.log('\n6. Rad etish');

  const second = harness.session('ikkinchi');
  await second.post('/auth/register', {
    role: 'advertiser',
    phone: '+998933330003',
    password: PASSWORD,
    name: 'Ikkinchi Brend',
    category: 'Moda & Stil',
  });

  const stillPending = (await boss.get('/admin/overview')).data.accounts.find(
    (a: { phone: string }) => a.phone === '+998933330003',
  );
  check('ikkinchi nomzod kutmoqda', stillPending?.status === 'pending', stillPending?.status);

  const rejected = await boss.patch(`/admin/accounts/${stillPending.id}`, {
    action: 'reject',
    reason: "To'lov qilinmadi",
  });
  check('rad etildi', rejected.status === 200 && rejected.data.status === 'deleted', rejected.data);

  const afterReject = await harness
    .session('rad etilgan')
    .post('/auth/login', { phone: '+998933330003', password: PASSWORD });
  check('rad etilgan kira olmaydi (403)', afterReject.status === 403, afterReject.status);
  check(
    'rad etilganga pending deyilmaydi',
    afterReject.data.pending === false,
    afterReject.data,
  );

  console.log('\n7. Fikr o‘zgarsa — qayta tiklash');

  const restored = await boss.patch(`/admin/accounts/${stillPending.id}`, { action: 'restore' });
  check('qayta tiklandi', restored.status === 200, restored.data);

  const afterRestore = await harness
    .session('tiklangan')
    .post('/auth/login', { phone: '+998933330003', password: PASSWORD });
  check('tiklangan hisob kira oladi', afterRestore.status === 200, afterRestore.status);
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
