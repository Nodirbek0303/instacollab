import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Instagram,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Send,
  Send as TelegramIcon,
  Trash2,
  Users,
} from 'lucide-react';

import type { BloggerProfile, BrandProfile, Campaign, ProposalBid, UserRole } from '../types';
import { NICHE_FILTERS } from '../types';
import { formatFollowers, formatTimestamp, instagramUrl, telegramUrl } from '../lib/format';
import { ApiError } from '../lib/api';
import { Modal } from './Modal';
import { PhoneDialog } from './PhoneDialog';

interface CampaignMarketplaceProps {
  campaigns: Campaign[];
  /** Bloger hisobida — o'z profili; reklama beruvchida `null`. */
  currentBlogger: BloggerProfile | null;
  /** Reklama beruvchi hisobida — o'z brendi; blogerda `null`. */
  currentBrand: BrandProfile | null;
  userRole: UserRole;
  existingBids: ProposalBid[];
  onApplyBid: (input: Record<string, unknown>) => Promise<void>;
  onOpenCreateCampaign: () => void;
  onAcceptBid: (bid: ProposalBid) => void;
  onDeleteCampaign: (campaignId: string) => void;
  onOpenChatWithBlogger: (bloggerId: string) => void;
  onOpenChatWithBrand: (brandId: string) => void;
  /** Botdan kelgan e'lon — ochilganda avtomatik ko'rsatiladi va ajratib turadi. */
  highlightCampaignId?: string | null;
  onHighlightShown?: () => void;
}

const inputClass =
  'w-full px-4 py-2.5 rounded-2xl border border-purple-100 text-xs bg-purple-50/30 text-slate-900 focus:bg-white focus:outline-none focus:border-purple-300 shadow-inner font-medium';

