import { useMemo, useState } from 'react';
import {
  BarChart3,
  BadgeCheck,
  UserCheck,
  UserPlus,
  ExternalLink,
  Instagram,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Send as TelegramIcon,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';

import type { BloggerProfile } from '../types';
import { verifiedCardClass, verifiedCardStyle } from '../lib/verified';
import { CITIES, NICHE_FILTERS, TIERS } from '../types';
import { formatFollowers, instagramUrl, telegramUrl } from '../lib/format';
import { BloggerDetailModal } from './BloggerDetailModal';
import { PhoneDialog } from './PhoneDialog';

interface BloggersCatalogProps {
  bloggers: BloggerProfile[];
  /** Faqat reklama beruvchi blogerga yoza oladi — bloger boshqa blogerga emas. */
  canContact: boolean;
  onOpenCreateCampaign: () => void;
  onOpenChatWithBlogger: (bloggerId: string) => void;
  /** Joriy foydalanuvchi bloger bo'lsa — uning profil id'si. Obuna shu asosda. */
  currentBloggerId?: string | null;
  /** Joriy bloger obuna bo'lgan profillar. */
  followingIds?: string[];
  onToggleFollow?: (bloggerId: string) => void;
}

type SortKey = 'followers' | 'stories' | 'reels' | 'er';

const CITY_FILTERS = ['Barchasi', ...CITIES] as const;
const TIER_FILTERS = ['Barchasi', ...TIERS] as const;

export function BloggersCatalog({
  bloggers,
  canContact,
  onOpenCreateCampaign,
  onOpenChatWithBlogger,
  currentBloggerId = null,
  followingIds = [],
  onToggleFollow,
}: BloggersCatalogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNiche, setSelectedNiche] = useState<string>('Barchasi');
  const [selectedCity, setSelectedCity] = useState<string>('Barchasi');
  const [selectedTier, setSelectedTier] = useState<string>('Barchasi');
  const [sortBy, setSortBy] = useState<SortKey>('followers');

  const [detailBlogger, setDetailBlogger] = useState<BloggerProfile | null>(null);
  const [phoneTarget, setPhoneTarget] = useState<{ name: string; phone: string } | null>(null);

  const sortedBloggers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = bloggers.filter((b) => {
      if (selectedNiche !== 'Barchasi' && b.niche !== selectedNiche) return false;
      if (selectedCity !== 'Barchasi' && b.city !== selectedCity) return false;
      if (selectedTier !== 'Barchasi' && b.tier !== selectedTier) return false;
      if (!query) return true;

      return (
        b.name.toLowerCase().includes(query) ||
        b.username.toLowerCase().includes(query) ||
        b.bio.toLowerCase().includes(query) ||
        b.niche.toLowerCase().includes(query) ||
        b.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    });

    return [...filtered].sort((a, b) => {
      // Ptichkalilar har qanday saralashda tepada turadi — bu ptichka
      // beradigan ustunliklardan biri.
      if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1;

      switch (sortBy) {
        case 'stories':
          return b.avgStoryViews - a.avgStoryViews;
        case 'reels':
          return b.avgReelsViews - a.avgReelsViews;
        case 'er':
          return b.engagementRate - a.engagementRate;
        case 'followers':
        default:
          return b.followersCount - a.followersCount;
      }
    });
  }, [bloggers, searchQuery, selectedNiche, selectedCity, selectedTier, sortBy]);

  const resetFilters = () => {
    setSelectedNiche('Barchasi');
    setSelectedCity('Barchasi');
    setSelectedTier('Barchasi');
    setSearchQuery('');
  };

  const hasActiveFilters =
    selectedNiche !== 'Barchasi' ||
    selectedCity !== 'Barchasi' ||
    selectedTier !== 'Barchasi' ||
    searchQuery.trim() !== '';

  return (
    <div className="space-y-6">
      {/* Banner */}
      <section className="bg-gradient-to-r from-violet-950 via-purple-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-purple-950/15 relative overflow-hidden border border-purple-800/30">
        <div
          className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-pink-500/20 via-purple-500/20 to-transparent rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/20 text-rose-300 text-xs font-semibold px-3 py-1 rounded-full">
              <Users className="w-3.5 h-3.5 text-pink-400" aria-hidden="true" />
              <span>Instagram Blogerlari &amp; Statistika Katalogi</span>
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Instagram Blogerlari Statistikasi
            </h2>
            <p className="text-purple-200/80 text-xs sm:text-sm max-w-2xl leading-relaxed">
              O'zbekistondagi faol blogerlarning obunachilari, Story ko'rishlari, Reels qamrovi va tariflarini
              solishtiring. Yoqqan blogerga to'g'ridan-to'g'ri — chat, Telegram yoki telefon orqali yozing.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-purple-200/90 font-medium">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
                <strong className="text-white font-bold">{bloggers.length} ta</strong> bloger
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-pink-400" aria-hidden="true" />
                Statistikalar blogerlarning o'zi tomonidan kiritilgan
              </span>
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                Vositachilik to'lovisiz
              </span>
            </div>
          </div>

          {canContact && (
            <button
              type="button"
              id="btn-catalog-create-campaign"
              onClick={onOpenCreateCampaign}
              className="bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 hover:from-pink-600 hover:via-rose-600 hover:to-amber-600 text-white font-extrabold text-xs sm:text-sm px-6 py-4 rounded-2xl shadow-lg shadow-pink-500/25 transition flex items-center gap-2 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Reklama E'loni Joylash</span>
            </button>
          )}
        </div>
      </section>

      {/* Filtrlar */}
      <section aria-label="Filtrlar" className="bg-white border border-purple-100/90 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <label htmlFor="input-search-bloggers" className="sr-only">
              Blogerlarni qidirish
            </label>
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="input-search-bloggers"
              type="search"
              placeholder="Bloger ismi, @username, yo'nalish yoki #teglar bo'yicha qidirish..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full pl-10 pr-10 py-3 bg-purple-50/30 border border-purple-100/90 rounded-2xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-purple-300 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Qidiruvni tozalash"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap sm:flex-nowrap gap-2.5">
            <div>
              <label htmlFor="select-catalog-city" className="sr-only">
                Shahar
              </label>
              <select
                id="select-catalog-city"
                value={selectedCity}
                onChange={(event) => setSelectedCity(event.target.value)}
                className="px-3.5 py-2.5 bg-purple-50/40 border border-purple-100/90 rounded-2xl text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:border-purple-300 cursor-pointer"
              >
                {CITY_FILTERS.map((city) => (
                  <option key={city} value={city}>
                    {city === 'Barchasi' ? 'Barcha shaharlar' : city}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="select-catalog-tier" className="sr-only">
                Bloger darajasi
              </label>
              <select
                id="select-catalog-tier"
                value={selectedTier}
                onChange={(event) => setSelectedTier(event.target.value)}
                className="px-3.5 py-2.5 bg-purple-50/40 border border-purple-100/90 rounded-2xl text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:border-purple-300 cursor-pointer"
              >
                {TIER_FILTERS.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier === 'Barchasi' ? 'Barcha darajalar' : tier}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="select-catalog-sort" className="sr-only">
                Tartiblash
              </label>
              <select
                id="select-catalog-sort"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortKey)}
                className="px-3.5 py-2.5 bg-purple-50/40 border border-purple-100/90 rounded-2xl text-xs font-bold text-slate-700 focus:bg-white focus:outline-none focus:border-purple-300 cursor-pointer"
              >
                <option value="followers">Eng ko'p obunachi</option>
                <option value="stories">Eng ko'p Story ko'rish</option>
                <option value="reels">Eng ko'p Reels qamrovi</option>
                <option value="er">Eng yuqori faollik (ER%)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Sohalar bo'yicha:</span>
            <span className="text-purple-600 text-[11px]">{NICHE_FILTERS.length - 1} ta toifa</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {NICHE_FILTERS.map((niche) => (
              <button
                key={niche}
                type="button"
                aria-pressed={selectedNiche === niche}
                onClick={() => setSelectedNiche(niche)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  selectedNiche === niche
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-xs'
                    : 'bg-purple-50/50 hover:bg-purple-100/70 text-slate-600 border border-purple-100/60'
                }`}
              >
                {niche}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-2">
        <p aria-live="polite">
          Topildi: <strong className="text-slate-900 font-black">{sortedBloggers.length} ta</strong> bloger
        </p>
        {hasActiveFilters && (
          <button type="button" onClick={resetFilters} className="text-violet-600 hover:underline font-bold cursor-pointer">
            Filtrlarni tozalash
          </button>
        )}
      </div>

      {sortedBloggers.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-purple-100 shadow-sm space-y-3">
          <Users className="w-12 h-12 text-purple-300 mx-auto" aria-hidden="true" />
          <h3 className="text-base font-extrabold text-slate-900">Hech qanday bloger topilmadi</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Qidiruv so'zini yoki filtrlarni o'zgartirib qayta urinib ko'ring.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="px-4 py-2 rounded-2xl bg-purple-100 text-purple-900 text-xs font-bold hover:bg-purple-200 transition cursor-pointer"
          >
            Filtrlarni Tiklash
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 list-none p-0 m-0">
          {sortedBloggers.map((blogger) => {
            const igUrl = instagramUrl(blogger.username);
            const tgUrl = telegramUrl(blogger.contactTelegram);

            return (
              <li
                key={blogger.id}
                style={verifiedCardStyle(blogger)}
                className={`bg-white border border-purple-100/90 hover:border-purple-300 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden ${verifiedCardClass(blogger)}`}
              >
                <div
                  className="ic-accent-bar absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-violet-500 via-purple-500 to-pink-500 opacity-80"
                  aria-hidden="true"
                />

                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <img
                          src={blogger.avatar}
                          alt={`${blogger.name} profil rasmi`}
                          className="w-13 h-13 rounded-2xl object-cover border-2 border-purple-100 shadow-xs"
                        />
                        {blogger.isVerified && (
                          <span
                            className="absolute -bottom-1 -right-1 text-white p-0.5 rounded-full shadow-sm ring-2 ring-white"
                            style={{ background: 'var(--ic-accent, #7c3aed)' }}
                            title="Rasmiy tasdiqlangan bloger"
                          >
                            <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />
                            <span className="sr-only">Rasmiy tasdiqlangan</span>
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <h3 className="font-extrabold text-sm text-slate-900 truncate">{blogger.name}</h3>
                        {igUrl && (
                          <a
                            href={igUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-bold text-pink-600 hover:text-pink-700 flex items-center gap-1 transition"
                          >
                            <Instagram className="w-3 h-3" aria-hidden="true" />
                            <span>@{blogger.username}</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    </div>

                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-50 text-purple-900 border border-purple-100/80 shrink-0">
                      {blogger.tier}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 mb-3">
                    <span className="bg-slate-100 px-2 py-0.5 rounded-md text-slate-700 font-bold">{blogger.niche}</span>
                    <span aria-hidden="true">•</span>
                    <span className="flex items-center gap-0.5 text-slate-600">
                      <MapPin className="w-3 h-3 text-pink-500" aria-hidden="true" />
                      {blogger.city}
                    </span>
                  </div>

                  <dl className="grid grid-cols-4 gap-1.5 bg-purple-50/40 p-2.5 rounded-2xl border border-purple-100/60 mb-3 text-center">
                    <div>
                      <dt className="text-[9px] text-slate-400 font-bold uppercase">Obunachi</dt>
                      <dd className="text-xs font-black text-slate-900 mt-0.5">
                        {formatFollowers(blogger.followersCount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[9px] text-slate-400 font-bold uppercase">Story</dt>
                      <dd className="text-xs font-black text-purple-700 mt-0.5">
                        {formatFollowers(blogger.avgStoryViews)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[9px] text-slate-400 font-bold uppercase">Reels</dt>
                      <dd className="text-xs font-black text-pink-700 mt-0.5">
                        {formatFollowers(blogger.avgReelsViews)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[9px] text-slate-400 font-bold uppercase">Faollik</dt>
                      <dd className="text-xs font-black text-emerald-600 mt-0.5">{blogger.engagementRate}%</dd>
                    </div>
                  </dl>

                  {/* Platformadagi haqiqiy ish statistikasi — arizalardan hisoblanadi. */}
                  <dl className="grid grid-cols-3 gap-1.5 bg-slate-50 p-2.5 rounded-2xl border border-slate-100 mb-3 text-center">
                    <div>
                      <dt className="text-[9px] text-slate-400 font-bold uppercase">Zakaz</dt>
                      <dd className="text-xs font-black text-slate-900 mt-0.5 tabular-nums">
                        {blogger.stats?.ordersTotal ?? 0}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[9px] text-slate-400 font-bold uppercase">Bajarilgan</dt>
                      <dd className="text-xs font-black text-emerald-700 mt-0.5 tabular-nums">
                        {blogger.stats?.ordersCompleted ?? 0}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[9px] text-slate-400 font-bold uppercase">Obunachi</dt>
                      <dd className="text-xs font-black text-violet-700 mt-0.5 tabular-nums">
                        {blogger.stats?.followers ?? 0}
                      </dd>
                    </div>
                  </dl>

                  {blogger.audienceDemographics && (
                    <div className="bg-slate-50/80 rounded-xl p-2 mb-3 border border-slate-100 flex items-center justify-between text-[10px] text-slate-600">
                      <span className="font-semibold">
                        Ayollar: <strong className="text-pink-600">{blogger.audienceDemographics.femalePercentage}%</strong>{' '}
                        / Erkaklar: <strong className="text-blue-600">{blogger.audienceDemographics.malePercentage}%</strong>
                      </span>
                      <span className="bg-white px-1.5 py-0.5 rounded-md border border-slate-200 font-bold text-slate-700">
                        {blogger.audienceDemographics.topAge}
                      </span>
                    </div>
                  )}

                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-3">
                    {blogger.bio || 'Instagram orqali sifatli reklama va kontent integratsiyalari.'}
                  </p>

                  {blogger.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {blogger.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-semibold text-slate-500 bg-slate-100/80 px-1.5 py-0.5 rounded-md"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* TO'G'RIDAN-TO'G'RI BOG'LANISH — faqat reklama beruvchi uchun.
                    Bloger boshqa blogerning telefoni yoki Telegramini ko'rmaydi. */}
                <div className="pt-3 border-t border-purple-50 space-y-2">
                  {/* Obuna — faqat bloger boshqa blogerga. */}
                  {currentBloggerId && currentBloggerId !== blogger.id && onToggleFollow && (
                    <button
                      type="button"
                      id={`btn-follow-${blogger.id}`}
                      aria-pressed={followingIds.includes(blogger.id)}
                      onClick={() => onToggleFollow(blogger.id)}
                      className={`w-full px-2.5 py-2 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                        followingIds.includes(blogger.id)
                          ? 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                          : 'bg-violet-600 text-white border-violet-600 hover:bg-violet-700'
                      }`}
                    >
                      {followingIds.includes(blogger.id) ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Obuna bo'lgansiz</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Obuna bo'lish</span>
                        </>
                      )}
                    </button>
                  )}

                  {canContact && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenChatWithBlogger(blogger.id)}
                      className="flex-1 min-w-[120px] px-2.5 py-2 bg-white border border-purple-200 hover:bg-purple-50 text-purple-900 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-purple-600" aria-hidden="true" />
                      <span>Chatda yozish</span>
                    </button>

                    {tgUrl && (
                      <a
                        href={tgUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-[11px] font-bold flex items-center gap-1 transition"
                        title={`${blogger.name} bilan Telegramda bog'lanish`}
                      >
                        <TelegramIcon className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Telegram</span>
                      </a>
                    )}

                    {blogger.phone && (
                      <button
                        type="button"
                        onClick={() => setPhoneTarget({ name: blogger.name, phone: blogger.phone ?? '' })}
                        className="px-2.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                        title={`${blogger.name} telefon raqami`}
                      >
                        <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Telefon</span>
                      </button>
                    )}
                  </div>
                  )}

                  <button
                    type="button"
                    id={`btn-mediakit-${blogger.id}`}
                    onClick={() => setDetailBlogger(blogger)}
                    className="w-full bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 hover:from-violet-700 hover:via-purple-700 hover:to-pink-700 text-white font-extrabold text-xs py-2.5 px-4 rounded-2xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <BarChart3 className="w-4 h-4 text-purple-200" aria-hidden="true" />
                    <span>Statistika &amp; Media Kitni Ko'rish</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <BloggerDetailModal
        blogger={detailBlogger}
        isOpen={detailBlogger !== null}
        canContact={canContact}
        onClose={() => setDetailBlogger(null)}
        onOpenChat={(bloggerId) => {
          setDetailBlogger(null);
          onOpenChatWithBlogger(bloggerId);
        }}
        onShowPhone={(name, phone) => setPhoneTarget({ name, phone })}
      />

      <PhoneDialog
        target={phoneTarget}
        onClose={() => setPhoneTarget(null)}
      />
    </div>
  );
}
