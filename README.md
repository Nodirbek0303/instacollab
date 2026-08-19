# InstaCollab UZ

Instagram blogerlari va reklama beruvchilarni bog'lovchi platforma: bloger katalogi va statistikasi,
reklama e'lonlari bozori, arizalar, sayt ichidagi chat va to'g'ridan-to'g'ri aloqa (Telegram / Instagram / telefon).

## Akaunt turlari

Har bir foydalanuvchining **bitta hisobi** bo'ladi va uning turi ro'yxatdan o'tishda tanlanadi:

| Tur | Kim | Nima qila oladi |
| --- | --- | --- |
| **Reklama beruvchi** | Brend, do'kon, xizmat | E'lon joylaydi, kelgan arizalarni ko'rib chiqadi va tasdiqlaydi, blogerlar bilan bog'lanadi |
| **Bloger** | Instagram sahifa egasi | Media kit yuritadi, e'lonlarga ariza yuboradi, brendlar bilan yozishadi |

Tur keyin o'zgartirilmaydi. Ikkinchi turdagi hisob kerak bo'lsa, boshqa telefon raqami bilan alohida
ro'yxatdan o'tiladi. Kirish **telefon raqami + parol** orqali; parollar `scrypt` bilan xeshlanadi va hech
qachon ochiq saqlanmaydi. Sessiya `HttpOnly` cookie'da 30 kun saqlanadi.

Server har bir amalni sessiya bo'yicha tekshiradi, masalan:

- bloger e'lon joylay olmaydi, reklama beruvchi ariza yubora olmaydi;
- e'lonni faqat uni joylagan brend o'chira oladi;
- arizani faqat o'sha e'lon egasi tasdiqlay oladi;
- profilni faqat egasi tahrirlay oladi;
- tizimga kirmagan odam hech qanday ma'lumotni ko'ra olmaydi.

## Telegram bot

Platformaning ikkinchi kirish nuqtasi. Bot `TELEGRAM_BOT_TOKEN` berilganda avtomatik ishga tushadi
(long polling), token bo'lmasa sayt baribir ishlayveradi.

### Kim nima qila oladi

| Rol | Botdagi imkoniyatlar |
| --- | --- |
| **Mehmon** | Ro'yxatdan o'tish, mavjud hisobni ulash, parolni tiklash so'rovi |
| **Reklama beruvchi** | Blogerlar katalogi (kontaktlari bilan), o'z e'lonlari, kelgan arizalarni ko'rish va bir bosishda tasdiqlash/rad etish |
| **Bloger** | Reklama e'lonlari katalogi, to'g'ridan-to'g'ri botdan ariza yuborish, o'z arizalari holati |
| **Support** | Ochiq murojaatlar, parolni tiklash (tugma yoki raqam orqali), platforma statistikasi |

### Xavfsizlik: botda parol so'ralmaydi

Telefon raqami Telegramning «kontaktni ulashish» tugmasi orqali olinadi va `contact.user_id` yuboruvchining
o'zi ekani tekshiriladi — bu SMS tasdiqlash bilan bir xil kuchga ega. Shuning uchun:

- **ro'yxatdan o'tishda** parolni bot o'zi yaratadi va bir marta yuboradi (foydalanuvchi keyin saytda o'zgartiradi);
- **hisobni ulashda** parol umuman kerak emas — raqam tasdig'i yetarli;
- foydalanuvchining shaxsiy paroli hech qachon chat tarixida qolmaydi.

### Support (yordam xizmati)

Birinchi admin bir martalik kod bilan tayinlanadi. `.env` dagi `ADMIN_SETUP_CODE` ni oling va botga yozing:

```
/admin SIZNING_KODINGIZ
```

Shundan keyin support paneli ochiladi. Parolni tiklash ikki yo'l bilan ishlaydi:

