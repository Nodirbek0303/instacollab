# Serverga joylash — Render

Bu qo'llanma InstaCollab'ni **Render**ga joylashni qadamba-qadam ko'rsatadi. Umumiy vaqt: ~25 daqiqa.
Server administratsiyasi, Linux buyruqlari va domen sotib olish kerak emas.

Natijada:

- sayt HTTPS orqali ochiladi (`https://instacollab.onrender.com`);
- botdagi **«📣 Reklama joylash»** tugmasi panelni to'g'ridan-to'g'ri e'lon berish formasida ochadi;
- bloger e'lon ustiga bosib, to'liq shartlarni ko'radi va **Telegram / Instagram / telefon** —
  qaysi biri qulay bo'lsa, o'sha orqali bog'lanadi;
- panelga kirganda parol so'ralmaydi — Telegram hisobi orqali avtomatik kiriladi;
- ma'lumotlar Postgres'da saqlanadi va deploy paytida ham, xizmat uxlab qolganda ham yo'qolmaydi.

---

## Render tekin tarifining ikkita cheklovi va ularning yechimi

| Cheklov | Yechim (allaqachon qilingan) |
| --- | --- |
| **Disk saqlanmaydi** — har qayta ishga tushganda fayllar yo'qoladi | Ma'lumotlar `DATABASE_URL` berilganda Postgres'ga yoziladi. Kod o'zgarmaydi — faqat saqlash joyi almashadi |
| **15 daqiqa harakatsizlikdan keyin uxlaydi** | Bot **webhook** rejimiga o'tadi: Telegram xabar yuborganda Render o'zi uyg'onadi. Long polling uyquda ishlamaydi |

Uyg'onish 30–60 soniya davom etadi. Buni yo'q qilish yo'li quyida («Uxlab qolishini oldini olish»).

---

## Nima kerak

| Nima | Izoh |
| --- | --- |
| GitHub hisobi | Render kodni git'dan oladi |
| Render hisobi | https://render.com — GitHub bilan kirasiz, karta so'ralmaydi |
| Neon hisobi | https://neon.tech — tekin Postgres, muddatsiz, karta so'ralmaydi |
| Telegram bot tokeni | @BotFather → `/mybots` |

> **Muhim:** hozirgi tokeningiz suhbatda ochiq yozilgan edi. Joylashdan **oldin**
> @BotFather'da `/revoke` qilib yangi token oling.

---

## 1-qadam. Kodni GitHub'ga yuklash

O'z kompyuteringizda, loyiha katalogida:

```bash
git init
git add .
git commit -m "InstaCollab UZ"
```

> `.gitignore` allaqachon sozlangan: `.env`, `data/`, `node_modules/` git'ga **tushmaydi**.
> Buni tekshirish: `git status` da `.env` ko'rinmasligi kerak.

GitHub'da yangi (bo'sh, **private**) repozitoriy oching va:

```bash
git remote add origin https://github.com/FOYDALANUVCHI/instacollab.git
git branch -M main
git push -u origin main
```

---

## 2-qadam. Tekin Postgres (Neon)

1. https://neon.tech → **Sign up** (GitHub bilan).
2. **Create project** → nomi `instacollab`, region: **Europe (Frankfurt)**.
3. Ochilgan sahifada **Connection string** ni nusxalang. U shunday ko'rinadi:

   ```
   postgresql://neondb_owner:PAROL@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

Bu qatorni saqlab qo'ying — keyingi qadamda kerak bo'ladi.

> Jadval avtomatik yaratiladi, hech qanday SQL yozish shart emas.

---

## 3-qadam. Render'da xizmat yaratish

1. https://dashboard.render.com → **New** → **Blueprint**.
2. GitHub repozitoriyingizni tanlang → Render `render.yaml` ni o'zi topadi → **Apply**.
3. Render uchta o'zgaruvchini so'raydi — to'ldiring:

   | O'zgaruvchi | Qiymat |
   | --- | --- |
   | `TELEGRAM_BOT_TOKEN` | @BotFather bergan yangi token |
   | `ADMIN_SETUP_CODE` | O'zingiz o'ylab topgan maxfiy kod (masalan `SUPPORT-7391`) |
   | `DATABASE_URL` | 2-qadamdagi Neon connection string |

4. **Apply** → birinchi build 3–5 daqiqa davom etadi.

> **Blueprint** ishlamasa: **New → Web Service** → repozitoriy → Runtime `Node`,
> Build `npm ci && npm run build`, Start `npm start`, Plan `Free` — so'ng
> **Environment** bo'limida yuqoridagi uchta o'zgaruvchini qo'shing.

---

## 4-qadam. Tekshirish

Render jurnalida (**Logs**) quyidagilar ko'rinishi kerak:

```
Ma'lumotlar: postgres (postgres://ep-xxx.eu-central-1.aws.neon.tech)
[bot] webhook o'rnatildi: https://instacollab.onrender.com/api/telegram/***
[bot] Mini App yoqildi: https://instacollab.onrender.com
[bot] @bleggerbot ishga tushdi.
InstaCollab server: http://0.0.0.0:10000
```

Agar `Ma'lumotlar: file (...)` deb yozsa — `DATABASE_URL` kiritilmagan. Uni qo'shing va
**Manual Deploy → Deploy latest commit** bosing.

