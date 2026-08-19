# InstaCollab UZ

Instagram blogerlari va reklama beruvchilarni bog'lovchi platforma: reklama e'lonlari bozori,
arizalar, sayt ichidagi chat va to'g'ridan-to'g'ri aloqa (Telegram / Instagram / telefon).

## Akaunt turlari

Har bir foydalanuvchining **bitta hisobi** bo'ladi va uning turi ro'yxatdan o'tishda tanlanadi:

| Tur | Kim | Nima qila oladi |
| --- | --- | --- |
| **Reklama beruvchi** | Brend, do'kon, xizmat | E'lon joylaydi, kelgan arizalarni ko'rib chiqadi va tasdiqlaydi, ariza yuborgan bloger bilan bog'lanadi |
| **Bloger** | Instagram sahifa egasi | Media kit yuritadi, e'lonlarni ko'radi, ariza yuboradi, brendlar bilan yozishadi |

Tur keyin o'zgartirilmaydi. Ikkinchi turdagi hisob kerak bo'lsa, boshqa telefon raqami bilan alohida
ro'yxatdan o'tiladi. Kirish **telefon raqami + parol** orqali; parollar `scrypt` bilan xeshlanadi va hech
qachon ochiq saqlanmaydi. Sessiya `HttpOnly` cookie'da 30 kun saqlanadi.

Server har bir amalni sessiya bo'yicha tekshiradi, masalan:

- bloger e'lon joylay olmaydi, reklama beruvchi ariza yubora olmaydi;
- e'lonni faqat uni joylagan brend o'chira oladi;
- arizani faqat o'sha e'lon egasi tasdiqlay oladi;
- profilni faqat egasi tahrirlay oladi;
- tizimga kirmagan odam hech qanday ma'lumotni ko'ra olmaydi.

### Blogerlar ro'yxati yopiq

Reklama beruvchi blogerlarni ko'rib chiqa olmaydi — katalog yo'q. Aloqani **bloger boshlaydi**:
u e'lonni ko'radi va ariza yuboradi, shundan keyingina e'lon egasi uni ko'radi.

| Kim | Qaysi blogerlarni ko'radi |
| --- | --- |
| Reklama beruvchi | Faqat o'z e'loniga ariza yuborgan yoki u bilan yozishgan blogerlarni |
| Bloger | Faqat o'zini |

Bu cheklov `GET /api/state` ichida — serverda — bajariladi. Ya'ni interfeysni chetlab o'tib
API'ga to'g'ridan-to'g'ri murojaat qilgan odam ham ro'yxatni ololmaydi. Jonli yangilanishlarda
ham shunday: bloger profili o'zgarsa, xabar faqat o'ziga va u bilan ishlagan brendlarga boradi.

E'lonlar va ularni joylagan brendlar esa **ochiq** — bozorning mohiyati shunda.

## Telegram bot

Platformaning ikkinchi kirish nuqtasi. Bot `TELEGRAM_BOT_TOKEN` berilganda avtomatik ishga tushadi
(long polling), token bo'lmasa sayt baribir ishlayveradi.

### Kim nima qila oladi

| Rol | Botdagi imkoniyatlar |
| --- | --- |
| **Mehmon** | Ro'yxatdan o'tish, mavjud hisobni ulash, parolni tiklash so'rovi |
| **Reklama beruvchi** | Reklama joylash, o'z e'lonlari, kelgan arizalarni ko'rish va bir bosishda tasdiqlash/rad etish |
| **Bloger** | Reklama e'lonlari ro'yxati, to'g'ridan-to'g'ri botdan ariza yuborish, o'z arizalari holati |
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
ro'yxatdan o'tish, e'lonlar ro'yxati, ariza, takroriy ariza, support tayinlash, parolni tiklashning
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
npm test                 # barcha sinovlar
npm run test:storage     # saqlash qatlami: Postgres va fayl (25 ta tekshiruv)
npm run test:webhook     # webhook manzili va imzosi (11 ta tekshiruv)
npm run test:bot         # Telegram bot mantiqi (54 ta tekshiruv)
npm run test:visibility  # kim kimni ko'radi (24 ta tekshiruv, `npm run build` talab qiladi)
npm run test:admin       # admin paneli va moderatsiya (46 ta tekshiruv)
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
| `GET` | `/api/events` | sessiya | Jonli yangilanishlar oqimi (SSE) |
| `POST` | `/api/reports` | sessiya | E'lon ustidan shikoyat |
| `GET` | `/api/admin/me` | sessiya | Admin huquqi bormi |
| `GET` | `/api/admin/overview` | **admin** | To'liq manzara: hisoblar, e'lonlar, shikoyatlar, jurnal |
| `PATCH` | `/api/admin/accounts/:id` | **admin** | Muzlatish / o'chirish / qayta tiklash |
| `POST` | `/api/admin/accounts/:id/reset-password` | **admin** | Parolni tiklash |
| `PATCH` | `/api/admin/campaigns/:id` | **admin** | E'lonni yashirish / o'chirish / qaytarish |
| `PATCH` | `/api/admin/reports/:id` | **admin** | Shikoyatni yopish |

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