1. **Foydalanuvchi Telegramga ulangan** → raqamini tasdiqlaydi va yangi parolni **darhol** oladi
   (support kutish shart emas). Eski sessiyalar bekor qilinadi.
2. **Ulanmagan** → murojaat ochiladi, support adminlariga bildirishnoma boradi. Admin «✅ Parolni tiklash»
   tugmasini bossa, yangi parol foydalanuvchiga yuboriladi va murojaat yopiladi.

Support raqam bo'yicha ham tiklay oladi: «🔑 Parolni tiklash» → telefon raqamini yuborish.

### Bildirishnomalar (sayt → Telegram)

- blogerdan yangi ariza kelsa — reklama beruvchiga;
- ariza tasdiqlansa/rad etilsa — blogerga;
- chatda yangi xabar kelsa — qabul qiluvchiga;
- yangi e'lon joylansa — o'sha yo'nalishdagi va talabga mos blogerlarga.

### Telegram Mini App (panel bot ichida)

Bot menyusidagi **«🚀 Panelni ochish»** tugmasi saytni Telegramning o'zida ochadi.
Panel ochilganda Telegram imzolangan `initData` uzatadi — server uni bot tokeni bilan
HMAC-SHA256 orqali tekshiradi va **parol so'ramasdan** sessiya ochadi.

Bu faqat `APP_URL` `https://` bilan boshlanganda yoqiladi (Telegram talabi). Mahalliy
ishlab chiqishda (`http://localhost`) tugma oddiy havolaga aylanadi — hech narsa buzilmaydi.

### Botdan panelga o'tish (deep-link)

Bot tugmalari panelni kerakli ekranda ochadi:

| Tugma | Manzil | Natija |
| --- | --- | --- |
| 📣 Reklama joylash | `/?action=new-campaign` | E'lon berish formasi darhol ochiladi |
| 🌐 Panelda ochish | `/?campaign=<id>` | O'sha e'lon ro'yxatda ajratib ko'rsatiladi |
| 🚀 Panelni ochish | `/` | Odatiy panel |

Manzil qatori bir marta bajarilgach tozalanadi — sahifa yangilanganda takrorlanmaydi.

### Botni sinash

```bash
npm run test:bot
```

Telegramga ulanmasdan, `fetch` almashtirilgan holda butun suhbat mantiqini tekshiradi:
ro'yxatdan o'tish, katalog, ariza, takroriy ariza, support tayinlash, parolni tiklashning
ikkala yo'li, ruxsat tekshiruvlari, Mini App tugmalari va `initData` imzosi (buzilgan,
o'zgartirilgan, eskirgan holatlar bilan) — jami **45 ta tekshiruv**.

## Texnologiyalar

- **Frontend:** React 19 + TypeScript (strict) + Vite 6 + Tailwind CSS 4
- **Backend:** Express — REST API, cookie'ga asoslangan sessiya
- **Bot:** Telegram Bot API, kutubxonasiz (long polling + `fetch`)
- **Ma'lumotlar:** `DATABASE_URL` berilsa Postgres (`jsonb`), aks holda `data/db.json` fayli;
  brauzerda esa `localStorage` keshi

## Serverga joylash

To'liq qo'llanma: **[DEPLOY.md](DEPLOY.md)**.

