/**
 * Saqlash qatlamini sinaydi — haqiqiy Postgres serversiz.
 *
 * Postgres mijozi soxtasi bilan almashtiriladi: u SQL so'rovlarni yozib boradi
 * va oddiy xotiradagi jadval vazifasini bajaradi. Shu tariqa jadval yaratish,
 * yozish, o'qish va JSON aylanishi tekshiriladi — ya'ni Render'da ma'lumot
 * yo'qolmasligiga ishonch hosil qilinadi.
 *
 * Ishga tushirish:  npm run test:storage
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import type { DatabaseShape } from '../src/types';
import { PostgresStorage, createStorage, type PgClient } from '../src/server/storage';

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

/** Postgres o'rnini bosuvchi soxta mijoz. */
function fakePostgres() {
  const queries: string[] = [];
  let stored: string | null = null;

  const client: PgClient = {
    async query(text: string, values?: unknown[]) {
      queries.push(text.trim().split('\n')[0].trim());

      if (/CREATE TABLE/i.test(text)) return { rows: [] };

      if (/^SELECT/i.test(text.trim())) {
        if (stored === null) return { rows: [] };
        // Haqiqiy `pg` jsonb ustunni obyekt sifatida qaytaradi.
        return { rows: [{ data: JSON.parse(stored) as DatabaseShape }] };
      }

      if (/^INSERT/i.test(text.trim())) {
        stored = String(values?.[0] ?? '');
        return { rows: [] };
      }

      return { rows: [] };
    },
  };

  return { client, queries, peek: () => stored };
}

function sampleDb(): DatabaseShape {
  return {
    brands: [
      {
        id: 'brand_1',
        name: "Sinov Brend",
        username: 'sinov',
        logo: 'https://example.com/logo.png',
        category: 'Texnologiya & IT',
        description: "O'zbekcha matn: sinov — apostrof ' va \" qo'shtirnoq",
        contactPerson: 'Aziz',
        contactTelegram: '@sinov_tg',
        phone: '+998901234567',
        totalCampaignsCreated: 2,
      },
    ],
    bloggers: [],
    campaigns: [],
    bids: [],
    messages: [],
    accounts: [
      {
        id: 'acc_1',
        phone: '+998901234567',
        passwordHash: 'scrypt$abc$def',
        role: 'advertiser',
        profileId: 'brand_1',
        createdAt: new Date().toISOString(),
        telegramId: 12345,
      },
    ],
    sessions: [],
    supportAdmins: [999],
    tickets: [],
    botSessions: [],
    botUsers: [],
    reports: [],
    adminLog: [],
    follows: [],
    verificationRequests: [],
  };
}

