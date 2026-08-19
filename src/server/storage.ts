import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

import type { DatabaseShape } from '../types';

/**
 * Ma'lumotlarni saqlash qatlami.
 *
 * Ilovaning butun holati bitta JSON hujjat (bir necha yuz kilobayt) bo'lgani uchun
 * u xotirada to'liq turadi va har o'zgarishda yaxlit saqlanadi. Bu ikki xil joyga
 * yozilishi mumkin:
 *
 *   • `file`     — diskdagi `data/db.json` (mahalliy ishlab chiqish va o'z serveringiz);
 *   • `postgres` — `DATABASE_URL` berilganda (Render kabi diski saqlanmaydigan hostlar).
 *
 * Postgres varianti butun hujjatni bitta `jsonb` katakda saqlaydi — shuning uchun
 * ilova mantiqi umuman o'zgarmaydi, faqat yozish joyi almashadi.
 */
export interface Storage {
  readonly kind: 'file' | 'postgres';
  readonly location: string;
  load(): Promise<DatabaseShape | null>;
  save(db: DatabaseShape): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Fayl                                                                */
/* ------------------------------------------------------------------ */

class FileStorage implements Storage {
  readonly kind = 'file' as const;
  readonly location: string;
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
    this.location = path.join(dir, 'db.json');
  }

  async load(): Promise<DatabaseShape | null> {
    try {
      return JSON.parse(fs.readFileSync(this.location, 'utf-8')) as DatabaseShape;
    } catch {
      return null;
    }
  }

  /** Avval vaqtinchalik faylga, so'ng rename — yarim yozilgan fayl qolmaydi. */
  async save(db: DatabaseShape): Promise<void> {
    await fsp.mkdir(this.dir, { recursive: true });
    const tmp = `${this.location}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(db, null, 2), 'utf-8');
    await fsp.rename(tmp, this.location);
  }
}

/* ------------------------------------------------------------------ */
/* Postgres                                                            */
/* ------------------------------------------------------------------ */

export interface PgClient {
  query(text: string, values?: unknown[]): Promise<{ rows: { data: DatabaseShape }[] }>;
}

/** Ulanishni yaratuvchi funksiya — sinovlarda soxtasi bilan almashtiriladi. */
export type PgConnect = (url: string) => Promise<PgClient>;

const defaultConnect: PgConnect = async (url) => {
  // `pg` faqat Postgres ishlatilganda yuklanadi — mahalliy ishlashda kerak emas.
  const { default: pg } = (await import('pg')) as unknown as {
    default: { Pool: new (config: Record<string, unknown>) => PgClient };
  };

  return new pg.Pool({
    connectionString: url,
    // Neon, Supabase va Render Postgres — hammasi TLS talab qiladi.
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 30_000,
  });
};

export class PostgresStorage implements Storage {
  readonly kind = 'postgres' as const;
  readonly location: string;
  private pool: PgClient | null = null;
  private ready: Promise<void> | null = null;

  constructor(
    private readonly url: string,
    private readonly connect: PgConnect = defaultConnect,
  ) {
    // Parolni loglarga chiqarmaslik uchun faqat host nomini ko'rsatamiz.
    let host = 'postgres';
    try {
      host = new URL(url).host;
    } catch {
      /* manzilni o'qib bo'lmasa ham ishlayveramiz */
    }
    this.location = `postgres://${host}`;
  }

  private async client(): Promise<PgClient> {
    if (this.pool) return this.pool;

    this.pool = await this.connect(this.url);

    this.ready ??= this.pool
      .query(
        `CREATE TABLE IF NOT EXISTS instacollab_state (
           id         integer PRIMARY KEY,
           data       jsonb       NOT NULL,
           updated_at timestamptz NOT NULL DEFAULT now()
         )`,
      )
      .then(() => undefined);
    await this.ready;

    return this.pool;
  }

  async load(): Promise<DatabaseShape | null> {
    const client = await this.client();
    const result = await client.query('SELECT data FROM instacollab_state WHERE id = 1');
    return result.rows[0]?.data ?? null;
  }

  async save(db: DatabaseShape): Promise<void> {
    const client = await this.client();
    await client.query(
      `INSERT INTO instacollab_state (id, data, updated_at)
       VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [JSON.stringify(db)],
    );
  }
}

/* ------------------------------------------------------------------ */

/** `DATABASE_URL` bor bo'lsa Postgres, aks holda fayl. */
export function createStorage(): Storage {
  const url = process.env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) return new PostgresStorage(url);

  const dir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), 'data');
  return new FileStorage(dir);
}