**Render (tavsiya, tekin):** kodni GitHub'ga yuklab, Render'da Blueprint sifatida ochasiz.
`render.yaml` allaqachon tayyor. Uchta o'zgaruvchi kiritiladi: `TELEGRAM_BOT_TOKEN`,
`ADMIN_SETUP_CODE` va `DATABASE_URL` (tekin Postgres — [Neon](https://neon.tech)).

**O'z serveringiz / VPS:**

```bash
sudo bash deploy/check.sh                                   # tekshirish (o'zgartirmaydi)
sudo DOMAIN=instacollab.example.uz bash deploy/install.sh   # o'rnatish
```

Serverda boshqa loyihalar ishlayotgan bo'lsa ham xavfsiz: tizimdagi Node versiyasi mos bo'lsa
tegilmaydi, mavjud Nginx/Caddy o'rnini bosmaydi, ilova `127.0.0.1` da tinglaydi.

## Ishga tushirish (mahalliy)

```bash
npm install
npm run dev      # http://localhost:3000
```

Birinchi ishga tushirishda `data/db.json` fayli `src/data/seed.ts` dagi boshlang'ich ma'lumotlar bilan
avtomatik yaratiladi. Keyingi barcha o'zgarishlar shu faylda saqlanadi — sahifani yangilaganda yo'qolmaydi.

Ma'lumotlarni noldan boshlash uchun: `rm -rf data/`

### Demo hisoblar (faqat dasturchi rejimida)

`NODE_ENV=production` bo'lmaganda, seed profillar uchun demo hisoblar avtomatik ochiladi:
login — profilning telefon raqami, parol — `demo1234`. Masalan:

- `+998 90 123-45-67` — NeoStore Texnika (reklama beruvchi)
- `+998 90 777-11-22` — @shahzod_tech (bloger)

Ishlab chiqarishda (`npm start`) bu hisoblar **yaratilmaydi**. Agar `data/db.json` dev rejimida
yaratilgan bo'lsa, uni serverga chiqarishdan oldin o'chiring: `rm -rf data/`

## Boshqa buyruqlar

```bash
npm run lint          # TypeScript tekshiruvi (tsc --noEmit)
npm test              # barcha sinovlar (saqlash + bot)
npm run test:storage  # saqlash qatlami: Postgres va fayl (25 ta tekshiruv)
npm run test:bot      # Telegram bot mantiqi (54 ta tekshiruv)
npm run build         # frontend + server bundle -> dist/
npm start             # tayyor bundle'ni ishga tushirish
```

## API

| Metod | Manzil | Kirish talabi | Vazifasi |
| --- | --- | --- | --- |
| `GET` | `/api/health` | — | Server holati |
| `POST` | `/api/auth/register` | — | Yangi hisob (turi bilan) |
| `POST` | `/api/auth/login` | — | Kirish |
| `POST` | `/api/auth/telegram` | — | Telegram Mini App orqali parolsiz kirish |
| `POST` | `/api/auth/logout` | — | Chiqish |
| `GET` | `/api/auth/me` | sessiya | Joriy hisob va profil |
| `GET` | `/api/state` | sessiya | Platforma ma'lumotlari |
| `PATCH` | `/api/brands/:id` | brend egasi | Brend profilini yangilash |
| `PATCH` | `/api/bloggers/:id` | profil egasi | Bloger profilini yangilash |
| `POST` | `/api/campaigns` | reklama beruvchi | Yangi e'lon |
| `DELETE` | `/api/campaigns/:id` | e'lon egasi | E'lonni o'chirish |
| `POST` | `/api/bids` | bloger | Ariza yuborish |
| `PATCH` | `/api/bids/:id` | e'lon egasi | Ariza holatini o'zgartirish |
| `POST` | `/api/auth/password` | sessiya | Parolni o'zgartirish |
| `GET` | `/api/config` | — | Ochiq sozlamalar (bot manzili, demo rejimi) |
| `POST` | `/api/images` | sessiya | Profil rasmini yuklash (JPG/PNG/WEBP) |
| `GET` | `/api/images/:id` | — | Rasmni berish (abadiy keshlanadi) |
| `POST` | `/api/messages` | sessiya | Chat xabari |

Barcha yozuv so'rovlari validatsiyadan o'tadi, uzunligi cheklanadi va IP bo'yicha rate-limit qo'llanadi
(kirish/ro'yxat uchun alohida, qattiqroq chegara).

## Profil rasmlari

Bloger avatarini va brend logotipini to'g'ridan-to'g'ri yuklash mumkin — telefondan yoki
kompyuterdan. Rasm **brauzerda** kvadrat qilib qirqiladi va 512×512 gacha kichraytiriladi
(JPEG, sifat 0.85), shundan keyingina serverga yuboriladi: 1600×1200 PNG odatda ~141 KB dan
~8 KB ga tushadi.

Rasmlar asosiy bazadan **alohida** saqlanadi (`instacollab_images` jadvali yoki `DATA_DIR/images/`).
Sababi: platforma holati bitta JSON hujjat bo'lib, har o'zgarishda yaxlit qayta yoziladi —
rasmlar o'sha yerda bo'lsa, har bir kichik o'zgarishda yuzlab kilobayt qayta yozilardi.

Fayl nomi mazmunning sha256 xeshidan olinadi: bir xil rasm ikki marta saqlanmaydi va manzil
o'zgarmas bo'lgani uchun brauzer uni bir yil keshlaydi.

Server tekshiruvlari: tur (faqat JPG/PNG/WEBP), hajm (3 MB gacha) va **sarlavha baytlari** —
ya'ni `.png` deb nomlangan matn fayli o'tib ketmaydi.

## Real vaqtda yangilanish

Sahifani qo'lda yangilash kerak emas. Kirgandan keyin brauzer `GET /api/events`
manziliga bitta uzoq ulanish ochadi (Server-Sent Events) va server har bir
o'zgarishni o'zi yuboradi: yangi e'lon, ariza, ariza holati, chat xabari,
profil o'zgarishi. Sarlavha yonidagi yashil nuqta ulanish tirikligini bildiradi.

Maxfiylik: shaxsiy voqealar hammaga tarqalmaydi. Arizadagi aloqa ma'lumotlari
va chat xabarlari faqat ikki tomonga — e'lon egasiga va blogerga — yuboriladi.
E'lonlar va profillar esa ochiq, shuning uchun hammaga boradi.

Ulanish uzilsa brauzer o'zi qayta ulanadi. Proksilar jim turgan ulanishni
uzmasligi uchun har 25 soniyada bo'sh signal yuboriladi. Ilova fondan qaytganda
(telefon ekrani o'chib yongandan keyin) ma'lumot bir marta to'liq qayta o'qiladi.

## Muhit o'zgaruvchilari

| O'zgaruvchi | Vazifasi |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Bot tokeni. Bo'sh bo'lsa bot ishga tushmaydi, sayt ishlayveradi |
| `ADMIN_SETUP_CODE` | Birinchi support adminini tayinlash uchun bir martalik kod |
| `APP_URL` | Ilova manzili. `https://` bo'lsa Telegram Mini App yoqiladi |
| `PORT` | Server porti (standart 3000) |
| `DATA_DIR` | Ma'lumotlar katalogi (fayl rejimida) |
| `DATABASE_URL` | Postgres manzili. Berilsa — ma'lumotlar shu yerda saqlanadi |
| `BOT_MODE` | `polling` deb yozilsa, HTTPS bo'lsa ham long polling ishlatiladi |
| `HOST` | Ilova qaysi manzilda tinglaydi (proksi ortida `127.0.0.1`) |
| `NODE_ENV` | `production` bo'lsa demo hisoblar yaratilmaydi |
| `TRUST_PROXY` | Teskari proksi ortida ishlaganda mijoz IP'sini to'g'ri aniqlash (standart 1) |

## Sirlar (.env)

`.env` fayli **git'ga tushmaydi** va unda bot tokeni hamda admin kodi saqlanadi.
Namuna uchun `.env.example` ga qarang. Token oshkor bo'lib qolsa, @BotFather'da `/revoke`
orqali darhol yangilang va `.env` dagi qiymatni almashtiring.

## Muhim eslatma

Platformada **to'lov tizimi, escrow yoki kafolat yo'q** — u faqat tomonlarni bog'laydi.
To'lov va shartnoma bevosita brend va bloger o'rtasida amalga oshiriladi.