## Administrator paneli

Admin hisobiga kirganda yon menyuda **«Administrator Paneli»** bo'limi paydo bo'ladi. U yerda
platformaning to'liq manzarasi va nazorat vositalari bor.

### Kim admin bo'ladi

Ro'yxat **`.env` dagi `ADMIN_PHONES`** orqali belgilanadi:

```
ADMIN_PHONES=+998901234567
```

Bir nechta raqamni vergul bilan ajrating. Raqam qaysi ko'rinishda yozilishi muhim emas —
`901234567`, `998901234567`, `+998 90 123-45-67` bir xil tushuniladi.

**Ro'yxat berilgan bo'lsa, faqat o'sha raqamlar admin bo'ladi va boshqa hech qanday yo'l
ishlamaydi.** Botdagi `/admin KOD` ham ro'yxatdan tashqaridagi odamga huquq bermaydi — kodni
bilib olgan bo'lsa ham. Bu ataylab qattiq: nazorat bitta joydan boshqariladi.

Ro'yxat o'zgartirilsa, server keyingi ishga tushishida uni bazaga ham qo'llaydi — ilgari huquq
olgan begona hisoblar avtomatik tushib qoladi, bazani qo'lda tahrirlash kerak emas.

`ADMIN_PHONES` umuman berilmagan bo'lsa, eski tartib ishlaydi: botga `/admin KOD` yozgan
birinchi odam admin bo'ladi (`ADMIN_SETUP_CODE`). Bu faqat yangi o'rnatishlar uchun.

### Nima qila oladi

| Amal | Nima bo'ladi |
| --- | --- |
| **Hisobni muzlatish** | Tizimga kira olmaydi, ochiq sessiyalari bekor qilinadi, e'lonlari bozordan yo'qoladi |
| **Muzlatishni bekor qilish** | Hammasi joyiga qaytadi |
| **Hisobni o'chirish** | Profili va e'lonlari hech kimga ko'rinmaydi |
| **Qayta tiklash** | To'liq ishchi holatga qaytaradi |
| **E'lonni yashirish** | Bozordan olinadi, lekin egasi uni sabab bilan ko'rib turadi va tuzatishi mumkin |
| **E'lonni o'chirish** | Butunlay olib qo'yiladi (baribir qaytarish mumkin) |
| **Parolni tiklash** | Yangi vaqtinchalik parol beriladi, sessiyalar bekor qilinadi, parol botga yuboriladi |

**Hech narsa bazadan o'chirilmaydi** — faqat belgilanadi. Shuning uchun har qanday qaror
qaytariladi va xato tuzatiladi.

### Yolg'on e'lonlarni topish

Admin har bir e'lonni o'qib chiqmasligi uchun foydalanuvchilar shubhali e'lonni **«Shikoyat»**
tugmasi bilan belgilaydi. Shikoyat botdagi barcha adminlarga xabar sifatida boradi va panelning
«Shikoyatlar» bo'limida ochiq turadi. Bir foydalanuvchi bitta e'longa faqat bir marta shikoyat
qila oladi, o'z e'loniga esa umuman qila olmaydi.

Shikoyatni ko'rib chiqqach ikki tugma bor: **«E'lonni o'chirish»** (shikoyat tasdiqlanadi) yoki
**«Asossiz»**.

### Kuzatuv jurnali

Adminning har bir amali yozib boriladi: kim, nimaga, qachon va nega. Oxirgi 500 ta yozuv
saqlanadi va panelning «Kuzatuv» bo'limida ko'rinadi. Sabab foydalanuvchining o'ziga ham
ko'rsatiladi — hisobi muzlatilsa, kirishda aynan shu matnni o'qiydi.

### Xavfsizlik

- Har bir admin marshruti `requireAdmin` bilan yopilgan — interfeysdagi tugmani yashirish
  yetarli emas, cheklov serverda;
- admin **o'z hisobini** bloklay olmaydi (o'zini qulflab qo'yish holatining oldini oladi);
- bir admin **boshqa adminni** bloklay olmaydi.

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
| `ADMIN_PHONES` | Vergul bilan ajratilgan telefon raqamlari — **faqat** shu hisoblar admin bo'ladi |
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
