// MUHIM: bu import birinchi bo'lishi kerak — qolgan modullar muhit o'zgaruvchilarini o'qiydi.
import './src/server/env';

import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';

import { db, flush, initDatabase, persist, storageInfo } from './src/server/db';
import { api, startCleanupTimer } from './src/server/api';
import { handleUpdate, startBot, stopBot, webhookPath } from './src/server/bot';
import { HttpError } from './src/server/validate';
import { adminPhones, syncSupportAdmins } from './src/server/admin';

const PORT = Number(process.env.PORT) || 3000;
/**
 * Teskari proksi ortida `127.0.0.1` bo'ladi — shunda ilovaga faqat proksi orqali
 * (ya'ni HTTPS bilan) murojaat qilinadi va portni tashqaridan ochib bo'lmaydi.
 */
const HOST = process.env.HOST || '0.0.0.0';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const app = express();
app.disable('x-powered-by');

/**
 * Nginx/Caddy kabi teskari proksi ortida ishlaganda:
 *  • `req.ip` haqiqiy mijoz IP'sini beradi — rate-limit har bir foydalanuvchiga
 *    alohida qo'llanadi, aks holda hammasi bitta proksi IP'siga tushib qolardi;
 *  • `req.secure` HTTPS ekanini to'g'ri aniqlaydi — cookie `Secure` bayrog'ini oladi.
 */
if (process.env.TRUST_PROXY !== 'false') {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}

app.use(express.json({ limit: '100kb' }));

/**
 * Server portni darhol ochadi, baza esa fonda ulanadi (pastdagi izohga qarang).
 * Shu qisqa oraliqda kelgan so'rovlarga tushunarli javob beramiz — yarim
 * ishlaydigan API'dan ko'ra ochiq-oydin "kutib turing" yaxshiroq.
 */
let isReady = false;

app.use((req, res, next) => {
  if (isReady) {
    next();
    return;
  }

  if (req.path === '/api/health') {
    res.json({ status: 'starting', time: new Date().toISOString() });
    return;
  }

  if (req.path.startsWith('/api/')) {
    res.status(503).json({ error: "Server ishga tushmoqda, bir necha soniyadan so'ng urinib ko'ring." });
    return;
  }

  res
    .status(503)
    .type('html')
    .send(
      '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="3">' +
        '<title>InstaCollab UZ</title>' +
        '<div style="font:600 15px system-ui;display:grid;place-items:center;height:90vh;color:#3b0764">' +
        'Server ishga tushmoqda…</div>',
    );
});

app.use('/api', api);

/**
 * Telegram webhook. Manzilning maxfiy qismi bot tokenidan hosil qilinadi,
 * shuning uchun uni faqat Telegram biladi.
 *
 * Javob darhol qaytariladi — Telegram kutib turmasligi kerak, aks holda
 * yangilanishni qayta-qayta yuboraveradi.
 */
app.post('/api/telegram/:secret', (req, res) => {
  const expected = webhookPath();
  if (!expected || req.path !== expected) {
    res.status(404).json({ error: "Bunday API manzili yo'q" });
    return;
  }
  res.status(200).end();
  void handleUpdate(req.body);
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: "Bunday API manzili yo'q" });
});

/* ------------------------------------------------------------------ */
/* Xatolarni bir joyda ushlash                                         */
/* ------------------------------------------------------------------ */

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error('[api] kutilmagan xatolik:', error);
  res.status(500).json({ error: "Serverda kutilmagan xatolik yuz berdi. Birozdan so'ng qayta urinib ko'ring." });
});

/* ------------------------------------------------------------------ */
/* Vite (dev) yoki statik fayllar (prod)                               */
/* ------------------------------------------------------------------ */

async function startServer() {
  /**
   * MUHIM: port birinchi ochiladi, baza keyin ulanadi.
   *
   * Neon/Render bepul tarifda baza uxlab qolgan bo'lsa, unga ulanish bir necha
   * daqiqaga cho'zilishi mumkin. Ilgari `listen()` shundan keyin chaqirilardi —
   * natijada Render "port ochilmadi" deb deploy'ni bekor qilardi. Endi port
   * darhol ochiladi, tayyor bo'lmaguncha yuqoridagi darvoza javob beradi.
   */
  const server = app.listen(PORT, HOST, () => {
    console.log(`InstaCollab server: http://${HOST}:${PORT}`);
  });

  /**
   * To'xtatilganda (systemd restart, deploy) botni to'xtatib, yozilmagan
   * ma'lumotlarni diskka tushiramiz — shunda hech narsa yo'qolmaydi.
   */
  const shutdown = (signal: string) => {
    console.log(`\n[server] ${signal} — to'xtatilmoqda…`);
    stopBot();
    server.close(() => {
      void flush().then(() => process.exit(0));
    });
    // Ulanishlar yopilmasa ham 10 soniyadan keyin majburan chiqamiz.
    setTimeout(() => process.exit(0), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await initDatabase();
  const store = storageInfo();
  console.log(`Ma'lumotlar: ${store.kind} (${store.location})`);

  /**
   * Admin ro'yxatini `.env` bilan moslaymiz. `ADMIN_PHONES` o'zgartirilsa,
   * eski adminlar shu yerda huquqdan mahrum bo'ladi — bazani qo'lda
   * tahrirlash kerak emas.
   */
  const allowed = adminPhones();
  if (allowed.length > 0) {
    const before = db.supportAdmins.length;
    const { kept } = syncSupportAdmins();
    if (before !== kept) await persist();
    console.log(`[admin] ruxsat etilgan raqamlar: ${allowed.join(', ')} (botga ulangan: ${kept})`);
  } else {
    console.log('[admin] ADMIN_PHONES berilmagan — adminlar botdagi /admin kodi orqali tayinlanadi.');
  }

  startCleanupTimer();

  // Bot ishga tushadi: HTTPS bo'lsa webhook, aks holda long polling.
  await startBot();

  if (!IS_PRODUCTION) {
    // Vite faqat dasturchi rejimida kerak va u `devDependencies` da.
    // Shuning uchun dinamik import: ishlab chiqarishda bu qator umuman bajarilmaydi
    // va `npm prune --omit=dev` dan keyin ham server ishga tushaveradi.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  isReady = true;
  console.log('[server] tayyor.');
}

/**
 * Ishga tushishda xatolik bo'lsa jarayonni tugatamiz — platforma qayta urinadi.
 * Yarim tirik holatda qolib ketgandan ko'ra ochiq yiqilgan yaxshiroq.
 */
startServer().catch((error) => {
  console.error('[server] ishga tushirib bo\'lmadi:', error);
  process.exit(1);
});
