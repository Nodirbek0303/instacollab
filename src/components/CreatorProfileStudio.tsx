import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  HelpCircle,
  Instagram,
  Phone,
  Save,
  Send as TelegramIcon,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';

import type { BloggerProfile } from '../types';
import { CITIES, NICHES } from '../types';
import { formatFollowers, formatUzs } from '../lib/format';

interface CreatorProfileStudioProps {
  profile: BloggerProfile;
  onUpdateProfile: (updated: BloggerProfile) => Promise<void>;
}

const inputClass =
  'w-full px-4 py-2.5 rounded-2xl border border-purple-100 text-xs font-medium bg-purple-50/30 text-slate-900 focus:bg-white focus:outline-none focus:border-purple-300 shadow-inner';
const labelClass = 'block text-xs font-bold text-slate-700 mb-1';

export function CreatorProfileStudio({ profile, onUpdateProfile }: CreatorProfileStudioProps) {
  const [formData, setFormData] = useState<BloggerProfile>(profile);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Hisob almashsa, forma yangi profil bilan qayta to'ldiriladi.
  useEffect(() => {
    setFormData(profile);
  }, [profile]);

  useEffect(() => {
    if (savedAt === null) return;
    const timer = window.setTimeout(() => setSavedAt(null), 3000);
    return () => window.clearTimeout(timer);
  }, [savedAt]);

  const update = <K extends keyof BloggerProfile>(key: K, value: BloggerProfile[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const updatePricing = (key: 'story' | 'post' | 'reels', value: number) => {
    setFormData((prev) => ({ ...prev, pricing: { ...prev.pricing, [key]: Math.max(0, value) } }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onUpdateProfile(formData);
      setSavedAt(Date.now());
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className="bg-gradient-to-r from-violet-950 via-purple-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-purple-950/15 relative overflow-hidden border border-purple-800/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div
          className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-pink-500/20 via-purple-500/20 to-transparent rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative z-10">
          <span className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/20 text-rose-300 text-xs font-semibold px-3 py-1 rounded-full mb-3">
            <Instagram className="w-3.5 h-3.5 text-pink-400" aria-hidden="true" />
            <span>Bloger media kit &amp; profil</span>
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
            Mening bloger profilim &amp; statistikam
          </h2>
          <p className="text-purple-200/80 text-xs sm:text-sm max-w-2xl leading-relaxed">
            Obunachilaringiz, qamrovingiz, tariflaringiz va aloqa kontaktlaringizni belgilang. Reklama beruvchilar shu
            ma'lumotlar asosida siz bilan bevosita bog'lanishadi.
          </p>
        </div>

        <button
          type="submit"
          form="form-creator-profile"
          id="btn-save-creator-profile-top"
          disabled={isSaving}
          className="bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 hover:from-pink-600 hover:via-rose-600 hover:to-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold text-xs px-6 py-3.5 rounded-2xl shadow-lg shadow-pink-500/25 transition flex items-center gap-2 cursor-pointer shrink-0 relative z-10"
        >
          <Save className="w-4 h-4" aria-hidden="true" />
          <span>{isSaving ? 'Saqlanmoqda…' : "O'zgarishlarni saqlash"}</span>
        </button>
      </section>

      {savedAt !== null && (
        <p
          role="status"
          className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-lg shadow-emerald-500/20 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
          Media kit saqlandi — o'zgarishlar katalogda va arizalaringizda ham yangilandi.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form id="form-creator-profile" onSubmit={handleSave} className="lg:col-span-2 space-y-5">
          {/* Asosiy ma'lumotlar */}
          <fieldset className="bg-white border border-purple-100/90 rounded-3xl p-6 shadow-md shadow-purple-950/5 space-y-4">
            <legend className="text-sm font-bold text-slate-900 flex items-center gap-2 px-1">
              <Users className="w-4 h-4 text-pink-600" aria-hidden="true" />
              <span>Profil asosiy ma'lumotlari</span>
            </legend>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="input-blogger-name" className={labelClass}>
                  Ism &amp; familiya *
                </label>
                <input
                  id="input-blogger-name"
                  type="text"
                  required
                  maxLength={80}
                  value={formData.name}
                  onChange={(event) => update('name', event.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="input-blogger-username" className={labelClass}>
                  Instagram username *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-purple-400 font-bold text-xs" aria-hidden="true">
                    @
                  </span>
                  <input
                    id="input-blogger-username"
                    type="text"
                    required
                    maxLength={40}
                    value={formData.username.replace('@', '')}
                    onChange={(event) => update('username', event.target.value.replace('@', ''))}
                    className={`${inputClass} pl-8`}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="select-profile-niche" className={labelClass}>
                  Yo'nalish (Niche) *
                </label>
                <select
                  id="select-profile-niche"
                  value={formData.niche}
                  onChange={(event) => update('niche', event.target.value)}
                  className={`${inputClass} font-bold cursor-pointer`}
                >
                  {NICHES.map((niche) => (
                    <option key={niche} value={niche}>
                      {niche}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="select-blogger-city" className={labelClass}>
                  Shahar / hudud *
                </label>
                <select
                  id="select-blogger-city"
                  value={formData.city}
                  onChange={(event) => update('city', event.target.value)}
                  className={`${inputClass} font-bold cursor-pointer`}
                >
                  {CITIES.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                  {!CITIES.includes(formData.city as (typeof CITIES)[number]) && (
                    <option value={formData.city}>{formData.city}</option>
                  )}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="textarea-blogger-bio" className={labelClass}>
                Bio — o'zingiz va blogingiz haqida
              </label>
              <textarea
                id="textarea-blogger-bio"
                rows={2}
                maxLength={600}
                value={formData.bio}
                onChange={(event) => update('bio', event.target.value)}
                className={`${inputClass} leading-relaxed`}
              />
            </div>
          </fieldset>

          {/* Kontaktlar */}
          <fieldset className="bg-white border border-purple-100/90 rounded-3xl p-6 shadow-md shadow-purple-950/5 space-y-4">
            <legend className="text-sm font-bold text-slate-900 flex items-center gap-2 px-1">
              <TelegramIcon className="w-4 h-4 text-sky-500" aria-hidden="true" />
              <span>To'g'ridan-to'g'ri bog'lanish ma'lumotlaringiz</span>
            </legend>
            <p className="text-xs text-slate-500">Brendlar sizga Telegram va telefon orqali aloqaga chiqishadi.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="input-blogger-telegram" className={labelClass}>
                  <TelegramIcon className="w-3.5 h-3.5 text-sky-500 inline mr-1" aria-hidden="true" />
                  Telegram username
                </label>
                <input
                  id="input-blogger-telegram"
                  type="text"
                  maxLength={64}
                  value={formData.contactTelegram ?? ''}
                  onChange={(event) => update('contactTelegram', event.target.value)}
                  placeholder="@bloger_nomi"
                  className={`${inputClass} font-bold`}
                />
              </div>

              <div>
                <label htmlFor="input-blogger-phone" className={labelClass}>
                  <Phone className="w-3.5 h-3.5 text-emerald-500 inline mr-1" aria-hidden="true" />
                  Telefon raqamingiz
                </label>
                <input
                  id="input-blogger-phone"
                  type="tel"
                  maxLength={32}
                  value={formData.phone ?? ''}
                  onChange={(event) => update('phone', event.target.value)}
                  placeholder="+998 90 123-45-67"
                  className={`${inputClass} font-bold`}
                />
              </div>
            </div>
          </fieldset>

          {/* Statistika */}
          <fieldset className="bg-white border border-purple-100/90 rounded-3xl p-6 shadow-md shadow-purple-950/5 space-y-4">
            <legend className="text-sm font-bold text-slate-900 flex items-center gap-2 px-1">
              <TrendingUp className="w-4 h-4 text-purple-600" aria-hidden="true" />
              <span>Instagram statistikasi</span>
            </legend>
            <p className="text-xs text-slate-500">
              Haqiqiy raqamlarni kiriting — brendlar ularni Instagram profilingiz bilan solishtirishadi.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="input-blogger-followers" className="block text-[11px] font-bold text-slate-600 mb-1">
                  Obunachilar soni *
                </label>
                <input
                  id="input-blogger-followers"
                  type="number"
                  required
                  min={0}
                  value={formData.followersCount}
                  onChange={(event) => update('followersCount', Math.max(0, Number(event.target.value)))}
                  className={`${inputClass} font-extrabold`}
                />
              </div>

              <div>
                <label htmlFor="input-blogger-story-views" className="block text-[11px] font-bold text-slate-600 mb-1">
                  O'rtacha Story ko'rish *
                </label>
                <input
                  id="input-blogger-story-views"
                  type="number"
                  required
                  min={0}
                  value={formData.avgStoryViews}
                  onChange={(event) => update('avgStoryViews', Math.max(0, Number(event.target.value)))}
                  className={`${inputClass} font-extrabold`}
                />
              </div>

              <div>
                <label htmlFor="input-blogger-reels-views" className="block text-[11px] font-bold text-slate-600 mb-1">
                  O'rtacha Reels qamrovi *
                </label>
                <input
                  id="input-blogger-reels-views"
                  type="number"
                  required
                  min={0}
                  value={formData.avgReelsViews}
                  onChange={(event) => update('avgReelsViews', Math.max(0, Number(event.target.value)))}
                  className={`${inputClass} font-extrabold`}
                />
              </div>
            </div>

            <div className="max-w-[200px]">
              <label htmlFor="input-blogger-er" className="block text-[11px] font-bold text-slate-600 mb-1">
                Faollik darajasi (ER %)
              </label>
              <input
                id="input-blogger-er"
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={formData.engagementRate}
                onChange={(event) =>
                  update('engagementRate', Math.min(100, Math.max(0, Number(event.target.value))))
                }
                className={`${inputClass} font-extrabold`}
              />
            </div>
          </fieldset>

          {/* Tariflar */}
          <fieldset className="bg-white border border-purple-100/90 rounded-3xl p-6 shadow-md shadow-purple-950/5 space-y-4">
            <legend className="text-sm font-bold text-slate-900 flex items-center gap-2 px-1">
              <Sparkles className="w-4 h-4 text-amber-500" aria-hidden="true" />
              <span>Tariflaringiz (so'mda)</span>
            </legend>
            <p className="text-xs text-slate-500">
              Bu narxlar media kitingizda ko'rinadi. Bo'sh (0) qoldirsangiz, ular ko'rsatilmaydi.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="input-price-story" className="block text-[11px] font-bold text-slate-600 mb-1">
                  1x Story
                </label>
                <input
                  id="input-price-story"
                  type="number"
                  min={0}
                  step={10000}
                  value={formData.pricing?.story ?? 0}
                  onChange={(event) => updatePricing('story', Number(event.target.value))}
                  className={`${inputClass} font-extrabold`}
                />
              </div>
              <div>
                <label htmlFor="input-price-post" className="block text-[11px] font-bold text-slate-600 mb-1">
                  1x Post
                </label>
                <input
                  id="input-price-post"
                  type="number"
                  min={0}
                  step={10000}
                  value={formData.pricing?.post ?? 0}
                  onChange={(event) => updatePricing('post', Number(event.target.value))}
                  className={`${inputClass} font-extrabold`}
                />
              </div>
              <div>
                <label htmlFor="input-price-reels" className="block text-[11px] font-bold text-slate-600 mb-1">
                  1x Reels integratsiya
                </label>
                <input
                  id="input-price-reels"
                  type="number"
                  min={0}
                  step={10000}
                  value={formData.pricing?.reels ?? 0}
                  onChange={(event) => updatePricing('reels', Number(event.target.value))}
                  className={`${inputClass} font-extrabold`}
                />
              </div>
            </div>
          </fieldset>
        </form>

        {/* Jonli media kit ko'rinishi */}
        <aside className="space-y-5">
          <div className="bg-gradient-to-br from-violet-950 via-purple-900 to-slate-900 text-white rounded-3xl p-6 shadow-xl shadow-purple-950/20 border border-purple-800/40 space-y-4 relative overflow-hidden lg:sticky lg:top-24">
            <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/20 rounded-full blur-2xl pointer-events-none" aria-hidden="true" />

            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-pink-400 relative z-10">
              Jonli media kit ko'rinishi
            </h3>

            <div className="flex items-center gap-3.5 relative z-10">
              <img
                src={formData.avatar}
                alt={`${formData.name} profil rasmi`}
                className="w-14 h-14 rounded-2xl object-cover border-2 border-purple-500/30 shadow-md"
              />
              <div className="min-w-0">
                <p className="font-bold text-sm text-white truncate">{formData.name}</p>
                <p className="text-xs text-purple-300/80 truncate">@{formData.username}</p>
                <span className="text-[10px] bg-gradient-to-r from-pink-500/20 to-purple-500/20 border border-pink-500/30 text-pink-300 font-bold px-2.5 py-0.5 rounded-full inline-block mt-1">
                  {formData.tier}
                </span>
              </div>
            </div>

            <p className="text-xs text-purple-200/90 leading-relaxed relative z-10">
              {formData.bio || 'Instagram bloger tavsifi...'}
            </p>

            <dl className="grid grid-cols-3 gap-2 bg-white/10 backdrop-blur-md p-3.5 rounded-2xl text-center border border-white/10 relative z-10">
              <div>
                <dt className="text-[10px] text-purple-300 font-medium">Obunachi</dt>
                <dd className="text-xs font-black text-white">{formatFollowers(formData.followersCount)}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-purple-300 font-medium">Story</dt>
                <dd className="text-xs font-black text-amber-300">{formatFollowers(formData.avgStoryViews)}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-purple-300 font-medium">Reels</dt>
                <dd className="text-xs font-black text-pink-300">{formatFollowers(formData.avgReelsViews)}</dd>
              </div>
            </dl>

            {(formData.pricing?.story || formData.pricing?.reels) && (
              <dl className="space-y-1.5 text-xs text-purple-200 pt-3 border-t border-purple-800/60 relative z-10">
                {formData.pricing?.story ? (
                  <div className="flex justify-between">
                    <dt>1x Story:</dt>
                    <dd className="font-bold text-white">{formatUzs(formData.pricing.story)}</dd>
                  </div>
                ) : null}
                {formData.pricing?.reels ? (
                  <div className="flex justify-between">
                    <dt>1x Reels:</dt>
                    <dd className="font-bold text-white">{formatUzs(formData.pricing.reels)}</dd>
                  </div>
                ) : null}
              </dl>
            )}

            <dl className="space-y-2 text-xs text-purple-200 pt-3 border-t border-purple-800/60 relative z-10">
              <div className="flex justify-between gap-2">
                <dt>Telegram:</dt>
                <dd className="font-bold text-sky-300 truncate">{formData.contactTelegram || 'Kiritilmagan'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Telefon:</dt>
                <dd className="font-bold text-emerald-300 truncate">{formData.phone || 'Kiritilmagan'}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-pink-50 border border-amber-200/80 rounded-3xl p-5 text-xs text-amber-950 space-y-2">
            <h3 className="font-bold flex items-center gap-1.5 text-amber-950">
              <HelpCircle className="w-4 h-4 text-amber-600" aria-hidden="true" />
              <span>To'g'ridan-to'g'ri hamkorlik</span>
            </h3>
            <p className="text-[11px] leading-relaxed text-amber-900/80">
              Brendlar profilingizni ko'rib, sayt chatida yoki Telegram/telefoningizga to'g'ridan-to'g'ri yozishadi va
              barcha shartlarni o'zaro kelishasiz.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
