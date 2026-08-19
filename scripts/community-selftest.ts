/**
 * Bloger hamjamiyatini tekshiradi: zakaz statistikasi, obunalar va
 * ptichka (rasmiy tasdiq belgisi) beradigan imtiyozlar.
 *
 * Eng muhim savol — imtiyozlar haqiqatan ishlaydimi: ptichkasiz bloger
 * yangi e'lonni ko'rmaydimi, ptichkalining arizasi tepada turadimi.
 * Shuning uchun sinov haqiqiy serverga tashqaridan so'rov yuboradi.
 *
 * Ishga tushirish:  npm run build && npx tsx scripts/community-selftest.ts
 */

import { createChecker, startTestServer, type Harness, type Session } from './http-harness';

const ADMIN_PHONE = '+998922220001';
const BRAND_PHONE = '+998922220002';
const PLAIN_PHONE = '+998922220003';
const VIP_PHONE = '+998922220004';

const { check, report } = createChecker();

let harness: Harness | null = null;

/** Blogerni ro'yxatdan o'tkazadi va profil id'sini qaytaradi. */
async function registerBlogger(
  session: Session,
  phone: string,
  name: string,
  username: string,
): Promise<string> {
  const result = await session.post('/auth/register', {
    role: 'blogger',
    phone,
    password: 'sinov_parol_123',
    name,
    username,
    niche: 'Sport & Fitnes',
    followersCount: 30_000,
  });
  return result.data.profile.id as string;
}

