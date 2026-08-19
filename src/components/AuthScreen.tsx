import { useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Check,
  Eye,
  EyeOff,
  Instagram,
  Loader2,
  Lock,
  Phone,
  Send as TelegramIcon,
  Sparkles,
} from 'lucide-react';

import type { UserRole } from '../types';
import { CITIES, NICHES } from '../types';
import { ApiError, type AppConfig, type RegisterInput } from '../lib/api';

interface AuthScreenProps {
  onLogin: (phone: string, password: string) => Promise<void>;
  onRegister: (input: RegisterInput) => Promise<void>;
  /** Server bergan ochiq sozlamalar: bot manzili va demo rejimi. */
  config: AppConfig | null;
  /** Ilova Telegram Mini App sifatida ochilganmi. */
  inTelegram?: boolean;
  /** Telegram orqali kirish muvaffaqiyatsiz bo'lsa — sababi. */
  telegramError?: string | null;
}

type Mode = 'login' | 'pick-role' | 'register';

const inputClass =
  'w-full px-4 py-3 rounded-2xl border border-purple-200/80 text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition';
const labelClass = 'block text-xs font-bold text-slate-700 mb-1.5';

export function AuthScreen({
  onLogin,
  onRegister,
  config,
  inTelegram = false,
  telegramError = null,
}: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [role, setRole] = useState<UserRole>('advertiser');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Umumiy maydonlar
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  // Brend maydonlari
  const [brandName, setBrandName] = useState('');
  const [brandCategory, setBrandCategory] = useState<string>(NICHES[0]);
  const [brandInstagram, setBrandInstagram] = useState('');
  const [brandTelegram, setBrandTelegram] = useState('');
  const [contactPerson, setContactPerson] = useState('');

  // Bloger maydonlari
  const [bloggerName, setBloggerName] = useState('');
  const [bloggerUsername, setBloggerUsername] = useState('');
  const [bloggerNiche, setBloggerNiche] = useState<string>('Lifestyle & Kundalik');
  const [bloggerCity, setBloggerCity] = useState<string>('Toshkent');
  const [followersCount, setFollowersCount] = useState(10000);
  const [avgStoryViews, setAvgStoryViews] = useState(2000);
  const [avgReelsViews, setAvgReelsViews] = useState(15000);
  const [bloggerTelegram, setBloggerTelegram] = useState('');

  const isAdvertiser = role === 'advertiser';

  const run = async (action: () => Promise<void>) => {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof ApiError ? actionError.message : "Amalni bajarib bo'lmadi.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    void run(() => onLogin(phone, password));
  };

  const handleRegister = (event: React.FormEvent) => {
    event.preventDefault();
    void run(() =>
      onRegister(
        isAdvertiser
          ? {
              role,
              phone,
              password,
              name: brandName,
              category: brandCategory,
              contactPerson,
              contactTelegram: brandTelegram,
              websiteOrInstagram: brandInstagram,
              username: brandInstagram,
            }
          : {
              role,
              phone,
              password,
              name: bloggerName,
              username: bloggerUsername,
              niche: bloggerNiche,
              city: bloggerCity,
              followersCount,
              avgStoryViews,
              avgReelsViews,
              contactTelegram: bloggerTelegram,
            },
      ),
    );
  };

  const startRegister = (chosen: UserRole) => {
    setRole(chosen);
    setMode('register');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#FDF7FF] flex flex-col relative overflow-hidden">
      {/* Fon yorug'liklari */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-200/40 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-pink-200/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-amber-200/30 rounded-full blur-3xl" />
      </div>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 relative z-10">
        <div className="w-full max-w-lg">
          {/* Logotip */}
          <div className="flex flex-col items-center gap-2 mb-6">
            <div className="w-14 h-14 rounded-3xl bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-400 flex items-center justify-center text-white shadow-lg shadow-pink-500/25">
              <Instagram className="w-7 h-7" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-violet-950 via-purple-900 to-pink-700 bg-clip-text text-transparent">
              InstaCollab UZ
            </h1>
            <p className="text-xs font-semibold text-slate-500">
              Instagram blogerlar va reklama beruvchilar bozori
            </p>
          </div>

          {/* Telegram ichida ochilgan, lekin hisob ulanmagan */}
          {inTelegram && telegramError && (
            <div className="bg-white border border-purple-100 rounded-3xl shadow-xl shadow-purple-950/5 p-6 sm:p-7 space-y-4 mb-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center mx-auto">
                <TelegramIcon className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900">Hisobingiz hali ulanmagan</h2>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{telegramError}</p>
              </div>
              <p className="text-[11px] text-slate-500">
                Yoki quyida telefon va parolingiz bilan kiring.
              </p>
            </div>
          )}

          <div className="bg-white border border-purple-100 rounded-3xl shadow-xl shadow-purple-950/5 overflow-hidden">
            {/* ================= KIRISH ================= */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} className="p-6 sm:p-7 space-y-4">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">Tizimga kirish</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ro'yxatdan o'tgan telefon raqamingiz va parolingiz bilan kiring.
                  </p>
                </div>

                {error && (
                  <p role="alert" className="text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-2xl p-3">
                    {error}
                  </p>
                )}

                <div>
                  <label htmlFor="login-phone" className={labelClass}>
                    <Phone className="w-3.5 h-3.5 text-emerald-500 inline mr-1" aria-hidden="true" />
                    Telefon raqamingiz
                  </label>
                  <input
                    id="login-phone"
                    type="tel"
                    required
                    autoComplete="tel"
                    inputMode="tel"
                    maxLength={32}
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+998 90 123-45-67"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="login-password" className={labelClass}>
                    <Lock className="w-3.5 h-3.5 text-purple-500 inline mr-1" aria-hidden="true" />
                    Parol
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                      className={`${inputClass} pr-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Parolni yashirish' : "Parolni ko'rsatish"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isBusy}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 hover:from-violet-700 hover:via-purple-700 hover:to-pink-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-black shadow-lg shadow-purple-600/25 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isBusy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                  <span>{isBusy ? 'Tekshirilmoqda…' : 'Kirish'}</span>
                </button>

                <p className="text-center text-xs text-slate-500 pt-1">
                  Hisobingiz yo'qmi?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('pick-role');
                      setError(null);
                    }}
                    className="font-bold text-violet-700 hover:text-violet-900 cursor-pointer underline underline-offset-2"
                  >
                    Ro'yxatdan o'tish
                  </button>
                </p>

                {config?.telegramBotUrl && !inTelegram && (
                  <a
                    href={config.telegramBotUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 p-3.5 rounded-2xl bg-sky-50 border border-sky-200 hover:bg-sky-100 transition group"
                  >
                    <span className="w-9 h-9 rounded-xl bg-sky-500 text-white flex items-center justify-center shrink-0">
                      <TelegramIcon className="w-4.5 h-4.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-black text-sky-950">
                        Parolni unutdingizmi? Telegram bot yordam beradi
                      </span>
                      <span className="block text-[11px] text-sky-800/80">
                        {config.telegramBot} — parolni tiklash, e'lonlar va bildirishnomalar
                      </span>
                    </span>
                  </a>
                )}
              </form>
            )}

            {/* ================= ROL TANLASH ================= */}
            {mode === 'pick-role' && (
              <div className="p-6 sm:p-7 space-y-4">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">Kim sifatida qo'shilasiz?</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Hisob turi ro'yxatdan o'tishda tanlanadi va keyin o'zgarmaydi.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => startRegister('advertiser')}
                    className="text-left p-5 rounded-3xl border-2 border-purple-100 hover:border-violet-400 hover:bg-violet-50/40 transition cursor-pointer group"
                  >
                    <span className="w-11 h-11 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-600/20 mb-3">
                      <Building2 className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <span className="block text-sm font-black text-slate-900">Reklama beruvchi</span>
                    <span className="block text-[11px] text-slate-500 mt-1 leading-relaxed">
                      Brend, do'kon yoki xizmat. E'lon joylaysiz, blogerlardan ariza qabul qilasiz va o'zingiz
                      tanlaysiz.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => startRegister('blogger')}
                    className="text-left p-5 rounded-3xl border-2 border-purple-100 hover:border-pink-400 hover:bg-pink-50/40 transition cursor-pointer group"
                  >
                    <span className="w-11 h-11 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 text-white flex items-center justify-center shadow-md shadow-pink-500/20 mb-3">
                      <Instagram className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <span className="block text-sm font-black text-slate-900">Bloger</span>
                    <span className="block text-[11px] text-slate-500 mt-1 leading-relaxed">
                      Instagram sahifangiz bor. Media kit yaratasiz, brendlar e'loniga ariza yuborasiz va reklama
                      olasiz.
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Kirishga qaytish</span>
                </button>
              </div>
            )}

            {/* ================= RO'YXATDAN O'TISH ================= */}
            {mode === 'register' && (
              <form onSubmit={handleRegister} className="max-h-[75vh] overflow-y-auto">
                <div
                  className={`p-5 border-b flex items-center gap-3 ${
                    isAdvertiser
                      ? 'bg-gradient-to-r from-violet-50 to-purple-50/60 border-purple-100'
                      : 'bg-gradient-to-r from-pink-50 to-amber-50/60 border-pink-100'
                  }`}
                >
                  <span
                    className={`w-10 h-10 rounded-2xl text-white flex items-center justify-center shrink-0 ${
                      isAdvertiser
                        ? 'bg-gradient-to-r from-violet-600 to-purple-600'
                        : 'bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500'
                    }`}
                  >
                    {isAdvertiser ? (
                      <Building2 className="w-5 h-5" aria-hidden="true" />
                    ) : (
                      <Instagram className="w-5 h-5" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-black text-slate-900">
                      {isAdvertiser ? 'Reklama beruvchi hisobi' : 'Bloger hisobi'}
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      {isAdvertiser ? "E'lon joylash uchun" : 'Reklama olish uchun'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMode('pick-role')}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer shrink-0"
                  >
                    O'zgartirish
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  {error && (
                    <p role="alert" className="text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-2xl p-3">
                      {error}
                    </p>
                  )}

                  {/* Kirish ma'lumotlari */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="reg-phone" className={labelClass}>
                        Telefon raqam (login) *
                      </label>
                      <input
                        id="reg-phone"
                        type="tel"
                        required
                        autoComplete="tel"
                        inputMode="tel"
                        maxLength={32}
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="+998 90 123-45-67"
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label htmlFor="reg-password" className={labelClass}>
                        Parol * <span className="font-normal text-slate-400">(kamida 8 belgi)</span>
                      </label>
                      <div className="relative">
                        <input
                          id="reg-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={8}
                          autoComplete="new-password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="••••••••"
                          className={`${inputClass} pr-12`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          aria-label={showPassword ? 'Parolni yashirish' : "Parolni ko'rsatish"}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" aria-hidden="true" />
                          ) : (
                            <Eye className="w-4 h-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* --- Brend maydonlari --- */}
                  {isAdvertiser ? (
                    <>
                      <div>
                        <label htmlFor="reg-brand-name" className={labelClass}>
                          Brend / do'kon nomi *
                        </label>
                        <input
                          id="reg-brand-name"
                          type="text"
                          required
                          maxLength={80}
                          value={brandName}
                          onChange={(event) => setBrandName(event.target.value)}
                          placeholder="Masalan: 'NeoStore Texnika'"
                          className={inputClass}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="reg-brand-category" className={labelClass}>
                            Faoliyat yo'nalishi *
                          </label>
                          <select
                            id="reg-brand-category"
                            value={brandCategory}
                            onChange={(event) => setBrandCategory(event.target.value)}
                            className={`${inputClass} font-semibold cursor-pointer`}
                          >
                            {NICHES.map((niche) => (
                              <option key={niche} value={niche}>
                                {niche}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label htmlFor="reg-brand-person" className={labelClass}>
                            Mas'ul shaxs
                          </label>
                          <input
                            id="reg-brand-person"
                            type="text"
                            maxLength={80}
                            value={contactPerson}
                            onChange={(event) => setContactPerson(event.target.value)}
                            placeholder="Aziz Rahimov (Marketing)"
                            className={inputClass}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="reg-brand-instagram" className={labelClass}>
                            <Instagram className="w-3.5 h-3.5 text-pink-500 inline mr-1" aria-hidden="true" />
                            Instagram profil
                          </label>
                          <input
                            id="reg-brand-instagram"
                            type="text"
                            maxLength={60}
                            value={brandInstagram}
                            onChange={(event) => setBrandInstagram(event.target.value)}
                            placeholder="@brend_uz"
                            className={inputClass}
                          />
                        </div>

                        <div>
                          <label htmlFor="reg-brand-telegram" className={labelClass}>
                            <TelegramIcon className="w-3.5 h-3.5 text-sky-500 inline mr-1" aria-hidden="true" />
                            Telegram username
                          </label>
                          <input
                            id="reg-brand-telegram"
                            type="text"
                            maxLength={64}
                            value={brandTelegram}
                            onChange={(event) => setBrandTelegram(event.target.value)}
                            placeholder="@brend_menejer"
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    /* --- Bloger maydonlari --- */
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="reg-blogger-name" className={labelClass}>
                            Ism &amp; familiya *
                          </label>
                          <input
                            id="reg-blogger-name"
                            type="text"
                            required
                            maxLength={80}
                            value={bloggerName}
                            onChange={(event) => setBloggerName(event.target.value)}
                            placeholder="Shahzod Aliyev"
                            className={inputClass}
                          />
                        </div>

                        <div>
                          <label htmlFor="reg-blogger-username" className={labelClass}>
                            <Instagram className="w-3.5 h-3.5 text-pink-500 inline mr-1" aria-hidden="true" />
                            Instagram username *
                          </label>
                          <input
                            id="reg-blogger-username"
                            type="text"
                            required
                            maxLength={40}
                            value={bloggerUsername}
                            onChange={(event) => setBloggerUsername(event.target.value)}
                            placeholder="@shahzod_vlog"
                            className={inputClass}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="reg-blogger-niche" className={labelClass}>
                            Yo'nalish *
                          </label>
                          <select
                            id="reg-blogger-niche"
                            value={bloggerNiche}
                            onChange={(event) => setBloggerNiche(event.target.value)}
                            className={`${inputClass} font-semibold cursor-pointer`}
                          >
                            {NICHES.map((niche) => (
                              <option key={niche} value={niche}>
                                {niche}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label htmlFor="reg-blogger-city" className={labelClass}>
                            Shahar *
                          </label>
                          <select
                            id="reg-blogger-city"
                            value={bloggerCity}
                            onChange={(event) => setBloggerCity(event.target.value)}
                            className={`${inputClass} font-semibold cursor-pointer`}
                          >
                            {CITIES.map((city) => (
                              <option key={city} value={city}>
                                {city}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label htmlFor="reg-followers" className="block text-[11px] font-bold text-slate-600 mb-1.5">
                            Obunachilar *
                          </label>
                          <input
                            id="reg-followers"
                            type="number"
                            min={0}
                            value={followersCount}
                            onChange={(event) => setFollowersCount(Math.max(0, Number(event.target.value)))}
                            className={`${inputClass} font-bold`}
                          />
                        </div>
                        <div>
                          <label htmlFor="reg-story" className="block text-[11px] font-bold text-slate-600 mb-1.5">
                            Story ko'rish
                          </label>
                          <input
                            id="reg-story"
                            type="number"
                            min={0}
                            value={avgStoryViews}
                            onChange={(event) => setAvgStoryViews(Math.max(0, Number(event.target.value)))}
                            className={`${inputClass} font-bold`}
                          />
                        </div>
                        <div>
                          <label htmlFor="reg-reels" className="block text-[11px] font-bold text-slate-600 mb-1.5">
                            Reels qamrov
                          </label>
                          <input
                            id="reg-reels"
                            type="number"
                            min={0}
                            value={avgReelsViews}
                            onChange={(event) => setAvgReelsViews(Math.max(0, Number(event.target.value)))}
                            className={`${inputClass} font-bold`}
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="reg-blogger-telegram" className={labelClass}>
                          <TelegramIcon className="w-3.5 h-3.5 text-sky-500 inline mr-1" aria-hidden="true" />
                          Telegram username
                        </label>
                        <input
                          id="reg-blogger-telegram"
                          type="text"
                          maxLength={64}
                          value={bloggerTelegram}
                          onChange={(event) => setBloggerTelegram(event.target.value)}
                          placeholder="@bloger_aloqa"
                          className={inputClass}
                        />
                      </div>
                    </>
                  )}

                  <p className="text-[11px] text-slate-500 bg-purple-50/60 border border-purple-100 rounded-2xl p-3 leading-relaxed flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Qolgan ma'lumotlarni (tavsif, tariflar, rasm) hisobga kirgandan so'ng profil bo'limida
                      to'ldirasiz.
                    </span>
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="px-4 py-3 rounded-2xl border border-purple-200 text-slate-600 text-xs font-bold hover:bg-purple-50 cursor-pointer"
                    >
                      Bekor qilish
                    </button>
                    <button
                      type="submit"
                      disabled={isBusy}
                      className={`flex-1 py-3 rounded-2xl text-white text-sm font-black shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                        isAdvertiser
                          ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-purple-600/25'
                          : 'bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 hover:from-pink-600 hover:via-rose-600 hover:to-amber-600 shadow-pink-500/25'
                      }`}
                    >
                      {isBusy ? (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="w-4 h-4" aria-hidden="true" />
                      )}
                      <span>{isBusy ? 'Yaratilmoqda…' : "Hisob ochish va kirish"}</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>

          <p className="text-center text-[11px] text-slate-400 mt-5 leading-relaxed max-w-sm mx-auto">
            InstaCollab tomonlarni bog'laydi. To'lov va shartnoma to'g'ridan-to'g'ri brend va bloger o'rtasida
            amalga oshiriladi — platformada escrow yoki kafolat xizmati yo'q.
          </p>
        </div>
      </main>
    </div>
  );
}