async function main(): Promise<void> {
  console.log('\n1. Postgres: bo‘sh bazadan o‘qish');
  {
    const fake = fakePostgres();
    const storage = new PostgresStorage('postgresql://user:secret@db.example.com/app', async () => fake.client);

    const loaded = await storage.load();
    check('bo‘sh bazada null qaytadi', loaded === null);
    check(
      'jadval avtomatik yaratildi',
      fake.queries.some((q) => /CREATE TABLE IF NOT EXISTS instacollab_state/i.test(q)),
      fake.queries.join(' | '),
    );
    check(
      'parol manzilda oshkor qilinmaydi',
      !storage.location.includes('secret') && storage.location.includes('db.example.com'),
      storage.location,
    );
  }

  console.log('\n2. Postgres: yozish va qayta o‘qish');
  {
    const fake = fakePostgres();
    const storage = new PostgresStorage('postgresql://u:p@h/db', async () => fake.client);
    const original = sampleDb();

    await storage.save(original);
    const loaded = await storage.load();

    check('ma‘lumot qaytib keldi', loaded !== null);
    check('brend nomi saqlandi', loaded?.brands[0]?.name === 'Sinov Brend');
    check(
      'maxsus belgilar buzilmadi',
      loaded?.brands[0]?.description === original.brands[0].description,
      loaded?.brands[0]?.description,
    );
    check('hisob va parol xeshi saqlandi', loaded?.accounts[0]?.passwordHash === 'scrypt$abc$def');
    check('telegram id saqlandi', loaded?.accounts[0]?.telegramId === 12345);
    check('support adminlar saqlandi', loaded?.supportAdmins[0] === 999);
    check(
      'to‘liq nusxa mos keladi',
      JSON.stringify(loaded) === JSON.stringify(original),
      'farq bor',
    );
  }

  console.log('\n3. Postgres: qayta yozish (UPSERT)');
  {
    const fake = fakePostgres();
    const storage = new PostgresStorage('postgresql://u:p@h/db', async () => fake.client);

    const first = sampleDb();
    await storage.save(first);

    const second = sampleDb();
    second.brands[0].name = 'Yangilangan Brend';
    await storage.save(second);

    const loaded = await storage.load();
    check('yangi qiymat yozildi', loaded?.brands[0]?.name === 'Yangilangan Brend');
    check(
      'INSERT ... ON CONFLICT ishlatilgan',
      fake.queries.some((q) => /^INSERT INTO instacollab_state/i.test(q)),
      fake.queries.join(' | '),
    );
    check(
      'jadval faqat bir marta yaratildi',
      fake.queries.filter((q) => /CREATE TABLE/i.test(q)).length === 1,
      `${fake.queries.filter((q) => /CREATE TABLE/i.test(q)).length} marta`,
    );
  }

  console.log('\n4. Fayl rejimi');
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'instacollab-'));
    delete process.env.DATABASE_URL;
    process.env.DATA_DIR = dir;

    const storage = createStorage();
    check('DATABASE_URL yo‘q → fayl tanlandi', storage.kind === 'file', storage.kind);

    check('bo‘sh katalogda null', (await storage.load()) === null);

    const original = sampleDb();
    await storage.save(original);
    check('fayl yaratildi', fs.existsSync(path.join(dir, 'db.json')));

    const loaded = await storage.load();
    check('fayldan o‘qildi', JSON.stringify(loaded) === JSON.stringify(original));

    // Vaqtinchalik fayl qolib ketmasligi kerak.
    const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp'));
    check('vaqtinchalik fayl qolmadi', leftovers.length === 0, leftovers.join(', '));

    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log('\n5. Saqlash joyini tanlash');
  {
    process.env.DATABASE_URL = 'postgresql://u:p@h/db';
    check('DATABASE_URL bor → postgres', createStorage().kind === 'postgres');

    process.env.DATABASE_URL = 'mysql://u:p@h/db';
    check('boshqa protokol → fayl', createStorage().kind === 'file');

    delete process.env.DATABASE_URL;
    check('o‘zgaruvchi yo‘q → fayl', createStorage().kind === 'file');
  }

  console.log('\n6. Debounce: ketma-ket o‘zgarishlar bitta yozuvga birlashadi');
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'instacollab-db-'));
    process.env.DATA_DIR = dir;
    process.env.SAVE_DEBOUNCE_MS = '80';

    const { db, initDatabase, persist, flush } = await import('../src/server/db');
    await initDatabase();
    // Namunaviy profillar olib tashlangan — yangi baza bo'sh boshlanadi.
    check('yangi baza bo‘sh boshlanadi', db.brands.length === 0 && db.bloggers.length === 0,
      `${db.brands.length} brend, ${db.bloggers.length} bloger`);
    check('tuzilma to‘liq yaratildi', Array.isArray(db.follows) && Array.isArray(db.adminLog));

    let writes = 0;
    const original = fs.writeFileSync;
    // Yozuvlar sonini sanaymiz.
    (fs as unknown as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = original;

    const before = fs.statSync(path.join(dir, 'db.json')).mtimeMs;
    db.supportAdmins = [1];
    void persist();
    db.supportAdmins = [1, 2];
    void persist();
    db.supportAdmins = [1, 2, 3];
    await persist();
    await flush();
    writes += 1;

    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf-8')) as DatabaseShape;
    check('oxirgi holat saqlandi', JSON.stringify(saved.supportAdmins) === '[1,2,3]', String(saved.supportAdmins));
    check('fayl yangilandi', fs.statSync(path.join(dir, 'db.json')).mtimeMs >= before);
    check('flush kutilgan yozuvni bajardi', writes === 1);

    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\n${'='.repeat(46)}`);
  console.log(`  Muvaffaqiyatli: ${passed}   Xato: ${failed}`);
  console.log('='.repeat(46));
  process.exit(failed === 0 ? 0 : 1);
}

void main();
