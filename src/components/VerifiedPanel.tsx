import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Clock, Palette, Send, Sparkles, TrendingUp } from 'lucide-react';

import type { BloggerProfile, VerificationRequest } from '../types';
import { EARLY_ACCESS_MINUTES } from '../types';
import { ApiError, api } from '../lib/api';
import { COLOR_PRESETS, DEFAULT_VERIFIED_COLOR, safeColor } from '../lib/verified';

interface VerifiedPanelProps {
  profile: BloggerProfile;
  onToast: (kind: 'success' | 'error', text: string) => void;
}

const PERKS = [
  {
    Icon: Clock,
    title: `E'lonlarni ${EARLY_ACCESS_MINUTES} daqiqa oldin ko'rasiz`,
    body: "Yangi reklama e'loni avval ptichkalilarga ochiladi. Ariza yuborishga birinchi bo'lib ulgurasiz.",
  },
  {
    Icon: TrendingUp,
    title: 'Arizangiz ro‘yxatda tepada turadi',
    body: "Brend kelgan arizalarni ko'rganda sizniki eng yuqorida bo'ladi — tanlanish ehtimoli oshadi.",
  },
  {
    Icon: Palette,
    title: 'Profil rangini o‘zingiz tanlaysiz',
    body: 'Tanlagan rangingiz katalogda hammaga shu ko‘rinishda chiqadi va kartangiz ajralib turadi.',
  },
];

