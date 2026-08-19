import { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  HelpCircle,
  Instagram,
  Phone,
  Save,
  Send as TelegramIcon,
} from 'lucide-react';

import type { BrandProfile } from '../types';
import { NICHES } from '../types';
import { ImageUpload } from './ImageUpload';

interface BrandProfileStudioProps {
  profile: BrandProfile;
  onUpdateProfile: (updated: BrandProfile) => Promise<void>;
}

const inputClass =
  'w-full px-4 py-2.5 rounded-2xl border border-purple-100 text-xs font-medium bg-purple-50/30 text-slate-900 focus:bg-white focus:outline-none focus:border-purple-300 shadow-inner';
const labelClass = 'block text-xs font-bold text-slate-700 mb-1';

export function BrandProfileStudio({ profile, onUpdateProfile }: BrandProfileStudioProps) {
  const [formData, setFormData] = useState<BrandProfile>(profile);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setFormData(profile);
  }, [profile]);

  useEffect(() => {
    if (savedAt === null) return;
    const timer = window.setTimeout(() => setSavedAt(null), 3000);
    return () => window.clearTimeout(timer);
  }, [savedAt]);

  const update = <K extends keyof BrandProfile>(key: K, value: BrandProfile[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
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
    <div className="max-w-4xl mx-auto space-y-6">
      <section className="bg-gradient-to-r from-violet-950 via-purple-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-purple-950/15 relative overflow-hidden border border-purple-800/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div
          className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-pink-500/20 via-purple-500/20 to-transparent rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative z-10">
          <span className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/20 text-rose-300 text-xs font-semibold px-3 py-1 rounded-full mb-3">
            <Building2 className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
            <span>Brend profili</span>
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
            Brend ma'lumotlarim
          </h2>
          <p className="text-purple-200/80 text-xs sm:text-sm max-w-2xl leading-relaxed">
            Bu ma'lumotlar sizning barcha reklama e'lonlaringizda ko'rinadi. Nomni yoki logotipni o'zgartirsangiz,
            avvalgi e'lonlaringiz ham avtomatik yangilanadi.
          </p>
        </div>

        <button
          type="submit"
          form="form-brand-profile"
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
          Brend profili saqlandi va e'lonlaringizda yangilandi.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form id="form-brand-profile" onSubmit={handleSave} className="lg:col-span-2 space-y-5">
          <fieldset className="bg-white border border-purple-100/90 rounded-3xl p-6 shadow-md shadow-purple-950/5 space-y-4">
            <legend className="text-sm font-bold text-slate-900 flex items-center gap-2 px-1">
              <Building2 className="w-4 h-4 text-violet-600" aria-hidden="true" />
              <span>Asosiy ma'lumotlar</span>
            </legend>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="input-brand-profile-name" className={labelClass}>
                  Brend / do'kon nomi *
                </label>
                <input
                  id="input-brand-profile-name"
                  type="text"
                  required
                  maxLength={80}
                  value={formData.name}
                  onChange={(event) => update('name', event.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="select-brand-profile-category" className={labelClass}>
                  Faoliyat yo'nalishi *
                </label>
                <select
                  id="select-brand-profile-category"
                  value={formData.category}
                  onChange={(event) => update('category', event.target.value)}
                  className={`${inputClass} font-bold cursor-pointer`}
                >
                  {NICHES.map((niche) => (
                    <option key={niche} value={niche}>
                      {niche}
                    </option>
                  ))}
                  {!NICHES.includes(formData.category as (typeof NICHES)[number]) && (
                    <option value={formData.category}>{formData.category}</option>
                  )}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="input-brand-profile-person" className={labelClass}>
                Mas'ul shaxs
              </label>
              <input
                id="input-brand-profile-person"
                type="text"
                maxLength={80}
                value={formData.contactPerson}
                onChange={(event) => update('contactPerson', event.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="textarea-brand-profile-desc" className={labelClass}>
                Brend tavsifi
              </label>
              <textarea
                id="textarea-brand-profile-desc"
                rows={3}
                maxLength={600}
                value={formData.description}
                onChange={(event) => update('description', event.target.value)}
                placeholder="Mahsulotlaringiz va qanday auditoriyaga mo'ljallangani haqida..."
                className={`${inputClass} leading-relaxed`}
              />
            </div>

            <ImageUpload
              value={formData.logo}
              onChange={(url) => update('logo', url)}
              label="Brend logotipi"
              alt={`${formData.name} logotipi`}
              hint="Logotip e'lonlaringizda va katalogda ko'rinadi. JPG, PNG yoki WEBP."
              shape="rounded"
            />
          </fieldset>

          <fieldset className="bg-white border border-purple-100/90 rounded-3xl p-6 shadow-md shadow-purple-950/5 space-y-4">
            <legend className="text-sm font-bold text-slate-900 flex items-center gap-2 px-1">
              <TelegramIcon className="w-4 h-4 text-sky-500" aria-hidden="true" />
              <span>Bog'lanish ma'lumotlari</span>
            </legend>
            <p className="text-xs text-slate-500">
              Blogerlar shu kontaktlar orqali siz bilan to'g'ridan-to'g'ri bog'lanishadi.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="input-brand-profile-telegram" className={labelClass}>
                  <TelegramIcon className="w-3.5 h-3.5 text-sky-500 inline mr-1" aria-hidden="true" />
                  Telegram
                </label>
                <input
                  id="input-brand-profile-telegram"
                  type="text"
                  maxLength={64}
                  value={formData.contactTelegram}
                  onChange={(event) => update('contactTelegram', event.target.value)}
                  placeholder="@brend_menejer"
                  className={`${inputClass} font-bold`}
                />
              </div>

              <div>
                <label htmlFor="input-brand-profile-instagram" className={labelClass}>
                  <Instagram className="w-3.5 h-3.5 text-pink-500 inline mr-1" aria-hidden="true" />
                  Instagram
                </label>
                <input
                  id="input-brand-profile-instagram"
                  type="text"
                  maxLength={60}
                  value={formData.websiteOrInstagram ?? ''}
                  onChange={(event) => update('websiteOrInstagram', event.target.value)}
                  placeholder="@brend_uz"
                  className={`${inputClass} font-bold`}
                />
              </div>

              <div>
                <label htmlFor="input-brand-profile-phone" className={labelClass}>
                  <Phone className="w-3.5 h-3.5 text-emerald-500 inline mr-1" aria-hidden="true" />
                  Telefon
                </label>
                <input
                  id="input-brand-profile-phone"
                  type="tel"
                  maxLength={32}
                  value={formData.phone}
                  onChange={(event) => update('phone', event.target.value)}
                  placeholder="+998 90 123-45-67"
                  className={`${inputClass} font-bold`}
                />
              </div>
            </div>
          </fieldset>
        </form>

        <aside className="space-y-5">
          <div className="bg-gradient-to-br from-violet-950 via-purple-900 to-slate-900 text-white rounded-3xl p-6 shadow-xl shadow-purple-950/20 border border-purple-800/40 space-y-4 relative overflow-hidden lg:sticky lg:top-24">
            <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/20 rounded-full blur-2xl pointer-events-none" aria-hidden="true" />

            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-pink-400 relative z-10">
              Blogerlar sizni shunday ko'radi
            </h3>

            <div className="flex items-center gap-3.5 relative z-10">
              <img
                src={formData.logo}
                alt={`${formData.name} logotipi`}
                className="w-14 h-14 rounded-2xl object-cover border-2 border-purple-500/30 shadow-md"
              />
              <div className="min-w-0">
                <p className="font-bold text-sm text-white truncate">{formData.name}</p>
                <p className="text-xs text-purple-300/80 truncate">{formData.category}</p>
              </div>
            </div>

            <p className="text-xs text-purple-200/90 leading-relaxed relative z-10">
              {formData.description || 'Brend tavsifi...'}
            </p>

            <dl className="space-y-2 text-xs text-purple-200 pt-3 border-t border-purple-800/60 relative z-10">
              <div className="flex justify-between gap-2">
                <dt>Mas'ul:</dt>
                <dd className="font-bold text-white truncate">{formData.contactPerson || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Telegram:</dt>
                <dd className="font-bold text-sky-300 truncate">{formData.contactTelegram || 'Kiritilmagan'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Telefon:</dt>
                <dd className="font-bold text-emerald-300 truncate">{formData.phone || 'Kiritilmagan'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>E'lonlar:</dt>
                <dd className="font-bold text-amber-300">{formData.totalCampaignsCreated ?? 0} ta</dd>
              </div>
            </dl>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-pink-50 border border-amber-200/80 rounded-3xl p-5 text-xs text-amber-950 space-y-2">
            <h3 className="font-bold flex items-center gap-1.5 text-amber-950">
              <HelpCircle className="w-4 h-4 text-amber-600" aria-hidden="true" />
              <span>Maslahat</span>
            </h3>
            <p className="text-[11px] leading-relaxed text-amber-900/80">
              To'liq to'ldirilgan brend profili blogerlarda ishonch uyg'otadi — logotip, aniq tavsif va ishlaydigan
              kontaktlar arizalar sonini sezilarli oshiradi.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
