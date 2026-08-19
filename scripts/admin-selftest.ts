/**
 * Admin panelini tekshiradi: hisobni muzlatish, o'chirish, qayta tiklash,
 * yolg'on e'lonni yashirish va o'chirish, shikoyatlar va kuzatuv jurnali.
 *
 * Eng muhim savol — cheklov haqiqatan ishlaydimi: muzlatilgan hisob kira
 * oladimi, yashirilgan e'lon bozorda qoladimi. Shuning uchun sinov haqiqiy
 * serverga tashqaridan so'rov yuboradi.
 *
 * Ishga tushirish:  npm run build && npx tsx scripts/admin-selftest.ts
 */

import { createChecker, startTestServer, type Harness } from './http-harness';

const ADMIN_PHONE = '+998911110001';
const BRAND_PHONE = '+998911110002';
const BLOGGER_PHONE = '+998911110003';

const { check, report } = createChecker();

let harness: Harness | null = null;

async function main(): Promise<void> {
  // Ptichka kutish oynasi bu yerda o'chiriladi — u `community-selftest` da
  // tekshiriladi va bu sinovda faqat xalaqit berardi.
  harness = await startTestServer({
    port: 34568,
    env: { ADMIN_PHONES: ADMIN_PHONE, EARLY_ACCESS_MINUTES: '0' },
  });

  const admin = harness.session('admin');
  const brand = harness.session('brend');
  const blogger = harness.session('bloger');

  await admin.post('/auth/register', {
    role: 'advertiser',
    phone: ADMIN_PHONE,
    password: 'admin_parol_1',
    name: 'Admin Brend',
    category: 'Sport & Fitnes',
  });
  await brand.post('/auth/register', {
    role: 'advertiser',
    phone: BRAND_PHONE,
    password: 'oddiy_parol_2',
    name: 'Oddiy Brend',
    category: 'Moda & Stil',
  });
  await blogger.post('/auth/register', {
    role: 'blogger',
    phone: BLOGGER_PHONE,
    password: 'oddiy_parol_3',
    name: 'Bloger Bir',
    username: 'blog_bir',
    niche: 'Moda & Stil',
    followersCount: 40_000,
  });

  console.log('\n1. Kim admin panelini ocha oladi');

  check('ro‘yxatdagi raqam admin', (await admin.get('/admin/me')).data.isAdmin === true);
  check('oddiy foydalanuvchida huquq yo‘q', (await brand.get('/admin/me')).data.isAdmin === false);
  check('oddiy foydalanuvchiga panel yopiq (403)', (await brand.get('/admin/overview')).status === 403);
  check('blogerga ham yopiq (403)', (await blogger.get('/admin/overview')).status === 403);

  const anonymous = await fetch(`${harness.base}/admin/overview`);
  check('kirmagan odamga yopiq (401)', anonymous.status === 401, anonymous.status);

  console.log('\n2. E‘lon va shikoyat');

  const created = await brand.post('/campaigns', {
    title: 'Shubhali e‘lon',
    description: 'Tez pul ishlang',
    niche: 'Moda & Stil',
    requiredFollowersMin: 100,
  });
  check('e‘lon yaratildi', created.status === 201, created.data);
  const campaignId = created.data.id as string;

  const sees = async (who: typeof blogger) =>
    (await who.state()).campaigns.some((c: { id: string }) => c.id === campaignId);

  check('bloger e‘lonni ko‘radi', await sees(blogger));

  const report1 = await blogger.post('/reports', {
    campaignId,
    reason: 'Firibgarlik / oldindan pul so‘rayapti',
    comment: 'Oldindan pul so‘radi',
  });
  check('shikoyat qabul qilindi', report1.status === 201, report1.data);

  const duplicate = await blogger.post('/reports', { campaignId, reason: 'Boshqa sabab' });
  check('takroriy shikoyat rad etildi (409)', duplicate.status === 409, duplicate.status);

  const own = await brand.post('/reports', { campaignId, reason: 'Boshqa sabab' });
  check('o‘z e‘loniga shikoyat qilib bo‘lmaydi (400)', own.status === 400, own.status);

  const overview = await admin.get('/admin/overview');
  check('admin shikoyatni ko‘radi', overview.data.reports.length === 1);
  check('ochiq shikoyat sanaldi', overview.data.stats.openReports === 1);
  check('admin barcha hisoblarni ko‘radi', overview.data.accounts.length === 3);

  console.log('\n3. Yolg‘on e‘lonni yashirish va qaytarish');

  const hidden = await admin.patch(`/admin/campaigns/${campaignId}`, {
    action: 'hide',
    reason: 'Yolg‘on: oldindan pul so‘raydi',
  });
  check('e‘lon yashirildi', hidden.status === 200, hidden.data);
  check('bloger endi ko‘rmaydi', (await sees(blogger)) === false);
  check('egasi o‘zinikini baribir ko‘radi', await sees(brand));

  const ownerView = (await brand.state()).campaigns.find((c: { id: string }) => c.id === campaignId);
  check(
    'egasiga sabab ko‘rsatiladi',
    ownerView?.moderation?.reason === 'Yolg‘on: oldindan pul so‘raydi',
    ownerView?.moderation,
  );

  await admin.patch(`/admin/campaigns/${campaignId}`, { action: 'show' });
  check('e‘lon qaytarildi', await sees(blogger));

  console.log('\n4. E‘lonni o‘chirish');

  await admin.patch(`/admin/campaigns/${campaignId}`, { action: 'delete', reason: 'Yolg‘on' });
  check('o‘chirilgan e‘lon bozorda yo‘q', (await sees(blogger)) === false);
  check('o‘chirilgan e‘lonni egasi ham ko‘rmaydi', (await sees(brand)) === false);
  check('lekin bazada saqlanib qoldi', (await admin.get('/admin/overview')).data.campaigns.length > 0);

  await admin.patch(`/admin/campaigns/${campaignId}`, { action: 'restore' });
  check('o‘chirilgan e‘lon qayta tiklandi', await sees(blogger));

  console.log('\n5. Hisobni muzlatish');

  const accounts = (await admin.get('/admin/overview')).data.accounts;
  const brandAccountId = accounts.find((a: { phone: string }) => a.phone === BRAND_PHONE).id as string;
  const adminAccountId = accounts.find((a: { phone: string }) => a.phone === ADMIN_PHONE).id as string;

  const frozen = await admin.patch(`/admin/accounts/${brandAccountId}`, {
    action: 'freeze',
    reason: 'Yolg‘on e‘lonlar joylagan',
  });
  check('hisob muzlatildi', frozen.status === 200, frozen.data);

  const blockedLogin = await harness
    .session('yangi')
    .post('/auth/login', { phone: BRAND_PHONE, password: 'oddiy_parol_2' });
  check('muzlatilgan hisob kira olmaydi (403)', blockedLogin.status === 403, blockedLogin.status);
  check(
    'sabab foydalanuvchiga aytiladi',
    String(blockedLogin.data.error ?? '').includes('Yolg‘on e‘lonlar joylagan'),
    blockedLogin.data,
  );

  check('ochiq sessiyasi ham bekor qilindi', (await brand.get('/state')).status === 401);
  check('muzlatilgan hisob e‘loni bozordan yo‘qoldi', (await sees(blogger)) === false);

  console.log('\n6. Qayta tiklash');

  await admin.patch(`/admin/accounts/${brandAccountId}`, { action: 'unfreeze' });
  const backIn = await brand.post('/auth/login', { phone: BRAND_PHONE, password: 'oddiy_parol_2' });
  check('muzlatish bekor qilindi — hisob qaytdi', backIn.status === 200, backIn.status);
  check('e‘loni ham bozorga qaytdi', await sees(blogger));

  console.log('\n7. Hisobni o‘chirish va tiklash');

  await admin.patch(`/admin/accounts/${brandAccountId}`, { action: 'delete', reason: 'Qoidabuzarlik' });
  check('o‘chirilgan hisob e‘loni ko‘rinmaydi', (await sees(blogger)) === false);

  await admin.patch(`/admin/accounts/${brandAccountId}`, { action: 'restore' });
  check('hisob qayta tiklandi', await sees(blogger));
  const restored = await brand.post('/auth/login', { phone: BRAND_PHONE, password: 'oddiy_parol_2' });
  check('tiklangan hisob yana kira oladi', restored.status === 200, restored.status);

  console.log('\n8. Himoya choralari');

  const self = await admin.patch(`/admin/accounts/${adminAccountId}`, {
    action: 'freeze',
    reason: 'sinov',
  });
  check('admin o‘zini muzlata olmaydi (400)', self.status === 400, self.status);

  const byOutsider = await brand.patch(`/admin/accounts/${brandAccountId}`, { action: 'unfreeze' });
  check('oddiy foydalanuvchi hisob holatini o‘zgartira olmaydi (403)', byOutsider.status === 403);

  const fakeCampaign = await admin.patch('/admin/campaigns/yoq-bunday-id', { action: 'hide' });
  check('mavjud bo‘lmagan e‘lon uchun 404', fakeCampaign.status === 404, fakeCampaign.status);

  // Ro'yxatda bo'lmagan hisob hech qanday yo'l bilan panelga kira olmasligi kerak.
  check('boshqa hisob shikoyatni yopa olmaydi', (await brand.patch('/admin/reports/xxx', { outcome: 'rejected' })).status === 403);
  check('boshqa hisob e‘lonni yashira olmaydi', (await brand.patch('/admin/campaigns/xxx', { action: 'hide' })).status === 403);
  check(
    'boshqa hisob parol tiklay olmaydi',
    (await brand.post(`/admin/accounts/${adminAccountId}/reset-password`)).status === 403,
  );

  console.log('\n9. Parolni tiklash');

  const reset = await admin.post(`/admin/accounts/${brandAccountId}/reset-password`);
  check('yangi parol berildi', typeof reset.data.password === 'string' && reset.data.password.length > 5);

  const oldPassword = await harness
    .session('eski')
    .post('/auth/login', { phone: BRAND_PHONE, password: 'oddiy_parol_2' });
  check('eski parol ishlamaydi (401)', oldPassword.status === 401, oldPassword.status);

  const newPassword = await harness
    .session('yangi parol')
    .post('/auth/login', { phone: BRAND_PHONE, password: reset.data.password });
  check('yangi parol ishlaydi', newPassword.status === 200, newPassword.status);

  console.log('\n10. Shikoyatni yopish va kuzatuv jurnali');

  const openReport = (await admin.get('/admin/overview')).data.reports[0];
  const resolved = await admin.patch(`/admin/reports/${openReport.id}`, { outcome: 'removed' });
  check('shikoyat yopildi', resolved.status === 200, resolved.data);

  const final = (await admin.get('/admin/overview')).data;
  check('ochiq shikoyat qolmadi', final.stats.openReports === 0);

  const actions: string[] = final.log.map((entry: { action: string }) => entry.action);
  check('jurnalga e‘lon yashirilgani yozildi', actions.includes("E'lon yashirildi"), actions);
  check('jurnalga hisob muzlatilgani yozildi', actions.includes('Hisob muzlatildi'), actions);
  check('jurnalga qayta tiklash yozildi', actions.includes('Hisob qayta tiklandi'), actions);
  check('jurnalga parol tiklangani yozildi', actions.includes('Parol tiklandi'), actions);

  const freezeEntry = final.log.find((entry: { action: string }) => entry.action === 'Hisob muzlatildi');
  check('jurnalda sabab saqlangan', freezeEntry?.reason === 'Yolg‘on e‘lonlar joylagan', freezeEntry);
  check('jurnalda admin nomi bor', typeof freezeEntry?.adminName === 'string' && freezeEntry.adminName.length > 0);
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