export function CampaignMarketplace({
  campaigns,
  currentBlogger,
  currentBrand,
  userRole,
  existingBids,
  onApplyBid,
  onOpenCreateCampaign,
  onAcceptBid,
  onDeleteCampaign,
  onOpenChatWithBlogger,
  onOpenChatWithBrand,
  highlightCampaignId = null,
  onHighlightShown,
}: CampaignMarketplaceProps) {
  const isAdvertiser = userRole === 'advertiser';

  const [selectedNiche, setSelectedNiche] = useState<string>('Barchasi');
  const [searchQuery, setSearchQuery] = useState('');
  const [advertiserViewMode, setAdvertiserViewMode] = useState<'my_campaigns' | 'all'>('my_campaigns');
  const [bloggerViewMode, setBloggerViewMode] = useState<'explore' | 'my_bids'>('explore');

  const [applyTarget, setApplyTarget] = useState<Campaign | null>(null);
  const [bidMessage, setBidMessage] = useState('');
  const [creativeIdea, setCreativeIdea] = useState('');
  const [bidTelegram, setBidTelegram] = useState('');
  const [bidPhone, setBidPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [phoneTarget, setPhoneTarget] = useState<{ name: string; phone: string } | null>(null);
  const highlightRef = useRef<HTMLLIElement>(null);

  /** Botdan kelgan e'lonni ro'yxatda topib, ekranga aylantiramiz. */
  useEffect(() => {
    if (!highlightCampaignId) return;
    // Kerakli ko'rinishga o'tamiz, aks holda e'lon ro'yxatda bo'lmaydi.
    if (isAdvertiser) setAdvertiserViewMode('all');
    else setBloggerViewMode('explore');
    setSelectedNiche('Barchasi');
    setSearchQuery('');

    const scrollTimer = window.setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    // Ajratib turuvchi ramka bir necha soniyadan keyin so'nadi.
    const clearTimer = window.setTimeout(() => onHighlightShown?.(), 4000);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [highlightCampaignId, isAdvertiser, onHighlightShown]);

  const filteredCampaigns = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      if (selectedNiche !== 'Barchasi' && campaign.niche !== selectedNiche) return false;
      if (!query) return true;
      return (
        campaign.title.toLowerCase().includes(query) ||
        campaign.brandName.toLowerCase().includes(query) ||
        campaign.description.toLowerCase().includes(query)
      );
    });
  }, [campaigns, searchQuery, selectedNiche]);

  const myBrandCampaigns = useMemo(
    () => (currentBrand ? campaigns.filter((c) => c.brandId === currentBrand.id) : []),
    [campaigns, currentBrand],
  );

  const myBids = useMemo(
    () => (currentBlogger ? existingBids.filter((b) => b.bloggerId === currentBlogger.id) : []),
    [existingBids, currentBlogger],
  );

  const openApplyModal = (campaign: Campaign) => {
    setApplyTarget(campaign);
    setBidMessage('');
    setCreativeIdea('');
    setBidTelegram(currentBlogger?.contactTelegram ?? '');
    setBidPhone(currentBlogger?.phone ?? '');
    setApplyError(null);
  };

  const handleSubmitBid = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!applyTarget || isSubmitting) return;

    setIsSubmitting(true);
    setApplyError(null);
    try {
      await onApplyBid({
        campaignId: applyTarget.id,
        bloggerTelegram: bidTelegram,
        bloggerPhone: bidPhone,
        message: bidMessage,
        creativeIdea,
      });
      setApplyTarget(null);
    } catch (error) {
      setApplyError(error instanceof ApiError ? error.message : "Arizani yuborib bo'lmadi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const showAllCampaigns =
    (isAdvertiser && advertiserViewMode === 'all') || (!isAdvertiser && bloggerViewMode === 'explore');

  /** E'lon talabiga javob bermaslik sababi — yoki `null`, agar hammasi joyida bo'lsa. */
  const requirementIssue = (campaign: Campaign): string | null =>
    currentBlogger && currentBlogger.followersCount < campaign.requiredFollowersMin
      ? `Bu e'lon uchun kamida ${formatFollowers(campaign.requiredFollowersMin)} obunachi kerak — sizda ${formatFollowers(currentBlogger.followersCount)}.`
      : null;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <section className="bg-gradient-to-r from-violet-950 via-purple-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-purple-950/15 relative overflow-hidden border border-purple-800/30">
        <div
          className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-pink-500/20 via-purple-500/20 to-transparent rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        <div className="max-w-3xl relative z-10">
          <span className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/20 text-rose-300 text-xs font-semibold px-3 py-1 rounded-full mb-3">
            <Building2 className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
            <span>{isAdvertiser ? 'Reklama beruvchi portali' : "To'g'ridan-to'g'ri aloqa & e'lonlar bozori"}</span>
          </span>

          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-2">
            {isAdvertiser ? "Reklama E'lonlaringiz & Bog'lanishlar" : "Brendlarning Reklama E'lonlari"}
          </h2>
          <p className="text-purple-200/80 text-xs sm:text-sm leading-relaxed mb-4">
            {isAdvertiser
              ? "Yangi e'lon bering — blogerlar siz bilan chat, Telegram, Instagram yoki telefon orqali bog'lanishadi."
              : "Brendlar e'lonlarini ko'ring va sayt chati, Telegram, Instagram yoki telefon orqali to'g'ridan-to'g'ri bog'laning."}
          </p>

          <div className="flex flex-wrap items-center gap-3 text-xs text-purple-200">
            <span className="bg-white/10 backdrop-blur-md border border-white/15 px-3.5 py-1.5 rounded-2xl">
              {campaigns.length} ta faol e'lon
            </span>
            {isAdvertiser && (
              <button
                type="button"
                onClick={onOpenCreateCampaign}
                className="bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 hover:from-pink-600 hover:via-rose-600 hover:to-amber-600 text-white font-bold px-4 py-1.5 rounded-2xl shadow-md shadow-pink-500/25 flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Yangi reklama berish</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Boshqaruv */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-purple-100/90 rounded-3xl p-4 shadow-sm">
        <div
          role="group"
          aria-label="Ko'rinishni tanlash"
          className="flex items-center gap-1 bg-purple-50/80 p-1 rounded-2xl border border-purple-100"
        >
          {isAdvertiser ? (
            <>
              <button
                type="button"
                aria-pressed={advertiserViewMode === 'my_campaigns'}
                onClick={() => setAdvertiserViewMode('my_campaigns')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  advertiserViewMode === 'my_campaigns'
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-purple-600/20'
                    : 'text-slate-600 hover:text-purple-950'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Mening reklamalarim ({myBrandCampaigns.length})</span>
              </button>
              <button
                type="button"
                aria-pressed={advertiserViewMode === 'all'}
                onClick={() => setAdvertiserViewMode('all')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  advertiserViewMode === 'all'
                    ? 'bg-white text-purple-950 shadow-xs border border-purple-100'
                    : 'text-slate-600 hover:text-purple-950'
                }`}
              >
                Barcha e'lonlar ({campaigns.length})
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                aria-pressed={bloggerViewMode === 'explore'}
                onClick={() => setBloggerViewMode('explore')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  bloggerViewMode === 'explore'
                    ? 'bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 text-white shadow-md shadow-pink-500/20'
                    : 'text-slate-600 hover:text-pink-950'
                }`}
              >
                E'lonlarni ko'rish ({campaigns.length})
              </button>
              <button
                type="button"
                aria-pressed={bloggerViewMode === 'my_bids'}
                onClick={() => setBloggerViewMode('my_bids')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  bloggerViewMode === 'my_bids'
                    ? 'bg-white text-pink-950 shadow-xs border border-pink-200'
                    : 'text-slate-600 hover:text-pink-950'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-pink-500" aria-hidden="true" />
                <span>Topshirgan arizalarim ({myBids.length})</span>
              </button>
            </>
          )}
        </div>

        <div className="relative w-full sm:w-72">
          <label htmlFor="input-search-campaigns" className="sr-only">
            E'lonlarni qidirish
          </label>
          <Search
            className="w-4 h-4 text-purple-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="input-search-campaigns"
            type="search"
            placeholder="Brend yoki e'lon nomi bo'yicha..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-9 pr-3.5 py-2 rounded-2xl border border-purple-100 bg-purple-50/30 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-purple-300 shadow-inner font-medium"
          />
        </div>
      </div>

      {showAllCampaigns && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {NICHE_FILTERS.map((niche) => (
            <button
              key={niche}
              type="button"
              aria-pressed={selectedNiche === niche}
              onClick={() => setSelectedNiche(niche)}
              className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                selectedNiche === niche
                  ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-purple-600/20'
                  : 'bg-white border border-purple-100 text-slate-600 hover:border-purple-300 hover:bg-purple-50/40'
              }`}
            >
              {niche}
            </button>
          ))}
        </div>
      )}

      {/* 1. REKLAMA BERUVCHI: mening e'lonlarim va kelgan arizalar */}
      {isAdvertiser && advertiserViewMode === 'my_campaigns' && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                «{currentBrand?.name}» brendi joylagan reklamalar
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Blogerlar yuborgan takliflarni ko'ring va to'g'ridan-to'g'ri bog'laning.
              </p>
            </div>

            <button
              type="button"
              onClick={onOpenCreateCampaign}
              className="bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 text-white font-bold text-xs px-4 py-2 rounded-2xl shadow-md shadow-purple-600/25 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Yangi reklama berish</span>
            </button>
          </div>

          {myBrandCampaigns.length === 0 ? (
            <div className="bg-white border border-purple-100 rounded-3xl p-8 text-center space-y-3">
              <Building2 className="w-12 h-12 text-purple-300 mx-auto" aria-hidden="true" />
              <h3 className="text-sm font-bold text-slate-800">Siz hali reklama bermadingiz</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Birinchi e'loningizni bering va blogerlar to'g'ridan-to'g'ri siz bilan bog'lanishadi.
              </p>
              <button
                type="button"
                onClick={onOpenCreateCampaign}
                className="bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold text-xs px-5 py-2.5 rounded-2xl shadow-md shadow-purple-600/25 cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Birinchi reklamani berish</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {myBrandCampaigns.map((campaign) => {
                const campaignBids = existingBids.filter((b) => b.campaignId === campaign.id);
                const tgUrl = telegramUrl(campaign.contactTelegram);

                return (
                  <article
                    key={campaign.id}
                    className="bg-white border border-purple-100 rounded-3xl p-6 shadow-md shadow-purple-950/5 space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-purple-100">
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-[10px] bg-purple-100 text-purple-900 font-bold px-2 py-0.5 rounded-full">
                            {campaign.niche}
                          </span>
                          <span className="text-[10px] bg-pink-100 text-pink-900 font-bold px-2 py-0.5 rounded-full">
                            {campaign.format}
                          </span>
                          <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                            {campaign.bidsCount} ta ariza
                          </span>
                          <span className="text-[10px] text-slate-400">Joylandi: {campaign.createdDate}</span>
                        </div>
                        <h3 className="text-sm font-black text-slate-900">{campaign.title}</h3>
                        {campaign.targetAudience && (
                          <p className="text-[11px] text-slate-500 mt-1">
                            Auditoriya: <strong className="text-slate-700">{campaign.targetAudience}</strong>
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {tgUrl && (
                          <a
                            href={tgUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 text-xs font-bold flex items-center gap-1 hover:bg-sky-100 transition"
                          >
                            <TelegramIcon className="w-3 h-3" aria-hidden="true" />
                            <span>{campaign.contactTelegram}</span>
                          </a>
                        )}
                        {campaign.phone && (
                          <button
                            type="button"
                            onClick={() => setPhoneTarget({ name: campaign.brandName, phone: campaign.phone })}
                            className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1 hover:bg-emerald-100 transition cursor-pointer"
                          >
                            <Phone className="w-3 h-3" aria-hidden="true" />
                            <span>{campaign.phone}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          id={`btn-delete-campaign-${campaign.id}`}
                          onClick={() => setCampaignToDelete(campaign)}
                          aria-label={`«${campaign.title}» e'lonini o'chirish`}
                          className="p-2 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 hover:text-rose-800 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {campaign.dosAndDonts &&
                      (campaign.dosAndDonts.dos.length > 0 || campaign.dosAndDonts.donts.length > 0) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                          {campaign.dosAndDonts.dos.length > 0 && (
                            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3">
                              <h4 className="font-black text-emerald-900 uppercase tracking-wider mb-1">
                                Qilish kerak
                              </h4>
                              <ul className="space-y-0.5 text-emerald-900/90 pl-4 list-disc">
                                {campaign.dosAndDonts.dos.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {campaign.dosAndDonts.donts.length > 0 && (
                            <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-3">
                              <h4 className="font-black text-rose-900 uppercase tracking-wider mb-1">
                                Qilmaslik kerak
                              </h4>
                              <ul className="space-y-0.5 text-rose-900/90 pl-4 list-disc">
                                {campaign.dosAndDonts.donts.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-purple-950 uppercase tracking-wider flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-purple-600" aria-hidden="true" />
                        <span>Qiziqish bildirgan blogerlar ({campaignBids.length} ta)</span>
                      </h4>

                      {campaignBids.length === 0 ? (
                        <p className="bg-purple-50/40 border border-dashed border-purple-200 rounded-2xl p-4 text-center text-xs text-slate-500">
                          Ushbu e'loningizga hozircha ariza kelmadi.
                        </p>
                      ) : (
                        <ul className="grid grid-cols-1 gap-3 list-none p-0 m-0">
                          {campaignBids.map((bid) => {
                            const bidTg = telegramUrl(bid.bloggerTelegram);
                            const bidIg = instagramUrl(bid.bloggerUsername);

                            return (
                              <li
                                key={bid.id}
                                className="bg-purple-50/30 border border-purple-100 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:border-purple-300 transition"
                              >
                                <div className="flex items-start gap-3 min-w-0">
                                  <img
                                    src={bid.bloggerAvatar}
                                    alt={`${bid.bloggerName} profil rasmi`}
                                    className="w-11 h-11 rounded-2xl object-cover border border-purple-100 shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h5 className="text-xs font-bold text-slate-900">{bid.bloggerName}</h5>
                                      {bidIg && (
                                        <a
                                          href={bidIg}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-[11px] text-pink-600 hover:underline font-semibold flex items-center gap-0.5"
                                        >
                                          <Instagram className="w-3 h-3" aria-hidden="true" />@{bid.bloggerUsername}
                                        </a>
                                      )}
                                      <span className="text-[10px] bg-white border border-purple-100 text-slate-600 px-1.5 py-0.5 rounded-md font-medium">
                                        {formatFollowers(bid.bloggerFollowers)} obunachi
                                      </span>
                                      {bid.belowRequirement && (
                                        <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded-md font-bold flex items-center gap-1">
                                          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                                          Talabdan past
                                        </span>
                                      )}
                                    </div>

                                    <p className="text-xs text-slate-700 font-medium mt-1 leading-relaxed">
                                      «{bid.message}»
                                    </p>

                                    {bid.creativeIdea && (
                                      <p className="mt-1.5 text-[11px] text-purple-900 bg-white/80 border border-purple-100 px-2.5 py-1 rounded-xl inline-block">
                                        <strong>Kreativ g'oya:</strong> {bid.creativeIdea}
                                      </p>
                                    )}

                                    <p className="text-[10px] text-slate-400 mt-1">
                                      Yuborildi: {formatTimestamp(bid.submittedAt)}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 shrink-0 justify-end">
                                  {bidTg && (
                                    <a
                                      href={bidTg}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-3 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                                    >
                                      <TelegramIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                      <span>Telegram</span>
                                    </a>
                                  )}

                                  {bid.bloggerPhone && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPhoneTarget({ name: bid.bloggerName, phone: bid.bloggerPhone ?? '' })
                                      }
                                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                                    >
                                      <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                                      <span>Telefon</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => onOpenChatWithBlogger(bid.bloggerId)}
                                    className="px-3 py-2 bg-white border border-purple-200 hover:bg-purple-100 text-purple-900 rounded-xl transition cursor-pointer text-xs font-bold flex items-center gap-1.5"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5 text-purple-600" aria-hidden="true" />
                                    <span>Chatda yozish</span>
                                  </button>

                                  {bid.status === 'accepted' ? (
                                    <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                                      Kelishildi
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => onAcceptBid(bid)}
                                      className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white text-xs font-extrabold px-3 py-2 rounded-xl transition cursor-pointer flex items-center gap-1"
                                    >
                                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                      <span>Tasdiqlash</span>
                                    </button>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 2. BLOGER: topshirgan arizalarim */}
      {!isAdvertiser && bloggerViewMode === 'my_bids' && (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">Siz topshirgan takliflar ({myBids.length})</h2>
            <p className="text-xs text-slate-500 font-medium">Brendlarga yuborgan arizalaringiz va ularning holati.</p>
          </div>

          {myBids.length === 0 ? (
            <div className="bg-white border border-purple-100 rounded-3xl p-8 text-center space-y-3">
              <Briefcase className="w-12 h-12 text-pink-300 mx-auto" aria-hidden="true" />
              <h3 className="text-sm font-bold text-slate-800">Siz hali ariza qoldirmadingiz</h3>
              <button
                type="button"
                onClick={() => setBloggerViewMode('explore')}
                className="bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 text-white font-bold text-xs px-5 py-2.5 rounded-2xl shadow-md shadow-pink-500/25 cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>Reklamalarni ko'rishga o'tish</span>
              </button>
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 list-none p-0 m-0">
              {myBids.map((bid) => (
                <li
                  key={bid.id}
                  className="bg-white border border-purple-100 rounded-3xl p-5 shadow-sm space-y-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-bold text-slate-500 uppercase truncate">{bid.brandName}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          bid.status === 'accepted'
                            ? 'bg-emerald-100 text-emerald-800'
                            : bid.status === 'rejected'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {bid.status === 'accepted'
                          ? 'Kelishildi'
                          : bid.status === 'rejected'
                            ? 'Rad etildi'
                            : "Ko'rib chiqilmoqda"}
                      </span>
                    </div>

                    <h3 className="text-xs font-bold text-slate-900 leading-snug">{bid.campaignTitle}</h3>
                    <p className="text-xs text-slate-600 font-medium mt-2 bg-purple-50/40 p-2.5 rounded-xl">
                      «{bid.message}»
                    </p>

                    {bid.belowRequirement && (
                      <p className="mt-2 text-[11px] font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>Obunachilar soni e'lon talabidan past — brend rad etishi mumkin.</span>
                      </p>
                    )}
                  </div>

                  <p className="pt-3 border-t border-purple-100 text-[11px] text-purple-700 font-semibold">
                    Yuborildi: {formatTimestamp(bid.submittedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* 3. UMUMIY E'LONLAR RO'YXATI */}
      {showAllCampaigns && (
        <>
          {filteredCampaigns.length === 0 ? (
            <div className="bg-white border border-purple-100 rounded-3xl p-10 text-center space-y-2">
              <Briefcase className="w-12 h-12 text-purple-300 mx-auto" aria-hidden="true" />
              <h3 className="text-sm font-bold text-slate-800">Bu shartlarga mos e'lon topilmadi</h3>
              <p className="text-xs text-slate-500">Qidiruv so'zi yoki yo'nalish filtrini o'zgartiring.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 xl:grid-cols-2 gap-6 list-none p-0 m-0">
              {filteredCampaigns.map((campaign) => {
                const hasApplied = existingBids.some(
                  (b) => b.campaignId === campaign.id && b.bloggerId === currentBlogger?.id,
                );
                const isOwner = campaign.brandId === currentBrand?.id;
                const issue = requirementIssue(campaign);
                const tgUrl = telegramUrl(campaign.contactTelegram);
                const igUrl = instagramUrl(campaign.contactInstagram);

                return (
                  <li
                    key={campaign.id}
                    id={`card-campaign-${campaign.id}`}
                    ref={campaign.id === highlightCampaignId ? highlightRef : undefined}
                    className={`bg-white rounded-3xl p-5 shadow-md shadow-purple-950/5 hover:shadow-xl transition-all duration-200 flex flex-col justify-between ${
                      campaign.id === highlightCampaignId
                        ? 'border-2 border-violet-500 ring-4 ring-violet-200/60'
                        : 'border border-purple-100/90 hover:border-purple-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={campaign.brandLogo}
                            alt={`${campaign.brandName} logotipi`}
                            className="w-11 h-11 rounded-2xl object-cover border border-purple-100 shrink-0"
                          />
                          <div className="min-w-0">
                            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider truncate">
                              {campaign.brandName}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="text-[10px] bg-purple-50 border border-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full">
                                {campaign.niche}
                              </span>
                              <span className="text-[10px] bg-pink-50 border border-pink-100 text-pink-700 font-bold px-2 py-0.5 rounded-full">
                                {campaign.format}
                              </span>
                            </div>
                          </div>
                        </div>

                        {isAdvertiser && isOwner && (
                          <button
                            type="button"
                            onClick={() => setCampaignToDelete(campaign)}
                            aria-label={`«${campaign.title}» e'lonini o'chirish`}
                            className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition cursor-pointer border border-rose-200 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      <h4 className="font-bold text-sm text-slate-900 mb-1.5 leading-snug">{campaign.title}</h4>
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-3">{campaign.description}</p>

                      {campaign.talkingPoints.length > 0 && (
                        <div className="bg-purple-50/40 border border-purple-100/60 rounded-2xl p-3 mb-3">
                          <h5 className="text-[10px] font-bold text-purple-900 uppercase tracking-wider mb-1">
                            Talablar
                          </h5>
                          <ul className="text-xs text-slate-600 space-y-1 list-none p-0 m-0">
                            {campaign.talkingPoints.slice(0, 2).map((point) => (
                              <li key={point} className="flex items-start gap-1.5 text-[11px]">
                                <span className="text-pink-500 font-bold" aria-hidden="true">
                                  •
                                </span>
                                <span className="line-clamp-1">{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mb-3 font-medium">
                        <span className="flex items-center gap-1 bg-purple-50/60 border border-purple-100/60 px-2.5 py-1 rounded-xl">
                          <Users className="w-3.5 h-3.5 text-purple-500" aria-hidden="true" />
                          Min: <strong className="text-slate-800">{formatFollowers(campaign.requiredFollowersMin)}</strong>
                        </span>
                        <span className="flex items-center gap-1 bg-purple-50/60 border border-purple-100/60 px-2.5 py-1 rounded-xl">
                          <Clock className="w-3.5 h-3.5 text-purple-500" aria-hidden="true" />
                          Muddat: <strong className="text-slate-800">{campaign.deadlineDays} kun</strong>
                        </span>
                        <span className="flex items-center gap-1 bg-purple-50/60 border border-purple-100/60 px-2.5 py-1 rounded-xl">
                          <Send className="w-3.5 h-3.5 text-purple-500" aria-hidden="true" />
                          <strong className="text-slate-800">{campaign.bidsCount}</strong> ta ariza
                        </span>
                      </div>

                      {campaign.targetAudience && (
                        <p className="text-[11px] text-slate-500 mb-3">
                          Auditoriya: <strong className="text-slate-700">{campaign.targetAudience}</strong>
                        </p>
                      )}

                      {campaign.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {campaign.hashtags.slice(0, 5).map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] font-semibold text-slate-500 bg-slate-100/80 px-1.5 py-0.5 rounded-md"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="bg-gradient-to-r from-purple-50 to-pink-50/50 border border-purple-100 rounded-2xl p-2.5 mb-3 space-y-1.5">
                        <h5 className="text-[10px] font-bold text-purple-950 uppercase tracking-wider">
                          Reklama beruvchi bilan bog'lanish
                        </h5>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {tgUrl && (
                            <a
                              href={tgUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-[11px] font-bold flex items-center gap-1 transition"
                            >
                              <TelegramIcon className="w-3 h-3" aria-hidden="true" />
                              <span>{campaign.contactTelegram}</span>
                            </a>
                          )}
                          {igUrl && (
                            <a
                              href={igUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white text-[11px] font-bold flex items-center gap-1 transition"
                            >
                              <Instagram className="w-3 h-3" aria-hidden="true" />
                              <span>@{campaign.contactInstagram}</span>
                            </a>
                          )}
                          {campaign.phone && (
                            <button
                              type="button"
                              onClick={() => setPhoneTarget({ name: campaign.brandName, phone: campaign.phone })}
                              className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                            >
                              <Phone className="w-3 h-3" aria-hidden="true" />
                              <span>{campaign.phone}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-purple-50 space-y-2">
                      {/* Talabga javob bermaslik sababi — ariza tugmasi bloklanadi (ilgari tekshiruv umuman yo'q edi) */}
                      {!isAdvertiser && issue && !hasApplied && (
                        <p className="text-[11px] font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5 flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>{issue}</span>
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => onOpenChatWithBrand(campaign.brandId)}
                          disabled={isAdvertiser && isOwner}
                          className="px-3 py-2 bg-white border border-purple-200 hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed text-purple-900 text-xs font-bold rounded-2xl transition flex items-center gap-1.5 cursor-pointer"
                          title={isAdvertiser && isOwner ? "Bu sizning o'z e'loningiz" : undefined}
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-purple-600" aria-hidden="true" />
                          <span>Chat orqali yozish</span>
                        </button>

                        {!isAdvertiser &&
                          (hasApplied ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-3.5 py-2 rounded-2xl border border-emerald-200">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                              Ariza qoldirildi
                            </span>
                          ) : (
                            <button
                              type="button"
                              id={`btn-apply-campaign-${campaign.id}`}
                              onClick={() => openApplyModal(campaign)}
                              disabled={issue !== null}
                              className="bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 hover:from-violet-700 hover:via-purple-700 hover:to-pink-700 disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-2 rounded-2xl shadow-md shadow-purple-600/20 transition flex items-center gap-1.5 cursor-pointer"
                            >
                              <Send className="w-3.5 h-3.5 text-pink-200" aria-hidden="true" />
                              <span>Ariza qoldirish</span>
                            </button>
                          ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <PhoneDialog target={phoneTarget} onClose={() => setPhoneTarget(null)} />

      {/* O'chirishni tasdiqlash */}
      <Modal
        isOpen={campaignToDelete !== null}
        onClose={() => setCampaignToDelete(null)}
        size="md"
        eyebrow="Tasdiqlash"
        title="E'lonni o'chirmoqchimisiz?"
        icon={<Trash2 className="w-4 h-4 text-rose-600" aria-hidden="true" />}
        bodyClassName="p-6"
        footer={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCampaignToDelete(null)}
              className="flex-1 py-2.5 rounded-2xl border border-purple-200 text-xs font-bold text-slate-600 hover:bg-purple-50 cursor-pointer"
            >
              Bekor qilish
            </button>
            <button
              type="button"
              onClick={() => {
                if (campaignToDelete) onDeleteCampaign(campaignToDelete.id);
                setCampaignToDelete(null);
              }}
              className="flex-1 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/20 cursor-pointer"
            >
              Ha, o'chirish
            </button>
          </div>
        }
      >
        <p className="text-xs text-slate-600 text-center">
          «<strong className="text-slate-900">{campaignToDelete?.title}</strong>» e'loni va unga kelgan barcha arizalar
          butunlay o'chiriladi. Bu amalni qaytarib bo'lmaydi.
        </p>
      </Modal>

      {/* Ariza yuborish */}
      <Modal
        isOpen={applyTarget !== null}
        onClose={() => setApplyTarget(null)}
        eyebrow="Reklamani tanlash & taklif yuborish"
        title={applyTarget ? `${applyTarget.brandName} — ${applyTarget.title}` : ''}
        bodyClassName="p-0"
      >
        {applyTarget && (
          <form onSubmit={handleSubmitBid} className="p-6 space-y-4">
            <dl className="bg-purple-50/50 border border-purple-100 rounded-2xl p-4 flex flex-wrap justify-between items-start text-xs gap-3">
              <div>
                <dt className="text-slate-500 font-medium">Reklama beruvchi</dt>
                <dd className="font-extrabold text-slate-900 text-sm">{applyTarget.brandName}</dd>
              </div>
              <div>
                <dt className="text-slate-500 font-medium">Format</dt>
                <dd className="font-extrabold text-pink-600">{applyTarget.format}</dd>
              </div>
              <div>
                <dt className="text-slate-500 font-medium">Minimal obunachi</dt>
                <dd className="font-extrabold text-purple-900">
                  {formatFollowers(applyTarget.requiredFollowersMin)}
                </dd>
              </div>
            </dl>

            {applyTarget.dosAndDonts &&
              (applyTarget.dosAndDonts.dos.length > 0 || applyTarget.dosAndDonts.donts.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  {applyTarget.dosAndDonts.dos.length > 0 && (
                    <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3">
                      <h3 className="font-black text-emerald-900 uppercase tracking-wider mb-1">Qilish kerak</h3>
                      <ul className="space-y-0.5 text-emerald-900/90 pl-4 list-disc">
                        {applyTarget.dosAndDonts.dos.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {applyTarget.dosAndDonts.donts.length > 0 && (
                    <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-3">
                      <h3 className="font-black text-rose-900 uppercase tracking-wider mb-1">Qilmaslik kerak</h3>
                      <ul className="space-y-0.5 text-rose-900/90 pl-4 list-disc">
                        {applyTarget.dosAndDonts.donts.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

            {applyError && (
              <p role="alert" className="text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-2xl p-3">
                {applyError}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="input-bid-telegram" className="block text-xs font-bold text-slate-700 mb-1">
                  <TelegramIcon className="w-3 h-3 text-sky-500 inline mr-1" aria-hidden="true" />
                  Sizning Telegram username *
                </label>
                <input
                  id="input-bid-telegram"
                  type="text"
                  required
                  maxLength={64}
                  value={bidTelegram}
                  onChange={(event) => setBidTelegram(event.target.value)}
                  placeholder="@bloger_telegram"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="input-bid-phone" className="block text-xs font-bold text-slate-700 mb-1">
                  <Phone className="w-3 h-3 text-emerald-500 inline mr-1" aria-hidden="true" />
                  Sizning telefon raqamingiz *
                </label>
                <input
                  id="input-bid-phone"
                  type="tel"
                  required
                  maxLength={32}
                  value={bidPhone}
                  onChange={(event) => setBidPhone(event.target.value)}
                  placeholder="+998 90 123-45-67"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="textarea-bid-message" className="block text-xs font-bold text-slate-700 mb-1">
                Brendga xat / taklif matni *
              </label>
              <textarea
                id="textarea-bid-message"
                required
                rows={3}
                maxLength={1500}
                value={bidMessage}
                onChange={(event) => setBidMessage(event.target.value)}
                placeholder="Assalomu alaykum! Men ushbu reklamangizni o'z profilimda sifatli va samimiy qilib yetkazib berishga tayyorman..."
                className={`${inputClass} leading-relaxed`}
              />
            </div>

            <div>
              <label htmlFor="input-bid-creative-idea" className="block text-xs font-bold text-slate-700 mb-1">
                Kreativ g'oyangiz
              </label>
              <input
                id="input-bid-creative-idea"
                type="text"
                maxLength={500}
                value={creativeIdea}
                onChange={(event) => setCreativeIdea(event.target.value)}
                placeholder="Masalan: 'Do'konga borib jonli video olish yoki mahsulotni qutidan ochish'..."
                className={inputClass}
              />
            </div>

            <div className="pt-4 border-t border-purple-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setApplyTarget(null)}
                className="px-4 py-2 rounded-2xl border border-purple-200 text-slate-600 text-xs font-bold hover:bg-purple-50 cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                id="btn-submit-proposal"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 hover:from-violet-700 hover:via-purple-700 hover:to-pink-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg shadow-purple-600/25 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-pink-200" aria-hidden="true" />
                <span>{isSubmitting ? 'Yuborilmoqda…' : 'Arizani yuborish'}</span>
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