Endi:

1. Saytni oching: `https://instacollab.onrender.com` — kirish ekrani chiqishi kerak.
2. Telegramda botni oching → `/start` → **«🚀 Panelni ochish»** tugmasi paydo bo'ladi.
3. Ro'yxatdan o'ting va o'zingizni support admin qiling:

   ```
   /admin SIZNING_ADMIN_KODINGIZ
   ```

---

## Foydalanuvchi yo'llari — qanday ishlaydi

### Reklama beruvchi: e'lon joylash

1. Botda **«📣 Reklama joylash»** tugmasini bosadi.
2. Panel Telegram ichida ochiladi — to'g'ridan-to'g'ri **e'lon berish formasida**.
   Kontaktlar (Telegram, Instagram, telefon) brend profilidan avtomatik to'ladi.
3. Sarlavha, mahsulot haqida ma'lumot, format, muddat va minimal obunachilar sonini to'ldiradi.
4. **«E'lonni joylashtirish»** → e'lon bozorga chiqadi va o'sha yo'nalishdagi, talabga mos
   blogerlarga **darhol Telegram xabari** boradi.

> **Eslatma.** Reklama beruvchi blogerlar ro'yxatini ko'ra olmaydi — katalog yo'q.
> Aloqani bloger boshlaydi: e'lonni ko'radi va ariza yuboradi, shundan keyingina
> e'lon egasi uni ko'radi va u bilan bog'lana oladi.

### Bloger: e'lonni ko'rish va bog'lanish

1. Botda **«📢 Reklama e'lonlari»** → e'lonlar ro'yxati (sahifalab ko'riladi).
2. Kerakli e'lon ustiga bosadi → **to'liq tafsilot** ochiladi: format, muddat, talablar,
   «qilish kerak / qilmaslik kerak», hashtaglar va nechta ariza kelgani.
3. Pastda uchta tugma — **qaysi biri qulay bo'lsa**:
   - **✈️ Telegram** — brendning Telegramini darhol ochadi;
   - **📷 Instagram** — brend profilini ochadi;
   - **☎️ Telefon** — raqamni nusxalash uchun yuboradi.
4. Yoki **«📤 Ariza yuborish»** — taklif matnini yozadi, brendga bildirishnoma boradi.
5. **«🌐 Panelda ochish»** — o'sha e'lon panelda ajratib ko'rsatiladi.

---

## Uxlab qolishini oldini olish (ixtiyoriy)

Render tekin tarifi oyiga 750 soat beradi — bu bitta xizmatni **24/7 ishlatishga yetadi** (oyda ~730 soat).
Xizmat uxlamasligi uchun har 10 daqiqada `/api/health` ga so'rov yuborish kifoya:

1. https://cron-job.org (tekin) → ro'yxatdan o'ting.
2. **Create cronjob**:
   - URL: `https://instacollab.onrender.com/api/health`
   - Interval: har **10 daqiqa**.

Shundan keyin bot va sayt darhol javob beradi.

---

## Kodni yangilash

```bash
git add .
git commit -m "o'zgarishlar"
git push
```

Render `push` ni ko'rib, o'zi qayta yig'adi va joylaydi. Ma'lumotlar Postgres'da bo'lgani uchun
deploy paytida hech narsa yo'qolmaydi.

---

## Ma'lumotlar zaxirasi

Neon panelida **Backups** bo'limi bor (avtomatik). Qo'lda nusxa olish:

```bash
# Neon connection string bilan
psql "postgresql://..." -c "\copy (SELECT data FROM instacollab_state WHERE id=1) TO 'zaxira.json'"
```

Yoki Neon panelidagi **SQL Editor** da:

```sql
SELECT data FROM instacollab_state WHERE id = 1;
```

---

## Ma'lumotlar bazasini qo'lda tahrirlash

Ilova butun holatni **xotirada** saqlaydi va har o'zgarishda yaxlit yozadi. Shuning uchun
xizmat ishlab turganda Postgres'ni tashqaridan tahrirlash **foydasiz** — ishlab turgan nusxa
keyingi yozuvda eski holatni qaytarib qo'yadi (to'xtatilganda ham, chunki u yopilishdan oldin
xotiradagi ma'lumotni saqlaydi).

