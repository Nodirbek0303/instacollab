/**
 * E'lon uchun to'lov oqimini tekshiradi.
 *
 * Asosiy savol: to'lanmagan e'lon **haqiqatan** bozorda yo'qmi. Bloger uni
 * ko'rmasligi, ariza yubora olmasligi va id'ni bilib turib ham hech narsa
 * qila olmasligi kerak. Egasi esa o'zinikini sabab bilan ko'rib turishi
 * kerak — aks holda e'loni qayoqqa ketganini tushunmaydi.
 *
 * Ishga tushirish:  npm run build && npx tsx scripts/payment-selftest.ts
 */

import { createChecker, startTestServer, type Harness, type Session } from './http-harness';

const ADMIN_PHONE = '+998944440001';
const BRAND_PHONE = '+998944440002';
const BLOGGER_PHONE = '+998944440003';
const PASSWORD = 'sinov_parol_123';
const PRICE = 10_000;

const { check, report } = createChecker();

let harness: Harness | null = null;

async function main(): Promise<void> {
  harness = await startTestServer({
    port: 34575,
    env: {
      ADMIN_PHONES: ADMIN_PHONE,
      REQUIRE_APPROVAL: 'false',
      EARLY_ACCESS_MINUTES: '0',
      CAMPAIGN_PRICE: String(PRICE),
    },
  });

  const admin = harness.session('admin');
  const brand = harness.session('brend');
  const blogger = harness.session('bloger');

  await admin.post('/auth/register', {
    role: 'advertiser',
    phone: ADMIN_PHONE,
    password: PASSWORD,
    name: 'Admin Brend',
    category: 'Sport & Fitnes',
  });
  await brand.post('/auth/register', {
    role: 'advertiser',
    phone: BRAND_PHONE,
    password: PASSWORD,
    name: 'Oddiy Brend',
    category: 'Sport & Fitnes',
  });
  await blogger.post('/auth/register', {
    role: 'blogger',
    phone: BLOGGER_PHONE,
    password: PASSWORD,
    name: 'Bloger Bir',
    username: 'blog_bir',
    niche: 'Sport & Fitnes',
    followersCount: 40_000,
  });

  console.log('\n1. Narx e‘lon qilinadi');

  const config = await harness.session('mehmon').get('/config');
  check('sozlamalarda narx bor', config.data.campaignPrice === PRICE, config.data.campaignPrice);

  console.log('\n2. E‘lon yaratiladi — lekin bozorga chiqmaydi');

  const created = await brand.post('/campaigns', {
    title: 'To‘lov kutayotgan e‘lon',
    description: 'Sinov uchun',
    niche: 'Sport & Fitnes',
    requiredFollowersMin: 100,
  });
  check('e‘lon yaratildi', created.status === 201, created.data);
  const campaignId = created.data.id as string;

  check('to‘lov kutilayotgani aytildi', created.data.awaitingPayment === true, created.data);
  check('narx qaytarildi', created.data.price === PRICE, created.data.price);
  check('to‘lov holati pending', created.data.payment?.status === 'pending', created.data.payment);
  check('summa saqlandi', created.data.payment?.amount === PRICE, created.data.payment);
  check(
    'hali chop etilmagan',
    created.data.publishedAt === undefined || created.data.publishedAt === null,
    created.data.publishedAt,
  );

  const sees = async (who: Session) =>
    (await who.state()).campaigns.some((c: { id: string }) => c.id === campaignId);

  check('bloger e‘lonni ko‘rmaydi', (await sees(blogger)) === false);
  check('boshqa reklama beruvchi ham ko‘rmaydi', (await sees(admin)) === false);
  check('egasi o‘zinikini ko‘radi', await sees(brand));

  const ownerView = (await brand.state()).campaigns.find((c: { id: string }) => c.id === campaignId);
  check('egasiga to‘lov holati ko‘rinadi', ownerView?.payment?.status === 'pending', ownerView?.payment);

  console.log('\n3. To‘lanmagan e‘longa ariza yuborib bo‘lmaydi');

  const bid = await blogger.post('/bids', {
    campaignId,
    price: 200_000,
    message: 'Qiziqdim',
    contactTelegram: '@blog_bir',
  });
  check('ariza rad etildi (404)', bid.status === 404, bid.status);

  console.log('\n4. Admin to‘lovni tasdiqlaydi');

  const overview = await admin.get('/admin/overview');
  check('admin to‘lov kutayotganini ko‘radi', overview.data.stats.unpaidCampaigns === 1, overview.data.stats);

  const row = overview.data.campaigns.find((c: { id: string }) => c.id === campaignId);
  check('summa panelda ko‘rinadi', row?.paymentAmount === PRICE, row?.paymentAmount);

  const byBrand = await brand.patch(`/admin/campaigns/${campaignId}/payment`, { action: 'confirm' });
  check('reklama beruvchi o‘zi tasdiqlay olmaydi (403)', byBrand.status === 403, byBrand.status);

  const confirmed = await admin.patch(`/admin/campaigns/${campaignId}/payment`, { action: 'confirm' });
  check('admin tasdiqladi', confirmed.status === 200, confirmed.data);
  check('holat paid bo‘ldi', confirmed.data.payment?.status === 'paid', confirmed.data.payment);

  check('endi bloger ko‘radi', await sees(blogger));
  check('boshqa reklama beruvchi ham ko‘radi', await sees(admin));

  const published = (await blogger.state()).campaigns.find((c: { id: string }) => c.id === campaignId);
  check('chop etilgan vaqt qo‘yildi', typeof published?.publishedAt === 'string', published?.publishedAt);

  const okBid = await blogger.post('/bids', {
    campaignId,
    price: 200_000,
    message: 'Qiziqdim',
    contactTelegram: '@blog_bir',
  });
  check('endi ariza yuborildi', okBid.status === 201, okBid.data);

  console.log('\n5. To‘lovni bekor qilish');

  const revoked = await admin.patch(`/admin/campaigns/${campaignId}/payment`, {
    action: 'revoke',
    note: 'To‘lov qaytarildi',
  });
  check('bekor qilindi', revoked.status === 200, revoked.data);
  check('yana pending', revoked.data.payment?.status === 'pending', revoked.data.payment);
  check('bozordan yo‘qoldi', (await sees(blogger)) === false);
  check('egasi baribir ko‘radi', await sees(brand));

  console.log('\n6. Kuzatuv jurnali');

  const log = (await admin.get('/admin/overview')).data.log.map((e: { action: string }) => e.action);
  check('tasdiqlash yozildi', log.includes("E'lon to'lovi tasdiqlandi"), log);
  check('bekor qilish yozildi', log.includes("E'lon to'lovi bekor qilindi"), log);

  console.log('\n7. To‘lov talab qilinmagan e‘lonlar');

  const missing = await admin.patch('/admin/campaigns/yoq-bunday/payment', { action: 'confirm' });
  check('mavjud bo‘lmagan e‘lon uchun 404', missing.status === 404, missing.status);

  harness.stop();

  /* ---------------------------------------------------------------- */

  console.log('\n8. Bepul rejim (CAMPAIGN_PRICE=0)');

  harness = await startTestServer({
    port: 34576,
    env: {
      ADMIN_PHONES: ADMIN_PHONE,
      REQUIRE_APPROVAL: 'false',
      EARLY_ACCESS_MINUTES: '0',
      CAMPAIGN_PRICE: '0',
    },
  });

  const freeBrand = harness.session('bepul brend');
  const freeBlogger = harness.session('bepul bloger');

  await freeBrand.post('/auth/register', {
    role: 'advertiser',
    phone: BRAND_PHONE,
    password: PASSWORD,
    name: 'Bepul Brend',
    category: 'Sport & Fitnes',
  });
  await freeBlogger.post('/auth/register', {
    role: 'blogger',
    phone: BLOGGER_PHONE,
    password: PASSWORD,
    name: 'Bepul Bloger',
    username: 'bepul_bloger',
    niche: 'Sport & Fitnes',
    followersCount: 40_000,
  });

  const freeConfig = await harness.session('mehmon').get('/config');
  check('narx 0 deb ko‘rsatiladi', freeConfig.data.campaignPrice === 0, freeConfig.data.campaignPrice);

  const freeCampaign = await freeBrand.post('/campaigns', {
    title: 'Bepul e‘lon',
    description: 'Sinov uchun',
    niche: 'Sport & Fitnes',
    requiredFollowersMin: 100,
  });
  check('e‘lon yaratildi', freeCampaign.status === 201, freeCampaign.data);
  check('to‘lov so‘ralmadi', freeCampaign.data.awaitingPayment === undefined, freeCampaign.data.awaitingPayment);
  check('to‘lov yozuvi yo‘q', freeCampaign.data.payment === undefined, freeCampaign.data.payment);
  check('darhol chop etildi', typeof freeCampaign.data.publishedAt === 'string', freeCampaign.data.publishedAt);

  const freeId = freeCampaign.data.id as string;
  const seenFree = (await freeBlogger.state()).campaigns.some((c: { id: string }) => c.id === freeId);
  check('bloger darhol ko‘radi', seenFree);
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