async function main(): Promise<void> {
  harness = await startTestServer({ port: 34569, env: { ADMIN_PHONES: ADMIN_PHONE, REQUIRE_APPROVAL: 'false', CAMPAIGN_PRICE: '0' } });

  const admin = harness.session('admin');
  const brand = harness.session('brend');
  const plain = harness.session('oddiy bloger');
  const vip = harness.session('ptichkali bloger');

  await admin.post('/auth/register', {
    role: 'advertiser',
    phone: ADMIN_PHONE,
    password: 'sinov_parol_123',
    name: 'Admin Brend',
    category: 'Sport & Fitnes',
  });
  await brand.post('/auth/register', {
    role: 'advertiser',
    phone: BRAND_PHONE,
    password: 'sinov_parol_123',
    name: 'Oddiy Brend',
    category: 'Sport & Fitnes',
  });

  const plainId = await registerBlogger(plain, PLAIN_PHONE, 'Oddiy Bloger', 'oddiy_bloger');
  const vipId = await registerBlogger(vip, VIP_PHONE, 'Ptichkali Bloger', 'vip_bloger');

  console.log('\n1. Katalog hammaga ochiq');

  const brandSees = (await brand.state()).bloggers.map((b: { id: string }) => b.id);
  check('reklama beruvchi blogerlarni ko‘radi', brandSees.includes(plainId) && brandSees.includes(vipId));

  const bloggerSees = (await plain.state()).bloggers.map((b: { id: string }) => b.id);
  check('bloger boshqa blogerni ko‘radi', bloggerSees.includes(vipId));

  console.log('\n2. Obuna bo‘lish');

  const followed = await plain.post('/follows', { targetId: vipId });
  check('obuna bo‘ldi', followed.status === 200 && followed.data.following === true, followed.data);
  check('obunachi sanaldi', followed.data.followers === 1, followed.data);

  const target = (await plain.state()).bloggers.find((b: { id: string }) => b.id === vipId);
  check('statistikada obunachi ko‘rindi', target?.stats?.followers === 1, target?.stats);

  const self = await plain.post('/follows', { targetId: plainId });
  check('o‘ziga obuna bo‘lib bo‘lmaydi (400)', self.status === 400, self.status);

  const byBrand = await brand.post('/follows', { targetId: vipId });
  check('reklama beruvchi obuna bo‘la olmaydi (403)', byBrand.status === 403, byBrand.status);

  const unfollowed = await plain.post('/follows', { targetId: vipId });
  check('takror bosilganda obuna bekor bo‘ldi', unfollowed.data.following === false, unfollowed.data);
  check('sanagich kamaydi', unfollowed.data.followers === 0, unfollowed.data);

  await plain.post('/follows', { targetId: vipId });

  console.log('\n3. Ptichka so‘rovi');

  const noColor = await plain.patch('/verification/color', { color: '#123456' });
  check('ptichkasiz bloger rang tanlay olmaydi (403)', noColor.status === 403, noColor.status);

  const request = await vip.post('/verification/request', { note: 'To‘lovga tayyorman' });
  check('so‘rov yuborildi', request.status === 201, request.data);

  const duplicate = await vip.post('/verification/request');
  check('takroriy so‘rov rad etildi (409)', duplicate.status === 409, duplicate.status);

  const mine = await vip.get('/verification/mine');
  check('bloger o‘z so‘rovini ko‘radi', mine.data.request?.status === 'pending', mine.data);

  const overview = await admin.get('/admin/overview');
  check('admin so‘rovni ko‘radi', overview.data.verificationRequests.length === 1);
  check('kutayotgan so‘rov sanaldi', overview.data.stats.verificationPending === 1);

  console.log('\n4. Ptichka berildi — imtiyozlar ochildi');

  const approved = await admin.patch(`/admin/verification/requests/${request.data.id}`, {
    decision: 'approved',
  });
  check('so‘rov tasdiqlandi', approved.status === 200, approved.data);

  const vipProfile = (await vip.state()).bloggers.find((b: { id: string }) => b.id === vipId);
  check('profilda ptichka paydo bo‘ldi', vipProfile?.isVerified === true, vipProfile?.isVerified);

  console.log('\n5. Rang — faqat ptichkali tanlaydi, hamma ko‘radi');

  const colored = await vip.patch('/verification/color', { color: '#0F766E' });
  check('rang saqlandi', colored.data.themeColor === '#0f766e', colored.data);

  const seenByOther = (await plain.state()).bloggers.find((b: { id: string }) => b.id === vipId);
  check('rangni boshqalar ham ko‘radi', seenByOther?.themeColor === '#0f766e', seenByOther?.themeColor);

  const tooLight = await vip.patch('/verification/color', { color: '#ffffff' });
  check('juda och rang rad etildi (400)', tooLight.status === 400, tooLight.status);

  const notHex = await vip.patch('/verification/color', { color: 'javascript:alert(1)' });
  check('rang o‘rniga matn o‘tmaydi (400)', notHex.status === 400, notHex.status);

  console.log('\n6. E‘lonni 15 daqiqa oldin ko‘rish');

  const created = await brand.post('/campaigns', {
    title: 'Yangi e‘lon',
    description: 'Ptichka sinovi uchun',
    niche: 'Sport & Fitnes',
    requiredFollowersMin: 100,
  });
  check('e‘lon yaratildi', created.status === 201, created.data);
  const campaignId = created.data.id as string;
  check('e‘londa aniq vaqt bor', typeof created.data.publishedAt === 'string', created.data.publishedAt);

  const sees = async (who: Session) =>
    (await who.state()).campaigns.some((c: { id: string }) => c.id === campaignId);

  check('ptichkali darhol ko‘radi', await sees(vip));
  check('ptichkasiz hali ko‘rmaydi', (await sees(plain)) === false);
  check('e‘lon egasi o‘zinikini ko‘radi', await sees(brand));
  check('boshqa reklama beruvchi ham ko‘radi', await sees(admin));

  const blocked = await plain.post('/bids', {
    campaignId,
    price: 100_000,
    message: 'Kutish davrida',
    contactTelegram: '@oddiy_bloger',
  });
  check('ptichkasiz hali ariza ham yubora olmaydi (403)', blocked.status === 403, blocked.status);

  const allowed = await vip.post('/bids', {
    campaignId,
    price: 200_000,
    message: 'Ptichkali darhol',
    contactTelegram: '@vip_bloger',
  });
  check('ptichkali darhol ariza yubordi', allowed.status === 201, allowed.data);

  harness.stop();
  harness = null;

  /* ---------------------------------------------------------------- */
  /* Kutish oynasi yopilgandan keyingi holat                           */
  /*                                                                   */
  /* 15 daqiqa kutib o'tirmaslik uchun ikkinchi serverni oyna 0 bilan  */
  /* ko'taramiz — qolgan qoidalar aynan bir xil ishlaydi.              */
  /* ---------------------------------------------------------------- */

  console.log('\n7. Kutish tugagach — arizalar tartibi');

  harness = await startTestServer({
    port: 34570,
    env: { ADMIN_PHONES: ADMIN_PHONE, EARLY_ACCESS_MINUTES: '0', REQUIRE_APPROVAL: 'false', CAMPAIGN_PRICE: '0' },
  });

  const admin2 = harness.session('admin');
  const brand2 = harness.session('brend');
  const plain2 = harness.session('oddiy');
  const vip2 = harness.session('ptichkali');

  await admin2.post('/auth/register', {
    role: 'advertiser',
    phone: ADMIN_PHONE,
    password: 'sinov_parol_123',
    name: 'Admin Brend',
    category: 'Sport & Fitnes',
  });
  await brand2.post('/auth/register', {
    role: 'advertiser',
    phone: BRAND_PHONE,
    password: 'sinov_parol_123',
    name: 'Oddiy Brend',
    category: 'Sport & Fitnes',
  });
  const plainId2 = await registerBlogger(plain2, PLAIN_PHONE, 'Oddiy Bloger', 'oddiy_bloger');
  const vipId2 = await registerBlogger(vip2, VIP_PHONE, 'Ptichkali Bloger', 'vip_bloger');

  await admin2.patch(`/admin/verification/${vipId2}`, { action: 'grant' });

  const campaign2 = await brand2.post('/campaigns', {
    title: 'Umumiy e‘lon',
    description: 'Tartib sinovi',
    niche: 'Sport & Fitnes',
    requiredFollowersMin: 100,
  });
  const sharedId = campaign2.data.id as string;

  check('oyna 0 bo‘lganda ptichkasiz ham darhol ko‘radi',
    (await plain2.state()).campaigns.some((c: { id: string }) => c.id === sharedId));

  // Avval ptichkasiz yuboradi — vaqt bo'yicha u tepada bo'lishi kerak edi,
  // lekin ptichka uni pastga tushiradi.
  const plainBid = await plain2.post('/bids', {
    campaignId: sharedId,
    price: 100_000,
    message: 'Oddiy bloger arizasi',
    contactTelegram: '@oddiy_bloger',
  });
  check('ptichkasiz ariza yubordi', plainBid.status === 201, plainBid.data);

  const vipBid = await vip2.post('/bids', {
    campaignId: sharedId,
    price: 200_000,
    message: 'Ptichkali bloger arizasi',
    contactTelegram: '@vip_bloger',
  });
  check('ptichkali ariza yubordi', vipBid.status === 201, vipBid.data);

  const bids = (await brand2.state()).bids.filter((b: { campaignId: string }) => b.campaignId === sharedId);
  check('ikkala ariza ko‘rindi', bids.length === 2, bids.length);
  check(
    'ptichkalining arizasi birinchi',
    bids[0]?.bloggerId === vipId2,
    bids.map((b: { bloggerId: string }) => b.bloggerId),
  );

  console.log('\n8. Zakaz statistikasi');

  const accepted = await brand2.patch(`/bids/${vipBid.data.id}`, { status: 'accepted' });
  check('ariza qabul qilindi', accepted.status === 200, accepted.data);

  const statsOf = async (who: Session, id: string) =>
    (await who.state()).bloggers.find((b: { id: string }) => b.id === id)?.stats;

  let vipStats = await statsOf(vip2, vipId2);
  check('zakaz sanaldi', vipStats?.ordersTotal === 1, vipStats);
  check('hali bajarilmagan', vipStats?.ordersCompleted === 0, vipStats);
  check('ishdagi zakaz ko‘rindi', vipStats?.ordersActive === 1, vipStats);

  const completed = await brand2.patch(`/bids/${vipBid.data.id}`, { status: 'completed' });
  check('zakaz yakunlandi', completed.status === 200, completed.data);
  check('yakunlangan sana yozildi', typeof completed.data.completedAt === 'string', completed.data.completedAt);

  vipStats = await statsOf(vip2, vipId2);
  check('bajarilgan zakaz sanaldi', vipStats?.ordersCompleted === 1, vipStats);
  check('umumiy zakaz o‘zgarmadi', vipStats?.ordersTotal === 1, vipStats);
  check('ishdagi zakaz bo‘shadi', vipStats?.ordersActive === 0, vipStats);
  check('oxirgi zakaz sanasi bor', typeof vipStats?.lastOrderAt === 'string', vipStats?.lastOrderAt);

  await brand2.patch(`/bids/${plainBid.data.id}`, { status: 'rejected' });
  const plainStats = await statsOf(plain2, plainId2);
  check('rad etilgan ariza sanaldi', plainStats?.bidsRejected === 1, plainStats);
  check('rad etilgani zakaz hisoblanmadi', plainStats?.ordersTotal === 0, plainStats);
  check('yuborilgan arizalar sanaldi', plainStats?.bidsSent === 1, plainStats);

  console.log('\n9. Ptichkani olib qo‘yish');

  const revoked = await admin2.patch(`/admin/verification/${vipId2}`, {
    action: 'revoke',
    reason: 'Muddat tugadi',
  });
  check('ptichka olib qo‘yildi', revoked.status === 200 && revoked.data.isVerified === false, revoked.data);

  const afterRevoke = (await plain2.state()).bloggers.find((b: { id: string }) => b.id === vipId2);
  check('belgi yo‘qoldi', afterRevoke?.isVerified === false, afterRevoke?.isVerified);
  check('rang ham bekor qilindi', !afterRevoke?.themeColor, afterRevoke?.themeColor);

  const colorAfter = await vip2.patch('/verification/color', { color: '#123456' });
  check('endi rang tanlay olmaydi (403)', colorAfter.status === 403, colorAfter.status);

  console.log('\n10. Statistika ptichkadan mustaqil');

  const statsAfter = await statsOf(vip2, vipId2);
  check('bajarilgan zakaz saqlanib qoldi', statsAfter?.ordersCompleted === 1, statsAfter);

  const bidsAfter = (await brand2.state()).bids.filter((b: { campaignId: string }) => b.campaignId === sharedId);
  check('ptichka ketgach tartib vaqt bo‘yicha bo‘ldi', bidsAfter.length === 2, bidsAfter.length);
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
