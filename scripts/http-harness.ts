/**
 * HTTP orqali sinov o'tkazish uchun umumiy yordamchi.
 *
 * Haqiqiy serverni ko'taradi va unga tashqaridan so'rov yuboradi — ya'ni
 * cheklovlar interfeysda emas, serverda ishlashini tekshiradi. Ichki
 * funksiyalarni chaqirib sinash bunday kafolat bermaydi.
 *
 * `npm run build` dan keyin ishlaydi: `dist/server.cjs` ishga tushiriladi.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface Harness {
  base: string;
  stop: () => void;
  session: (label?: string) => Session;
}

export interface ApiResponse<T = any> {
  status: number;
  data: T;
}

/** Bitta foydalanuvchi sessiyasi — cookie'ni o'zi eslab qoladi. */
export class Session {
  private cookie = '';

  constructor(
    private readonly base: string,
    readonly label: string,
  ) {}

  async request<T = any>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.base}${path}`, {
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
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* JSON bo'lmasa matn qaytadi */
    }
    return { status: response.status, data: data as T };
  }

  get(path: string) {
    return this.request('GET', path);
  }

  post(path: string, body?: unknown) {
    return this.request('POST', path, body);
  }

  patch(path: string, body?: unknown) {
    return this.request('PATCH', path, body);
  }

  state() {
    return this.get('/state').then((r) => r.data);
  }
}

/**
 * Serverni vaqtinchalik katalogda ko'taradi.
 *
 * `env` orqali qo'shimcha sozlamalar beriladi (masalan `ADMIN_PHONES`).
 * Postgres va Telegram o'chirilgan — sinov tashqi xizmatlarga tegmaydi.
 */
export async function startTestServer(options: {
  port: number;
  env?: Record<string, string>;
}): Promise<Harness> {
  const dataDir = mkdtempSync(join(tmpdir(), 'instacollab-test-'));
  const base = `http://127.0.0.1:${options.port}/api`;

  const child: ChildProcess = spawn('node', ['dist/server.cjs'], {
    env: {
      ...process.env,
      PORT: String(options.port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      DATABASE_URL: '',
      TELEGRAM_BOT_TOKEN: '',
      NODE_ENV: 'production',
      ...options.env,
    },
    stdio: 'ignore',
  });

  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) {
        const body = (await response.json()) as { status?: string };
        if (body.status === 'ok') {
          return {
            base,
            stop: () => {
              child.kill('SIGKILL');
              rmSync(dataDir, { recursive: true, force: true });
            },
            session: (label = 'sinov') => new Session(base, label),
          };
        }
      }
    } catch {
      /* hali ko'tarilmadi */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  child.kill('SIGKILL');
  rmSync(dataDir, { recursive: true, force: true });
  throw new Error('Server ko‘tarilmadi');
}

/** Oddiy sanagich — har bir sinov fayli o'zinikini yaratadi. */
export function createChecker() {
  let passed = 0;
  let failed = 0;

  return {
    check(name: string, ok: boolean, detail?: unknown): void {
      if (ok) {
        passed++;
        console.log(`  ✓ ${name}`);
      } else {
        failed++;
        console.log(`  ✗ ${name}`);
        if (detail !== undefined) console.log(`      ${JSON.stringify(detail)}`);
      }
    },
    fail(): void {
      failed++;
    },
    report(): number {
      console.log('\n==============================================');
      console.log(`  Muvaffaqiyatli: ${passed}   Xato: ${failed}`);
      console.log('==============================================\n');
      return failed;
    },
  };
}
