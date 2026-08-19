import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import { HttpError } from './validate';

/**
 * Rasmlar ombori — profil suratlari va brend logotiplari uchun.
 *
 * Rasmlar ASOSIY bazadan ALOHIDA saqlanadi. Sababi: platforma holati bitta JSON
 * hujjat bo'lib, har o'zgarishda yaxlit qayta yoziladi — rasmlar o'sha yerda
 * bo'lsa, har bir kichik o'zgarishda yuzlab kilobayt qayta yozilardi.
 *
 * Saqlash joyi holatnikiga mos tanlanadi:
 *   • `DATABASE_URL` bor bo'lsa — Postgres'dagi `instacollab_images` jadvali;
 *   • aks holda — `DATA_DIR/images/` katalogi.
 *
 * Fayl nomi mazmunning sha256 xeshidan olinadi: bir xil rasm ikki marta
 * saqlanmaydi va manzil o'zgarmas bo'lgani uchun brauzer uni abadiy keshlaydi.
 */

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB

const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/jpeg': {
    ext: 'jpg',
    magic: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  'image/png': {
    ext: 'png',
    magic: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  'image/webp': {
    ext: 'webp',
    magic: (b) =>
      b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  },
};

export interface StoredImage {
  id: string;
  mime: string;
  bytes: Buffer;
}

/**
 * Yuklangan faylni tekshiradi: turi qo'llab-quvvatlanadimi, hajmi joizmi va
 * mazmuni haqiqatan o'sha turdagi rasmmi (sarlavha baytlari bo'yicha).
 * Kengaytmaga emas, aynan mazmunga qaraymiz — soxta fayl o'tib ketmasligi uchun.
 */
export function validateImage(mime: string, bytes: Buffer): { mime: string; ext: string } {
  const type = TYPES[mime];
  if (!type) throw new HttpError(415, 'Faqat JPG, PNG yoki WEBP rasm yuklash mumkin');
  if (bytes.length === 0) throw new HttpError(400, 'Fayl bo\'sh');
  if (bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'Rasm hajmi 3 MB dan oshmasligi kerak');
  if (!type.magic(bytes)) throw new HttpError(400, 'Fayl mazmuni rasm emas yoki buzilgan');
  return { mime, ext: type.ext };
}

export function imageId(bytes: Buffer, ext: string): string {
  return `${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32)}.${ext}`;
}

/** `/api/images/<id>` manzilidagi id — faqat xesh va kengaytma bo'lishi mumkin. */
export function isValidImageId(id: string): boolean {
  return /^[0-9a-f]{32}\.(jpg|png|webp)$/.test(id);
}

export function mimeFromId(id: string): string {
  if (id.endsWith('.png')) return 'image/png';
  if (id.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

/* ------------------------------------------------------------------ */

export interface ImageStore {
  readonly kind: 'file' | 'postgres';
  save(image: StoredImage): Promise<void>;
  load(id: string): Promise<StoredImage | null>;
  exists(id: string): Promise<boolean>;
}

class FileImageStore implements ImageStore {
  readonly kind = 'file' as const;
  constructor(private readonly dir: string) {}

  private pathFor(id: string): string {
    return path.join(this.dir, id);
  }

  async save(image: StoredImage): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.pathFor(image.id), image.bytes);
  }

  async load(id: string): Promise<StoredImage | null> {
    try {
      const bytes = await fs.readFile(this.pathFor(id));
      return { id, mime: mimeFromId(id), bytes };
    } catch {
      return null;
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      await fs.access(this.pathFor(id));
      return true;
    } catch {
      return false;
    }
  }
}

interface PgLike {
  query(text: string, values?: unknown[]): Promise<{ rows: { mime: string; bytes: Buffer }[] }>;
}

class PostgresImageStore implements ImageStore {
  readonly kind = 'postgres' as const;
  private pool: PgLike | null = null;
  private ready: Promise<void> | null = null;

  constructor(private readonly url: string) {}

  private async client(): Promise<PgLike> {
    if (this.pool) return this.pool;

    const { default: pg } = (await import('pg')) as unknown as {
      default: { Pool: new (config: Record<string, unknown>) => PgLike };
    };
    this.pool = new pg.Pool({
      connectionString: this.url,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30_000,
    });

    this.ready ??= this.pool
      .query(
        `CREATE TABLE IF NOT EXISTS instacollab_images (
           id         text PRIMARY KEY,
           mime       text  NOT NULL,
           bytes      bytea NOT NULL,
           created_at timestamptz NOT NULL DEFAULT now()
         )`,
      )
      .then(() => undefined);
    await this.ready;

    return this.pool;
  }

  async save(image: StoredImage): Promise<void> {
    const client = await this.client();
    await client.query(
      `INSERT INTO instacollab_images (id, mime, bytes) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [image.id, image.mime, image.bytes],
    );
  }

  async load(id: string): Promise<StoredImage | null> {
    const client = await this.client();
    const result = await client.query('SELECT mime, bytes FROM instacollab_images WHERE id = $1', [id]);
    const row = result.rows[0];
    return row ? { id, mime: row.mime, bytes: row.bytes } : null;
  }

  async exists(id: string): Promise<boolean> {
    const client = await this.client();
    const result = await client.query('SELECT mime, bytes FROM instacollab_images WHERE id = $1', [id]);
    return result.rows.length > 0;
  }
}

let store: ImageStore | null = null;

export function imageStore(): ImageStore {
  if (store) return store;

  const url = process.env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    store = new PostgresImageStore(url);
  } else {
    const dir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), 'data');
    store = new FileImageStore(path.join(dir, 'images'));
  }
  return store;
}
