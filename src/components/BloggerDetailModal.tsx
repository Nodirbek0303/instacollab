import {
  Award,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Eye,
  Instagram,
  MapPin,
  MessageSquare,
  Phone,
  PieChart,
  Send as TelegramIcon,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Video,
} from 'lucide-react';

import type { BloggerProfile } from '../types';
import { formatFollowers, formatUzs, instagramUrl, telegramUrl } from '../lib/format';
import { Modal } from './Modal';

interface BloggerDetailModalProps {
  blogger: BloggerProfile | null;
  isOpen: boolean;
  /** Faqat reklama beruvchi bog'lanish tugmalarini ko'radi. */
  canContact: boolean;
  onClose: () => void;
  onOpenChat: (bloggerId: string) => void;
  onShowPhone: (name: string, phone: string) => void;
}

export function BloggerDetailModal({
  blogger,
  isOpen,
  canContact,
  onClose,
  onOpenChat,
  onShowPhone,
}: BloggerDetailModalProps) {
  if (!blogger) return null;

  const igUrl = instagramUrl(blogger.username);
  const tgUrl = telegramUrl(blogger.contactTelegram);
  const pricing = blogger.pricing;
  const hasPricing = Boolean(pricing && (pricing.story || pricing.post || pricing.reels));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      tone="dark"
      eyebrow="Bloger media kiti"
      title={blogger.name}
      icon={<Instagram className="w-4 h-4 text-pink-300" aria-hidden="true" />}
      bodyClassName="p-6 space-y-6"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-1 font-medium text-xs text-slate-500">
            <Award className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
            Bajarilgan hamkorliklar: <strong className="text-slate-800">{blogger.completedDeals}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-600 hover:text-slate-900 font-bold px-4 py-2 rounded-xl hover:bg-slate-200 transition cursor-pointer text-xs"
          >
            Yopish
          </button>
        </div>
      }
    >
      {/* Shapka */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative shrink-0">
          <img
            src={blogger.avatar}
            alt={`${blogger.name} profil rasmi`}
            className="w-20 h-20 rounded-2xl object-cover border-2 border-purple-100 shadow-md"
          />
          {blogger.isVerified && (
            <span className="absolute -bottom-1.5 -right-1.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white p-1 rounded-full shadow-md">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="sr-only">Tasdiqlangan bloger</span>
            </span>
          )}
        </div>

        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold bg-purple-100 text-purple-900 px-3 py-1 rounded-xl">{blogger.niche}</span>
            <span className="text-[10px] font-black uppercase bg-pink-50 border border-pink-200 text-pink-800 px-2 py-0.5 rounded-md">
              {blogger.tier}
            </span>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200 flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              {blogger.rating} / 5.0
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 font-medium flex-wrap">
            {igUrl && (
              <a
                href={igUrl}
                target="_blank"
                rel="noreferrer"
                className="text-pink-600 hover:text-pink-800 font-bold flex items-center gap-1 transition"
              >
                <Instagram className="w-3.5 h-3.5" aria-hidden="true" />
                <span>@{blogger.username}</span>
                <ExternalLink className="w-3 h-3 opacity-70" aria-hidden="true" />
              </a>
            )}
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-pink-500" aria-hidden="true" />
              {blogger.city}
            </span>
          </div>

          <p className="text-xs text-slate-700 leading-relaxed">
            {blogger.bio || 'Instagram orqali professional reklama va integratsiyalar.'}
          </p>
        </div>
      </div>

      {/* BOG'LANISH — ilgari media kitda kontaktlar umuman ko'rsatilmasdi */}
      {canContact && (
      <div className="bg-gradient-to-r from-purple-50 to-pink-50/60 border border-purple-100 rounded-2xl p-4 space-y-2.5">
        <h3 className="text-xs font-black text-purple-950 uppercase tracking-wider">
          To'g'ridan-to'g'ri bog'lanish
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenChat(blogger.id)}
            className="px-3 py-2 bg-white border border-purple-200 hover:bg-purple-100 text-purple-900 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5 text-purple-600" aria-hidden="true" />
            <span>Sayt chatida yozish</span>
          </button>

          {tgUrl && (
            <a
              href={tgUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
            >
              <TelegramIcon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{blogger.contactTelegram}</span>
            </a>
          )}

          {blogger.phone && (
            <button
              type="button"
              onClick={() => onShowPhone(blogger.name, blogger.phone ?? '')}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{blogger.phone}</span>
            </button>
          )}
        </div>
      </div>
      )}

      {/* Ko'rsatkichlar */}
      <section className="space-y-2">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-purple-600" aria-hidden="true" />
          <span>Instagram faollik ko'rsatkichlari</span>
        </h3>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-purple-50/60 border border-purple-100 p-3 rounded-2xl">
            <dt className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-500 mb-0.5">
              <Users className="w-3.5 h-3.5 text-purple-600" aria-hidden="true" />
              <span>Obunachilar</span>
            </dt>
            <dd className="text-base font-black text-slate-900">{formatFollowers(blogger.followersCount)}</dd>
          </div>
          <div className="bg-purple-50/60 border border-purple-100 p-3 rounded-2xl">
            <dt className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-500 mb-0.5">
              <Eye className="w-3.5 h-3.5 text-purple-600" aria-hidden="true" />
              <span>Story ko'rish</span>
            </dt>
            <dd className="text-base font-black text-purple-800">{formatFollowers(blogger.avgStoryViews)}</dd>
          </div>
          <div className="bg-purple-50/60 border border-purple-100 p-3 rounded-2xl">
            <dt className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-500 mb-0.5">
              <Video className="w-3.5 h-3.5 text-pink-600" aria-hidden="true" />
              <span>Reels qamrovi</span>
            </dt>
            <dd className="text-base font-black text-pink-700">{formatFollowers(blogger.avgReelsViews)}</dd>
          </div>
          <div className="bg-purple-50/60 border border-purple-100 p-3 rounded-2xl">
            <dt className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-500 mb-0.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
              <span>ER faollik</span>
            </dt>
            <dd className="text-base font-black text-emerald-600">{blogger.engagementRate}%</dd>
          </div>
        </dl>
      </section>

      {/* Tariflar */}
      {hasPricing && pricing && (
        <section className="space-y-2">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" aria-hidden="true" />
            <span>Blogerning taxminiy tariflari</span>
          </h3>

          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {pricing.story ? (
              <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-2xl text-center">
                <dt className="text-[10px] font-bold text-slate-500 uppercase">1x Story</dt>
                <dd className="text-xs font-black text-slate-900 mt-1">{formatUzs(pricing.story)}</dd>
              </div>
            ) : null}
            {pricing.post ? (
              <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-2xl text-center">
                <dt className="text-[10px] font-bold text-slate-500 uppercase">1x Post</dt>
                <dd className="text-xs font-black text-slate-900 mt-1">{formatUzs(pricing.post)}</dd>
              </div>
            ) : null}
            {pricing.reels ? (
              <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-2xl text-center">
                <dt className="text-[10px] font-bold text-slate-500 uppercase">1x Reels integratsiya</dt>
                <dd className="text-xs font-black text-slate-900 mt-1">{formatUzs(pricing.reels)}</dd>
              </div>
            ) : null}
          </dl>
          <p className="text-[11px] text-slate-500">
            Narxlar blogerning o'zi ko'rsatgan taxminiy tariflari — yakuniy shart o'zaro kelishuvda belgilanadi.
          </p>
        </section>
      )}

      {/* Auditoriya */}
      {blogger.audienceDemographics && (
        <section className="space-y-3 bg-purple-50/40 p-4 rounded-2xl border border-purple-100">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <PieChart className="w-4 h-4 text-purple-600" aria-hidden="true" />
            <span>Auditoriya demografiyasi</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-white p-3 rounded-xl border border-purple-100">
              <div className="flex justify-between font-bold text-slate-700 mb-1">
                <span>Erkaklar: {blogger.audienceDemographics.malePercentage}%</span>
                <span>Ayollar: {blogger.audienceDemographics.femalePercentage}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex" aria-hidden="true">
                <div style={{ width: `${blogger.audienceDemographics.malePercentage}%` }} className="bg-blue-500 h-full" />
                <div style={{ width: `${blogger.audienceDemographics.femalePercentage}%` }} className="bg-pink-500 h-full" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Asosiy yosh toifasi:{' '}
                <span className="font-bold text-slate-600">{blogger.audienceDemographics.topAge}</span>
              </p>
            </div>

            <div className="bg-white p-3 rounded-xl border border-purple-100">
              <h4 className="font-bold text-slate-700 mb-1">Top shaharlar</h4>
              <dl className="space-y-1">
                {blogger.audienceDemographics.topCities.map((city) => (
                  <div key={city.city} className="flex justify-between text-[11px]">
                    <dt className="text-slate-600">{city.city}</dt>
                    <dd className="font-bold text-purple-700">{city.percentage}%</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      )}
    </Modal>
  );
}