export function VerifiedPanel({ profile, onToast }: VerifiedPanelProps) {
  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [color, setColor] = useState<string>(safeColor(profile.themeColor) ?? DEFAULT_VERIFIED_COLOR);

  const load = useCallback(async () => {
    try {
      const result = await api.myVerification();
      setRequest(result.request);
      setPrice(result.price);
    } catch {
      // Ma'lumot olinmasa panel baribir ko'rsatiladi — tugma ishlayveradi.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setColor(safeColor(profile.themeColor) ?? DEFAULT_VERIFIED_COLOR);
  }, [profile.themeColor]);

  const submit = async () => {
    setBusy(true);
    try {
      const created = await api.requestVerification(note.trim() || undefined);
      setRequest(created);
      setNote('');
      onToast('success', "So'rov yuborildi. Administrator siz bilan bog'lanadi.");
    } catch (error) {
      onToast('error', error instanceof ApiError ? error.message : "So'rovni yuborib bo'lmadi");
    } finally {
      setBusy(false);
    }
  };

  const applyColor = async (next: string | null) => {
    setBusy(true);
    try {
      const result = await api.setThemeColor(next);
      setColor(result.themeColor ?? DEFAULT_VERIFIED_COLOR);
      onToast('success', next ? 'Rang saqlandi — hamma shu rangda ko‘radi.' : 'Rang asl holiga qaytdi.');
    } catch (error) {
      onToast('error', error instanceof ApiError ? error.message : 'Rangni saqlab bo‘lmadi');
    } finally {
      setBusy(false);
    }
  };

  const accent = safeColor(profile.themeColor) ?? DEFAULT_VERIFIED_COLOR;

  /* ---------------- Ptichkasi bor ---------------- */

  if (profile.isVerified) {
    return (
      <section
        className="ic-verified bg-white border rounded-3xl p-5 sm:p-6"
        style={{ ['--ic-accent' as string]: accent, borderColor: `${accent}59` }}
      >
        <div className="flex items-center gap-2.5 mb-1">
          <BadgeCheck className="w-5 h-5" style={{ color: accent }} aria-hidden="true" />
          <h3 className="text-sm font-black text-slate-900">Sizda rasmiy ptichka bor</h3>
        </div>
        <p className="text-xs text-slate-600 mb-5">
          E'lonlarni {EARLY_ACCESS_MINUTES} daqiqa oldin ko'rasiz, arizangiz brend ro'yxatida tepada
          turadi va profil rangini o'zingiz tanlaysiz.
        </p>

        <div className="border-t border-slate-100 pt-4">
          <label className="block text-xs font-bold text-slate-700 mb-2">
            Profil rangi — katalogda hammaga shu rangda ko'rinasiz
          </label>

          <div className="flex flex-wrap gap-2 mb-3">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={busy}
                aria-label={`Rang ${preset}`}
                aria-pressed={color === preset}
                onClick={() => void applyColor(preset)}
                style={{ background: preset }}
                className={`w-8 h-8 rounded-xl cursor-pointer transition disabled:opacity-50 ${
                  color === preset
                    ? 'ring-2 ring-offset-2 ring-slate-900 scale-110'
                    : 'hover:scale-105 ring-1 ring-black/10'
                }`}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span>Yoki o'zingiz tanlang:</span>
              <input
                type="color"
                value={color}
                disabled={busy}
                onChange={(event) => setColor(event.target.value)}
                className="w-10 h-9 rounded-lg border border-slate-200 cursor-pointer bg-white p-0.5"
              />
            </label>

            <button
              type="button"
              disabled={busy}
              onClick={() => void applyColor(color)}
              className="text-[11px] font-black px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
            >
              Shu rangni saqlash
            </button>

            {profile.themeColor && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void applyColor(null)}
                className="text-[11px] font-bold px-3 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition cursor-pointer disabled:opacity-50"
              >
                Standart rang
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-500 mt-2">
            Juda och ranglar oq fonda o'qilmaydi, shuning uchun ular qabul qilinmaydi.
          </p>
        </div>
      </section>
    );
  }

  /* ---------------- Ptichkasi yo'q ---------------- */

  const pending = request?.status === 'pending';

  return (
    <section className="bg-gradient-to-br from-violet-50 via-white to-purple-50 border border-violet-200 rounded-3xl p-5 sm:p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <Sparkles className="w-5 h-5 text-violet-600" aria-hidden="true" />
        <h3 className="text-sm font-black text-slate-900">Rasmiy ptichka</h3>
      </div>
      <p className="text-xs text-slate-600 mb-4">
        Profilingizda rasmiy tasdiq belgisi paydo bo'ladi va uchta imtiyoz ochiladi.
      </p>

      <ul className="space-y-2.5 mb-5">
        {PERKS.map(({ Icon, title, body }) => (
          <li key={title} className="flex gap-2.5">
            <Icon className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-xs font-black text-slate-900">{title}</p>
              <p className="text-[11px] text-slate-600 leading-relaxed">{body}</p>
            </div>
          </li>
        ))}
      </ul>

      {price && (
        <p className="text-xs font-bold text-violet-900 bg-violet-100/70 border border-violet-200 rounded-2xl px-3 py-2 mb-4">
          Narxi: {price}
        </p>
      )}

      {pending ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-3.5 py-3">
          <p className="text-xs font-black text-amber-900">So'rovingiz ko'rib chiqilmoqda</p>
          <p className="text-[11px] text-amber-800/80 mt-0.5">
            Administrator to'lov va tafsilotlar bo'yicha siz bilan bog'lanadi. Javob Telegram orqali
            ham keladi.
          </p>
        </div>
      ) : (
        <>
          {request?.status === 'rejected' && (
            <p className="text-[11px] font-bold text-rose-900 bg-rose-50 border border-rose-200 rounded-2xl px-3 py-2 mb-3">
              Oldingi so'rovingiz rad etilgan.
              {request.decisionNote ? ` Sabab: ${request.decisionNote}` : ''} Qayta yuborishingiz mumkin.
            </p>
          )}

          <label className="block mb-3">
            <span className="text-xs font-bold text-slate-700">Izoh (ixtiyoriy)</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder="To'lov haqida savol yoki qo'shimcha ma'lumot"
              className="mt-1.5 w-full px-3.5 py-2.5 rounded-2xl border border-violet-200 text-xs outline-none focus:border-violet-400 resize-none bg-white"
            />
          </label>

          <button
            type="button"
            id="btn-request-verification"
            disabled={busy}
            onClick={() => void submit()}
            className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white text-xs font-black px-4 py-3 rounded-2xl shadow-md shadow-violet-600/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            {busy ? 'Yuborilmoqda…' : "Ptichka olish uchun so'rov yuborish"}
          </button>

          <p className="text-[11px] text-slate-500 mt-2 text-center">
            So'rov administratorga boradi. To'lov tartibini u tushuntiradi.
          </p>
        </>
      )}
    </section>
  );
}
