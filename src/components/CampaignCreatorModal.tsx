import { useEffect, useState } from 'react';
import { Building2, Instagram, Phone, Plus, Send, Send as TelegramIcon, X } from 'lucide-react';

import type { BrandProfile, CampaignFormat } from '../types';
import { CAMPAIGN_FORMATS, NICHES } from '../types';
import { ApiError } from '../lib/api';
import { Modal } from './Modal';

interface CampaignCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBrand: BrandProfile;
  onCreateCampaign: (input: Record<string, unknown>) => Promise<void>;
}

const inputClass =
  'w-full px-4 py-2.5 rounded-2xl border border-purple-100 text-xs bg-purple-50/30 text-slate-900 focus:bg-white focus:outline-none focus:border-purple-300 font-medium shadow-inner';
const smallInputClass =
  'w-full px-3 py-2 rounded-xl border border-purple-100 text-xs bg-white text-slate-900 focus:outline-none focus:border-purple-300 shadow-xs font-medium';
const labelClass = 'block text-xs font-bold text-slate-700 mb-1';

export function CampaignCreatorModal({
  isOpen,
  onClose,
  currentBrand,
  onCreateCampaign,
}: CampaignCreatorModalProps) {
  // MUHIM: barcha hooklar erta `return`dan oldin chaqiriladi (React Hooks qoidasi).
  const [contactInstagram, setContactInstagram] = useState('');
  const [contactTelegram, setContactTelegram] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [productDesc, setProductDesc] = useState('');
  const [niche, setNiche] = useState<string>(NICHES[0]);
  const [format, setFormat] = useState<CampaignFormat>('Reels Integratsiya');
  const [deadlineDays, setDeadlineDays] = useState(5);
  const [requiredFollowersMin, setRequiredFollowersMin] = useState(10000);
  const [targetAudience, setTargetAudience] = useState('');
  const [talkingPoints, setTalkingPoints] = useState<string[]>([
    "Mahsulotning asosiy afzalliklarini ko'rsatish",
    'Instagram profil havolasini belgilash',
  ]);
  const [newPoint, setNewPoint] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Har ochilishda kontaktlarni faol brenddan oldindan to'ldiramiz.
  useEffect(() => {
    if (!isOpen) return;
    setContactTelegram(currentBrand.contactTelegram);
    setContactInstagram(currentBrand.websiteOrInstagram || currentBrand.username);
    setPhone(currentBrand.phone);
    setNiche(currentBrand.category || NICHES[0]);
    setError(null);
  }, [isOpen, currentBrand]);

  const handleAddTalkingPoint = () => {
    const clean = newPoint.trim();
    if (!clean) return;
    setTalkingPoints((prev) => [...prev, clean]);
    setNewPoint('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await onCreateCampaign({
        brandId: currentBrand.id,
        title,
        description: productDesc,
        niche,
        format,
        deadlineDays,
        requiredFollowersMin,
        targetAudience,
        talkingPoints,
        hashtags: [`#${currentBrand.name.replace(/\s+/g, '')}`, '#reklama', '#hamkorlik'],
        contactTelegram,
        contactInstagram,
        phone,
      });

      // Muvaffaqiyatli bo'lsa formani tozalab yopamiz.
      setTitle('');
      setProductDesc('');
      setTargetAudience('');
      setTalkingPoints([
        "Mahsulotning asosiy afzalliklarini ko'rsatish",
        'Instagram profil havolasini belgilash',
      ]);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof ApiError ? submitError.message : "E'lonni joylab bo'lmadi. Qayta urinib ko'ring.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      eyebrow="Reklama beruvchi portali"
      title="Yangi Reklama E'lon Qilish"
      icon={<Building2 className="w-4 h-4 text-pink-600" aria-hidden="true" />}
      bodyClassName="p-0"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {/* E'lon qaysi brend nomidan chiqishi — endi aniq ko'rsatiladi.
            Ilgari bu yerda alohida "brend nomi" maydoni bor edi, lekin uning
            qiymati saqlanmasdan faol brend nomiga almashtirilardi. */}
        <div className="flex items-center gap-3 bg-purple-50/60 border border-purple-100 rounded-2xl p-3.5">
          <img
            src={currentBrand.logo}
            alt={`${currentBrand.name} logotipi`}
            className="w-11 h-11 rounded-2xl object-cover border border-purple-200"
          />
          <div className="min-w-0">
            <span className="text-[10px] uppercase tracking-wider font-bold text-purple-900 block">
              E'lon shu brend nomidan joylanadi
            </span>
            <p className="text-sm font-black text-slate-900 truncate">{currentBrand.name}</p>
            <p className="text-[11px] text-slate-500">
              Boshqa brend nomidan bermoqchi bo'lsangiz, «Akaunt» bo'limidan hisobni almashtiring.
            </p>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-2xl p-3">
            {error}
          </p>
        )}

        <div>
          <label htmlFor="select-campaign-niche" className={labelClass}>
            Yo'nalish (Niche) *
          </label>
          <select
            id="select-campaign-niche"
            value={niche}
            onChange={(event) => setNiche(event.target.value)}
            className={`${inputClass} font-bold cursor-pointer`}
          >
            {NICHES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="bg-purple-50/50 border border-purple-100 rounded-2xl p-4 space-y-3">
          <legend className="text-xs font-bold text-purple-950 uppercase tracking-wider px-1">
            To'g'ridan-to'g'ri bog'lanish kontaktlaringiz *
          </legend>
          <p className="text-[11px] text-slate-500">
            Blogerlar siz bilan shu ma'lumotlar yoki sayt ichidagi chat orqali bog'lanishadi:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="input-campaign-telegram" className="block text-[11px] font-bold text-slate-700 mb-1">
                <TelegramIcon className="w-3 h-3 text-sky-500 inline mr-1" aria-hidden="true" />
                Telegram username *
              </label>
              <input
                id="input-campaign-telegram"
                type="text"
                required
                maxLength={64}
                value={contactTelegram}
                onChange={(event) => setContactTelegram(event.target.value)}
                placeholder="@menejer_nomi"
                className={smallInputClass}
              />
            </div>

            <div>
              <label htmlFor="input-campaign-instagram" className="block text-[11px] font-bold text-slate-700 mb-1">
                <Instagram className="w-3 h-3 text-pink-500 inline mr-1" aria-hidden="true" />
                Instagram profil *
              </label>
              <input
                id="input-campaign-instagram"
                type="text"
                required
                maxLength={60}
                value={contactInstagram}
                onChange={(event) => setContactInstagram(event.target.value)}
                placeholder="@brend_uz"
                className={smallInputClass}
              />
            </div>

            <div>
              <label htmlFor="input-campaign-phone" className="block text-[11px] font-bold text-slate-700 mb-1">
                <Phone className="w-3 h-3 text-emerald-500 inline mr-1" aria-hidden="true" />
                Telefon raqam *
              </label>
              <input
                id="input-campaign-phone"
                type="tel"
                required
                maxLength={32}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+998 90 123-45-67"
                className={smallInputClass}
              />
            </div>
          </div>
        </fieldset>

        <div>
          <label htmlFor="input-campaign-title" className={labelClass}>
            E'lon sarlavhasi *
          </label>
          <input
            id="input-campaign-title"
            type="text"
            required
            maxLength={140}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Masalan: 'Yangi ochilgan filialimizga 3 ta bloger taklif qilamiz'"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="textarea-campaign-desc" className={labelClass}>
            Mahsulot / reklama haqida to'liq ma'lumot *
          </label>
          <textarea
            id="textarea-campaign-desc"
            required
            rows={3}
            maxLength={2000}
            value={productDesc}
            onChange={(event) => setProductDesc(event.target.value)}
            placeholder="Mahsulot yoki xizmat nima haqida, qanday blogerlar qidirilmoqda..."
            className={`${inputClass} leading-relaxed`}
          />
        </div>

        <div>
          <label htmlFor="input-campaign-audience" className={labelClass}>
            Maqsadli auditoriya
          </label>
          <input
            id="input-campaign-audience"
            type="text"
            maxLength={200}
            value={targetAudience}
            onChange={(event) => setTargetAudience(event.target.value)}
            placeholder="Masalan: 'Toshkentdagi 18-30 yoshli qizlar'"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="select-campaign-format" className={labelClass}>
              Reklama formati *
            </label>
            <select
              id="select-campaign-format"
              value={format}
              onChange={(event) => setFormat(event.target.value as CampaignFormat)}
              className={`${inputClass} font-bold cursor-pointer`}
            >
              {CAMPAIGN_FORMATS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="input-campaign-min-followers" className={labelClass}>
              Minimal obunachilar soni
            </label>
            <input
              id="input-campaign-min-followers"
              type="number"
              min={0}
              step={500}
              value={requiredFollowersMin}
              onChange={(event) => setRequiredFollowersMin(Math.max(0, Number(event.target.value)))}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="input-campaign-deadline" className={labelClass}>
              Tayyorlash muddati (kun)
            </label>
            <input
              id="input-campaign-deadline"
              type="number"
              min={1}
              max={90}
              value={deadlineDays}
              onChange={(event) => setDeadlineDays(Math.min(90, Math.max(1, Number(event.target.value))))}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="input-campaign-new-point" className={labelClass}>
            Asosiy talablar &amp; shartlar
          </label>
          <div className="flex gap-2 mb-2">
            <input
              id="input-campaign-new-point"
              type="text"
              maxLength={200}
              value={newPoint}
              onChange={(event) => setNewPoint(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleAddTalkingPoint();
                }
              }}
              placeholder="Yangi talab qo'shish..."
              className="flex-1 px-3.5 py-2 rounded-xl border border-purple-100 text-xs bg-purple-50/30 text-slate-900 focus:bg-white focus:outline-none focus:border-purple-300"
            />
            <button
              type="button"
              onClick={handleAddTalkingPoint}
              className="px-3 py-2 bg-purple-100 text-purple-900 hover:bg-purple-200 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Qo'shish</span>
            </button>
          </div>

          <ul className="space-y-1.5 list-none p-0 m-0">
            {talkingPoints.map((point, index) => (
              <li
                key={`${point}-${index}`}
                className="flex items-center justify-between bg-purple-50/50 px-3 py-1.5 rounded-xl text-xs text-slate-700"
              >
                <span>• {point}</span>
                <button
                  type="button"
                  onClick={() => setTalkingPoints((prev) => prev.filter((_, i) => i !== index))}
                  aria-label={`"${point}" talabini o'chirish`}
                  className="text-rose-500 hover:text-rose-700 ml-2 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-4 border-t border-purple-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-2xl border border-purple-200 text-slate-600 text-xs font-bold hover:bg-purple-50 cursor-pointer"
          >
            Bekor qilish
          </button>
          <button
            type="submit"
            id="btn-publish-campaign"
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 hover:from-violet-700 hover:via-purple-700 hover:to-pink-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg shadow-purple-600/25 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5 text-pink-200" aria-hidden="true" />
            <span>{isSubmitting ? 'Joylanmoqda…' : "E'lonni joylashtirish"}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