To'g'ri tartib — **avval to'xtatish, keyin tahrirlash**:

```bash
# 1. Xizmatni to'xtatish (Render panelida "Suspend" yoki API orqali)
curl -X POST https://api.render.com/v1/services/SRV_ID/suspend -H "Authorization: Bearer RENDER_API_KEY"

# 2. 15 soniya kutib, so'ng bazani tahrirlash (Neon SQL Editor yoki psql)

# 3. Qayta yoqish
curl -X POST https://api.render.com/v1/services/SRV_ID/resume -H "Authorization: Bearer RENDER_API_KEY"
```

Odatdagi o'zgarishlar (parol tiklash, hisob boshqarish) uchun **botdagi support paneli**dan
foydalaning — u ilovaning o'zi orqali ishlagani uchun bunday muammo bo'lmaydi.

---

## Administrator huquqini berish

Render → Environment → `ADMIN_PHONES`:

```
ADMIN_PHONES=+998901234567
```

Bir nechta raqamni vergul bilan ajrating. O'zgartirgandan keyin **«Deploy latest commit»** qiling —
faqat o'zgaruvchini saqlash yetarli emas, xizmat qayta ishga tushishi kerak.

Shu ro'yxatdagi raqam bilan kirsangiz, yon menyuda «Administrator Paneli» chiqadi. Boshqalarga u
umuman ko'rinmaydi va API darajasida ham yopiq.

**Ro'yxatdan chiqarish.** Raqamni `ADMIN_PHONES` dan olib tashlab qayta joylang — server ishga
tushishida huquqni bazadan ham olib qo'yadi. Jurnalda `[admin] ruxsat etilgan raqamlar: …` degan
qator chiqadi, shundan tekshirib olasiz.

## Ishga tushish tartibi

Server portni **birinchi** ochadi, bazaga esa keyin ulanadi. Neon tekin tarifda
uxlab qolgani uchun ulanish bir necha soniya (ba'zan ko'proq) davom etadi —
agar port shu vaqtgacha ochilmasa, Render "port ochilmadi" deb deploy'ni bekor
qiladi. Tayyor bo'lmagan paytda `/api/...` so'rovlariga 503 qaytadi, sahifada
esa o'zi yangilanadigan "Server ishga tushmoqda…" yozuvi turadi. `/api/health`
har doim javob beradi.

## Muammolarni hal qilish

| Muammo | Sabab va yechim |
| --- | --- |
| Jurnalda `Ma'lumotlar: file` | `DATABASE_URL` kiritilmagan → Environment'ga qo'shing va qayta deploy qiling |
| Bot javob bermayapti | Jurnalda `webhook o'rnatildi` bormi? Yo'q bo'lsa — token noto'g'ri |
| Botda «Panelni ochish» tugmasi yo'q | Jurnalda `Mini App yoqildi` bo'lishi kerak. Bo'lmasa — `RENDER_EXTERNAL_URL` yetib bormagan, xizmatni qayta deploy qiling |
| Birinchi xabar 30–60 soniya kechikadi | Xizmat uxlagan. «Uxlab qolishini oldini olish» bo'limiga qarang |
| `password authentication failed` | Neon connection string noto'g'ri nusxalangan (parol qismi tushib qolgan) |
| Panel «hisobingiz ulanmagan» deydi | Botda avval «Ro'yxatdan o'tish» yoki «Mavjud hisobni ulash» kerak |
| Build xatosi `Cannot find module` | `npm ci` uchun `package-lock.json` git'ga qo'shilganini tekshiring |

---

## Xavfsizlik

- `.env` git'ga **tushmaydi** — sirlar faqat Render panelida saqlanadi.
- Token oshkor bo'lsa: @BotFather → `/revoke`, so'ng Render'da `TELEGRAM_BOT_TOKEN` ni yangilang.
- `ADMIN_SETUP_CODE` ni bilgan odam support admin bo'la oladi. Adminlar tayinlangach uni
  Render'da o'zgartirib qo'ying.
- Ishlab chiqarishda demo hisoblar **yaratilmaydi** (`NODE_ENV=production`).

---

## Boshqa variantlar

Agar keyinchalik Render'dan ko'chmoqchi bo'lsangiz, ilova hech qanday o'zgarishsiz ishlaydi:

- **O'z serveringiz / VPS** — `deploy/install.sh` skripti bor (`DATABASE_URL` bermasangiz
  ma'lumotlar diskdagi `data/db.json` ga yoziladi). Serverda boshqa loyihalar bo'lsa ham xavfsiz:
  avval `sudo bash deploy/check.sh` ishga tushiring.
- **Oracle Cloud Always Free** — muddatsiz tekin virtual server. Xuddi shu skript bilan o'rnatiladi.
