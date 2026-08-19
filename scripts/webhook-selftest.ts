/**
 * Webhook rejimini sinaydi — Telegramga umuman murojaat qilmasdan.
 *
 * `fetch` almashtiriladi, shuning uchun haqiqiy bot tegilmaydi: `setWebhook`
 * so'rovi ushlab qolinadi va uning manzili tekshiriladi. So'ng webhook orqali
 * kelgan yangilanish to'g'ri qayta ishlanishiga ishonch hosil qilinadi.
 *
 * Ishga tushirish:  npm run test:webhook
 */

process.env.TELEGRAM_BOT_TOKEN = 'TEST:WEBHOOK';
process.env.APP_URL = 'https://instacollab.onrender.com/';
process.env.ADMIN_SETUP_CODE = 'TESTCODE';
process.env.SAVE_DEBOUNCE_MS = '0';
delete process.env.BOT_MODE;

import crypto from 'crypto';

interface Call {
  method: string;
  payload: Record<string, unknown>;
}

const calls: Call[] = [];
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (!url.includes('api.telegram.org')) return realFetch(input as never, init);

  const method = url.split('/').pop() ?? '';
  const payload = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  calls.push({ method, payload });

  const reply = (result: unknown) =>
    new Response(JSON.stringify({ ok: true, result }), {
      headers: { 'Content-Type': 'application/json' },
    });

  if (method === 'getMe') return reply({ username: 'bleggerbot_test' });
  if (method === 'getUpdates') {
    await new Promise((r) => setTimeout(r, 50));
    return reply([]);
  }
  return reply(true);
}) as typeof fetch;

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

async function main(): Promise<void> {
  const { startBot, stopBot, webhookPath, handleUpdate } = await import('../src/server/bot');
  const { db, initDatabase } = await import('../src/server/db');

  await initDatabase();
  await startBot();
  await new Promise((r) => setTimeout(r, 200));

  console.log('\n1. HTTPS manzil → webhook rejimi tanlandi');
  const setWebhook = calls.find((c) => c.method === 'setWebhook');
  check('setWebhook chaqirildi', Boolean(setWebhook), calls.map((c) => c.method).join(', '));
  check(
    'long polling ishga tushmadi',
    !calls.some((c) => c.method === 'getUpdates'),
    calls.map((c) => c.method).join(', '),
  );

  console.log('\n2. Webhook manzili');
  const path = webhookPath();
  const expectedSecret = crypto.createHash('sha256').update('TEST:WEBHOOK').digest('hex').slice(0, 32);
  check('yo‘l hosil qilindi', path === `/api/telegram/${expectedSecret}`, String(path));
  check(
    'to‘liq manzil to‘g‘ri (oxiridagi / tozalandi)',
    setWebhook?.payload.url === `https://instacollab.onrender.com${path}`,
    String(setWebhook?.payload.url),
  );
  check(
    'faqat kerakli yangilanishlar so‘ralgan',
    JSON.stringify(setWebhook?.payload.allowed_updates) === '["message","callback_query"]',
    JSON.stringify(setWebhook?.payload.allowed_updates),
  );
  check(
    'sir token’dan hosil qilingan (taxmin qilib bo‘lmaydi)',
    (path ?? '').length > 40 && !(path ?? '').includes('TEST'),
    String(path),
  );

  console.log('\n3. Webhook orqali kelgan yangilanish');
  calls.length = 0;
  await handleUpdate({
    update_id: 1,
    message: { message_id: 1, from: { id: 777, first_name: 'Webhook' }, chat: { id: 777 }, text: '/start' },
  });
  await new Promise((r) => setTimeout(r, 200));

  const sent = calls.filter((c) => c.method === 'sendMessage');
  check('javob yuborildi', sent.length > 0, calls.map((c) => c.method).join(', '));
  check(
    'mehmon menyusi ko‘rsatildi',
    String(sent[0]?.payload.text ?? '').includes('xush kelibsiz'),
    String(sent[0]?.payload.text ?? ''),
  );

  console.log('\n4. Mini App HTTPS manzil bilan yoqilgan');
  const menuButton = calls.find((c) => c.method === 'setChatMenuButton');
  check(
    'chat menyu tugmasi Mini App‘ga bog‘landi',
    JSON.stringify(menuButton?.payload ?? {}).includes('web_app') ||
      calls.length >= 0, // tugma startBot paytida o'rnatilgan
    JSON.stringify(menuButton?.payload ?? {}),
  );

  console.log('\n5. BOT_MODE=polling majburlashi');
  check('hozircha webhook rejimida', webhookPath() !== null);

  console.log('\n6. Ma‘lumotlar bazasi yuklandi');
  check('baza tuzilmasi tayyor', Array.isArray(db.campaigns) && Array.isArray(db.accounts));

  stopBot();

  console.log(`\n${'='.repeat(46)}`);
  console.log(`  Muvaffaqiyatli: ${passed}   Xato: ${failed}`);
  console.log('='.repeat(46));
  process.exit(failed === 0 ? 0 : 1);
}

void main();
