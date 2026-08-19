/**
 * Muhit o'zgaruvchilarini boshqa modullardan OLDIN yuklaydi.
 *
 * ES-modullarda importlar modul tanasidan oldin bajariladi, shuning uchun
 * `dotenv.config()` ni `server.ts` ichida chaqirish kech bo'lardi: `db.ts` kabi
 * modullar `process.env` ni allaqachon o'qib bo'lgan bo'lardi. Bu fayl birinchi
 * import sifatida yoziladi va muammoni butunlay yo'q qiladi.
 */
import dotenv from 'dotenv';

dotenv.config();
