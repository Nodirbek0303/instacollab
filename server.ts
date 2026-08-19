// MUHIM: bu import birinchi bo'lishi kerak — qolgan modullar muhit o'zgaruvchilarini o'qiydi.
import './src/server/env';

import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';

import type { Account } from './src/types';
import { accountByPhone, db, flush, initDatabase, makeId, persist, storageInfo } from './src/server/db';
import { hashPassword } from './src/server/auth';
import { api, startCleanupTimer } from './src/server/api';
import { handleUpdate, startBot, stopBot, webhookPath } from './src/server/bot';
import { HttpError, normalizePhone } from './src/server/validate';

const PORT = Number(process.env.PORT) || 3000;
/**
 * Teskari proksi ortida `127.0.0.1` bo'ladi — shunda ilovaga faqat proksi orqali
 * (ya'ni HTTPS bilan) murojaat qilinadi va portni tashqaridan ochib bo'lmaydi.
 */
const HOST = process.env.HOST || '0.0.0.0';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEMO_PASSWORD = 'demo1234';

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
/* Demo hisoblar (faqat dasturchi rejimida)                            */
/* ------------------------------------------------------------------ */

/**
 * Dasturchi rejimida seed profillar uchun demo hisoblar ochiladi, shunda
 * ilovani darhol sinab ko'rish mumkin. Ishlab chiqarishda ular yaratilmaydi.
 */
async function ensureDemoAccounts(): Promise<void> {
  if (IS_PRODUCTION || db.accounts.length > 0) return;

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const accounts: Account[] = [];

  const add = (phoneRaw: string | undefined, role: Account['role'], profileId: string) => {
    const phone = normalizePhone(phoneRaw);
    if (!phone || accounts.some((a) => a.phone === phone) || accountByPhone(phone)) return;
    accounts.push({
      id: makeId('acc'),
      phone,
      passwordHash,
      role,
      profileId,
      createdAt: new Date().toISOString(),
    });
  };

  for (const brand of db.brands) add(brand.phone, 'advertiser', brand.id);
  for (const blogger of db.bloggers) add(blogger.phone, 'blogger', blogger.id);

  db.accounts = accounts;
  await persist();
  console.log(`[demo] ${accounts.length} ta demo hisob ochildi. Umumiy parol: ${DEMO_PASSWORD}`);
}

/* ------------------------------------------------------------------ */
/* Vite (dev) yoki statik fayllar (prod)                               */
/* ------------------------------------------------------------------ */

async function startServer() {
  await initDatabase();
  const store = storageInfo();
  console.log(`Ma'lumotlar: ${store.kind} (${store.location})`);

  await ensureDemoAccounts();
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
}

void startServer();
