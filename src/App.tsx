import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Flag, Loader2, X } from 'lucide-react';

import type {
  AuthPayload,
  BloggerProfile,
  BrandProfile,
  Campaign,
  PlatformState,
  ProposalBid,
} from './types';
import { REPORT_REASONS } from './types';
import { ApiError, api, type AppConfig, type RegisterInput } from './lib/api';
import { cachedState, savedTab } from './lib/storage';
import { getInitData, initTelegram, isTelegramMiniApp } from './lib/telegram';
import { applyEvent, connectLive } from './lib/live';
import { AdminPanel } from './components/AdminPanel';
import { Modal } from './components/Modal';

import { AuthScreen } from './components/AuthScreen';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { CampaignMarketplace } from './components/CampaignMarketplace';
import { CampaignCreatorModal } from './components/CampaignCreatorModal';
import { CreatorProfileStudio } from './components/CreatorProfileStudio';
import { BrandProfileStudio } from './components/BrandProfileStudio';
import { ChatDealModal } from './components/ChatDealModal';
import { HowItWorksModal } from './components/HowItWorksModal';
import { AccountModal } from './components/AccountModal';

const EMPTY_STATE: PlatformState = {
  brands: [],
  bloggers: [],
  campaigns: [],
  bids: [],
  messages: [],
};

type Toast = { kind: 'success' | 'error'; text: string };

export default function App() {
  /* ---------------- Autentifikatsiya ---------------- */

  const [auth, setAuth] = useState<AuthPayload | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [config, setConfig] = useState<AppConfig | null>(null);
  /** Telegram Mini App ichidamizmi — kirish ekrani va menyular shunga qarab o'zgaradi. */
  const [inTelegram] = useState(() => isTelegramMiniApp());
  /** Telegram orqali kirishda yuzaga kelgan xato (masalan hisob ulanmagan). */
  const [telegramAuthError, setTelegramAuthError] = useState<string | null>(null);
  /**
   * Botdagi tugma orqali kelgan buyruq: `?action=new-campaign` yoki `?campaign=<id>`.
   * Kirish tugagach bir marta bajariladi va tozalanadi.
   */
  const [deepLink] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return { action: params.get('action'), campaignId: params.get('campaign') };
  });
  const [deepLinkDone, setDeepLinkDone] = useState(false);
  const [highlightCampaignId, setHighlightCampaignId] = useState<string | null>(null);
  /** Jonli oqim ulanganmi — sarlavhadagi kichik belgi shuni ko'rsatadi. */
  const [isLive, setIsLive] = useState(false);
  /** Hisob admin huquqiga egami — panel shu asosda ko'rsatiladi. */
  const [isAdmin, setIsAdmin] = useState(false);
  /** Shikoyat qilinayotgan e'lon. */
  const [reportTarget, setReportTarget] = useState<Campaign | null>(null);
  const [reportReason, setReportReason] = useState<string>(REPORT_REASONS[0]);
  const [reportComment, setReportComment] = useState('');
  const [reportBusy, setReportBusy] = useState(false);

  /* ---------------- Ma'lumotlar ---------------- */

  const [data, setData] = useState<PlatformState>(EMPTY_STATE);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('campaigns');

  const [isCampaignCreatorOpen, setIsCampaignCreatorOpen] = useState(false);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  const [chatPartner, setChatPartner] = useState<
    { brand: BrandProfile; blogger: BloggerProfile } | null
  >(null);

  const userRole = auth?.account.role ?? 'advertiser';

  /* ---------------- Sessiyani tekshirish ---------------- */

  // Ochiq sozlamalar (Telegram bot manzili, demo rejimi).
  useEffect(() => {
    let cancelled = false;
    api
      .getConfig()
      .then((next) => {
        if (!cancelled) setConfig(next);
      })
      .catch(() => {
        /* sozlamalar bo'lmasa ham ilova ishlayveradi */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    initTelegram();
  }, []);

  useEffect(() => {
    let cancelled = false;

    /**
     * Avval mavjud sessiyani tekshiramiz. Sessiya bo'lmasa va ilova Telegram
     * ichida ochilgan bo'lsa — `initData` orqali parolsiz kiramiz.
     */
    const authenticate = async () => {
      try {
        const payload = await api.me();
        if (!cancelled) setAuth(payload);
        return;
      } catch {
        // Sessiya yo'q — quyida Telegram orqali urinib ko'ramiz.
      }

      const initData = getInitData();
      if (!initData) return;

      try {
        const payload = await api.loginWithTelegram(initData);
        if (!cancelled) setAuth(payload);
      } catch (error) {
        if (!cancelled && error instanceof ApiError && error.status === 403) {
          setTelegramAuthError(error.message);
        }
      }
    };

    void authenticate().finally(() => {
      if (!cancelled) setIsCheckingAuth(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------- Ma'lumotlarni yuklash ---------------- */

  const loadState = useCallback(async () => {
    try {
      const next = await api.getState();
      setData(next);
      cachedState.save(next);
      setLoadError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAuth(null);
        cachedState.clear();
        return;
      }
      const cached = cachedState.load();
      if (cached) setData(cached);
      setLoadError(
        error instanceof ApiError
          ? `${error.message}${cached ? " Saqlangan nusxa ko'rsatilmoqda." : ''}`
          : "Ma'lumotlarni yuklab bo'lmadi.",
      );
    }
  }, []);

  useEffect(() => {
    if (!auth) {
      setData(EMPTY_STATE);
      return;
    }
    // Kirgan zahoti keshni ko'rsatamiz, so'ng serverdan yangilaymiz.
    const cached = cachedState.load();
    if (cached) setData(cached);
    void loadState();
  }, [auth, loadState]);

  /* ---------------- Bo'lim (tab) ---------------- */

  useEffect(() => {
    if (!auth) return;
    const saved = savedTab.load();
    // Blogerlar katalogi yopiq — ikkala rol uchun ham faqat ikki bo'lim qoldi.
    const allowed = ['campaigns', 'profile', ...(isAdmin ? ['admin'] : [])];
    setActiveTab(saved && allowed.includes(saved) ? saved : allowed[0]);
  }, [auth, isAdmin]);

  useEffect(() => {
    if (auth) savedTab.save(activeTab);
  }, [auth, activeTab]);

  /**
   * Botdan kelgan buyruqni bajaramiz: e'lon berish formasini ochish yoki
   * ma'lum bir e'lonni ko'rsatish. Manzil qatori tozalanadi, shunda sahifa
   * yangilanganda takrorlanmaydi.
   */
  useEffect(() => {
    if (!auth || deepLinkDone) return;
    if (!deepLink.action && !deepLink.campaignId) return;

    if (deepLink.action === 'new-campaign' && auth.account.role === 'advertiser') {
      setIsCampaignCreatorOpen(true);
    } else if (deepLink.campaignId) {
      setActiveTab('campaigns');
      setHighlightCampaignId(deepLink.campaignId);
    }

    setDeepLinkDone(true);
    window.history.replaceState({}, '', window.location.pathname);
  }, [auth, deepLink, deepLinkDone]);

  /**
   * Jonli yangilanishlar. Kirgandan keyin ulanamiz, chiqishda uzamiz.
   * Kelgan har bir voqea mahalliy holatga qo'shiladi — sahifani yangilash shart emas.
   */
  /**
   * Admin huquqi serverdan so'raladi. Bu faqat interfeys uchun — panelning
   * o'zi ham, har bir amal ham serverda alohida tekshiriladi.
   */
  useEffect(() => {
    if (!auth) {
      setIsAdmin(false);
      return;
    }

    let cancelled = false;
    void api
      .amIAdmin()
      .then((result) => {
        if (!cancelled) setIsAdmin(result.isAdmin);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });

    return () => {
      cancelled = true;
    };
  }, [auth]);

  useEffect(() => {
    if (!auth) {
      setIsLive(false);
      return;
    }

    const disconnect = connectLive({
      onStatus: setIsLive,
      onEvent: (event) => {
        setData((prev) => {
          const next = applyEvent(prev, event);
          cachedState.save(next);
          return next;
        });
      },
    });

    return disconnect;
  }, [auth]);

  /**
   * Ilova fonga o'tib qaytganda (telefon ekrani o'chib yonganda) uzilib qolgan
   * bo'lishi mumkin — shunda ma'lumotni bir marta to'liq yangilaymiz.
   */
  useEffect(() => {
    if (!auth) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadState();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [auth, loadState]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const fail = useCallback((error: unknown, fallback: string) => {
    setToast({ kind: 'error', text: error instanceof ApiError ? error.message : fallback });
  }, []);

  /* ---------------- Joriy profil ---------------- */

  const currentBrand = useMemo<BrandProfile | null>(() => {
    if (!auth || auth.account.role !== 'advertiser') return null;
    return (data.brands.find((b) => b.id === auth.account.profileId) ?? auth.profile) as BrandProfile;
  }, [auth, data.brands]);

  const currentBlogger = useMemo<BloggerProfile | null>(() => {
    if (!auth || auth.account.role !== 'blogger') return null;
    return (data.bloggers.find((b) => b.id === auth.account.profileId) ?? auth.profile) as BloggerProfile;
  }, [auth, data.bloggers]);

  /* ---------------- Kirish/chiqish ---------------- */

  const handleLogin = useCallback(async (phone: string, password: string) => {
    const payload = await api.login(phone, password);
    cachedState.clear();
    setAuth(payload);
  }, []);

  const handleRegister = useCallback(async (input: RegisterInput) => {
    const payload = await api.register(input);
    cachedState.clear();
    setAuth(payload);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Serverga yetib bormasa ham mahalliy holatni tozalaymiz.
    }
    cachedState.clear();
    savedTab.clear();
    setAuth(null);
    setIsAccountModalOpen(false);
  }, []);

  /* ---------------- Amallar ---------------- */

  const handleUpdateBrandProfile = useCallback(
    async (updated: BrandProfile) => {
      try {
        const saved = await api.updateBrand(updated.id, updated);
        setAuth((prev) => (prev ? { ...prev, profile: saved } : prev));
        await loadState();
        setToast({ kind: 'success', text: "Brend profili saqlandi." });
      } catch (error) {
        fail(error, "Profilni saqlab bo'lmadi.");
      }
    },
    [fail, loadState],
  );

  const handleUpdateBloggerProfile = useCallback(
    async (updated: BloggerProfile) => {
      try {
        const saved = await api.updateBlogger(updated.id, updated);
        setAuth((prev) => (prev ? { ...prev, profile: saved } : prev));
        await loadState();
        setToast({ kind: 'success', text: 'Media Kit saqlandi va bozorda yangilandi.' });
      } catch (error) {
        fail(error, "Profilni saqlab bo'lmadi.");
      }
    },
    [fail, loadState],
  );

  const handleCreateCampaign = useCallback(
    async (input: Record<string, unknown>) => {
      const campaign = await api.createCampaign(input);
      setData((prev) => {
        const next = { ...prev, campaigns: [campaign, ...prev.campaigns] };
        cachedState.save(next);
        return next;
      });
      setActiveTab('campaigns');
      setToast({ kind: 'success', text: "E'lon joylandi. Blogerlar endi siz bilan bog'lana oladi." });
    },
    [],
  );

  const handleDeleteCampaign = useCallback(
    async (campaignId: string) => {
      try {
        await api.deleteCampaign(campaignId);
        setData((prev) => {
          const next = {
            ...prev,
            campaigns: prev.campaigns.filter((c) => c.id !== campaignId),
            bids: prev.bids.filter((b) => b.campaignId !== campaignId),
          };
          cachedState.save(next);
          return next;
        });
        setToast({ kind: 'success', text: "E'lon o'chirildi." });
      } catch (error) {
        fail(error, "E'lonni o'chirib bo'lmadi.");
      }
    },
    [fail],
  );

  const handleApplyBid = useCallback(
    async (input: Record<string, unknown>) => {
      const bid = await api.createBid(input);
      setData((prev) => {
        const next = {
          ...prev,
          bids: [bid, ...prev.bids],
          campaigns: prev.campaigns.map((c) =>
            c.id === bid.campaignId ? { ...c, bidsCount: c.bidsCount + 1 } : c,
          ),
        };
        cachedState.save(next);
        return next;
      });
      setToast({ kind: 'success', text: "Ariza yuborildi. Brend siz bilan bog'lanadi." });
    },
    [],
  );

  const handleSubmitReport = useCallback(async () => {
    if (!reportTarget) return;
    setReportBusy(true);
    try {
      await api.reportCampaign(reportTarget.id, reportReason, reportComment.trim() || undefined);
      setReportTarget(null);
      setToast({
        kind: 'success',
        text: "Shikoyat yuborildi. Administrator e'lonni tekshiradi.",
      });
    } catch (error) {
      fail(error, 'Shikoyatni yuborib bo‘lmadi');
    } finally {
      setReportBusy(false);
    }
  }, [fail, reportComment, reportReason, reportTarget]);

  const openChatWithBlogger = useCallback(
    (bloggerId: string) => {
      const blogger = data.bloggers.find((b) => b.id === bloggerId);
      if (!currentBrand || !blogger) return;
      setChatPartner({ brand: currentBrand, blogger });
    },
    [currentBrand, data.bloggers],
  );

  const openChatWithBrand = useCallback(
    (brandId: string) => {
      const brand = data.brands.find((b) => b.id === brandId);
      if (!currentBlogger || !brand) return;
      setChatPartner({ brand, blogger: currentBlogger });
    },
    [currentBlogger, data.brands],
  );

  const handleAcceptBid = useCallback(
    async (bid: ProposalBid) => {
      try {
        const updated = await api.updateBidStatus(bid.id, 'accepted');
        setData((prev) => {
          const next = { ...prev, bids: prev.bids.map((b) => (b.id === updated.id ? updated : b)) };
          cachedState.save(next);
          return next;
        });
        openChatWithBlogger(bid.bloggerId);
      } catch (error) {
        fail(error, "Arizani tasdiqlab bo'lmadi.");
      }
    },
    [fail, openChatWithBlogger],
  );

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!chatPartner || !auth) return;
      const partnerId =
        auth.account.role === 'advertiser' ? chatPartner.blogger.id : chatPartner.brand.id;
      const message = await api.sendMessage(partnerId, text);
      setData((prev) => {
        const next = { ...prev, messages: [...prev.messages, message] };
        cachedState.save(next);
        return next;
      });
    },
    [auth, chatPartner],
  );

  /* ---------------- Ko'rinish ---------------- */

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#FDF7FF] flex flex-col items-center justify-center gap-3 text-slate-600">
        <Loader2 className="w-7 h-7 animate-spin text-violet-600" aria-hidden="true" />
        <p className="text-sm font-semibold">Yuklanmoqda…</p>
      </div>
    );
  }

  if (!auth) {
    return (
      <AuthScreen
        onLogin={handleLogin}
        onRegister={handleRegister}
        config={config}
        inTelegram={inTelegram}
        telegramError={telegramAuthError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FDF7FF] text-slate-900 flex flex-col font-sans antialiased selection:bg-pink-100 selection:text-pink-900 relative">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-200/40 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-pink-200/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-amber-200/30 rounded-full blur-3xl" />
      </div>

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        userRole={userRole}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenHowItWorks={() => setIsHowItWorksOpen(true)}
        onOpenCreateCampaign={() => setIsCampaignCreatorOpen(true)}
        onOpenAccountModal={() => setIsAccountModalOpen(true)}
        profile={auth.profile}
        isAdmin={isAdmin}
      />

      {/* Sidebar lg dan boshlab doimiy ko'rinadi — kontentni chapdan siljitamiz. */}
      <div className="flex flex-col flex-1 lg:pl-80 relative z-10">
        <TopHeader
          onToggleSidebar={() => setIsSidebarOpen(true)}
          userRole={userRole}
          activeTab={activeTab}
          isLive={isLive}
          onOpenCreateCampaign={() => setIsCampaignCreatorOpen(true)}
          onOpenAccountModal={() => setIsAccountModalOpen(true)}
          profile={auth.profile}
          onSelectTab={setActiveTab}
          isAdmin={isAdmin}
        />

        {loadError && (
          <div
            role="status"
            className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 mt-4 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
            <span>{loadError}</span>
          </div>
        )}

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {activeTab === 'campaigns' && (
            <CampaignMarketplace
              campaigns={data.campaigns}
              currentBlogger={currentBlogger}
              currentBrand={currentBrand}
              userRole={userRole}
              existingBids={data.bids}
              onApplyBid={handleApplyBid}
              onOpenCreateCampaign={() => setIsCampaignCreatorOpen(true)}
              onAcceptBid={handleAcceptBid}
              onDeleteCampaign={handleDeleteCampaign}
              onOpenChatWithBlogger={openChatWithBlogger}
              onOpenChatWithBrand={openChatWithBrand}
              highlightCampaignId={highlightCampaignId}
              onHighlightShown={() => setHighlightCampaignId(null)}
              onReportCampaign={(campaign) => {
                setReportReason(REPORT_REASONS[0]);
                setReportComment('');
                setReportTarget(campaign);
              }}
            />
          )}

          {activeTab === 'profile' && currentBlogger && (
            <CreatorProfileStudio profile={currentBlogger} onUpdateProfile={handleUpdateBloggerProfile} />
          )}

          {activeTab === 'profile' && currentBrand && (
            <BrandProfileStudio profile={currentBrand} onUpdateProfile={handleUpdateBrandProfile} />
          )}

          {activeTab === 'admin' && isAdmin && (
            <AdminPanel onToast={(kind, text) => setToast({ kind, text })} />
          )}
        </main>

        <footer className="border-t border-purple-100/80 bg-white/80 backdrop-blur-md py-8 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-400 text-white flex items-center justify-center text-xs font-black">
                IC
              </div>
              <div>
                <span className="font-extrabold text-slate-800">InstaCollab Uzbekistan</span>
                <span className="text-slate-400 text-[11px] ml-1.5 hidden sm:inline">
                  — Instagram Reklama Beruvchilar va Blogerlar Tizimi
                </span>
              </div>
            </div>
            <div className="flex items-center gap-5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setIsHowItWorksOpen(true)}
                className="text-violet-700 hover:text-violet-950 cursor-pointer"
              >
                Qanday ishlaydi?
              </button>
              <button
                type="button"
                onClick={() => setIsAccountModalOpen(true)}
                className="text-purple-700 hover:text-purple-950 cursor-pointer"
              >
                Hisobim
              </button>
              <span className="text-slate-400">© 2026 InstaCollab</span>
            </div>
          </div>
        </footer>
      </div>

      {/* Modallar */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        account={auth.account}
        profile={auth.profile}
        config={config}
        onLogout={handleLogout}
        onOpenProfileTab={() => {
          setIsAccountModalOpen(false);
          setActiveTab('profile');
        }}
      />

      {currentBrand && (
        <CampaignCreatorModal
          isOpen={isCampaignCreatorOpen}
          onClose={() => setIsCampaignCreatorOpen(false)}
          currentBrand={currentBrand}
          onCreateCampaign={handleCreateCampaign}
        />
      )}

      <ChatDealModal
        isOpen={chatPartner !== null}
        onClose={() => setChatPartner(null)}
        brand={chatPartner?.brand ?? null}
        blogger={chatPartner?.blogger ?? null}
        currentUserRole={userRole}
        messages={data.messages}
        onSendMessage={handleSendMessage}
      />

      <HowItWorksModal isOpen={isHowItWorksOpen} onClose={() => setIsHowItWorksOpen(false)} />

      {/* Yolg'on e'lon haqida xabar berish */}
      <Modal
        isOpen={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        size="md"
        eyebrow="Shikoyat"
        title="Bu e'lon shubhalimi?"
        icon={<Flag className="w-4 h-4 text-rose-600" aria-hidden="true" />}
        bodyClassName="p-6"
        initialFocusSelector="#report-reason"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            «{reportTarget?.title}» e'loni administratorga tekshirish uchun yuboriladi. Boshqa
            foydalanuvchilar sizning shikoyatingizni ko'rmaydi.
          </p>

          <label className="block">
            <span className="text-xs font-bold text-slate-700">Sabab</span>
            <select
              id="report-reason"
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
              className="mt-1.5 w-full px-3.5 py-2.5 rounded-2xl border border-purple-100 text-sm font-semibold outline-none focus:border-violet-400 bg-white"
            >
              {REPORT_REASONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-bold text-slate-700">Qo'shimcha izoh (ixtiyoriy)</span>
            <textarea
              value={reportComment}
              onChange={(event) => setReportComment(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Nima noto'g'ri ekanini qisqacha yozing"
              className="mt-1.5 w-full px-3.5 py-2.5 rounded-2xl border border-purple-100 text-sm outline-none focus:border-violet-400 resize-none"
            />
          </label>

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => setReportTarget(null)}
              className="text-xs font-black px-4 py-2.5 rounded-2xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer"
            >
              Bekor qilish
            </button>
            <button
              type="button"
              disabled={reportBusy}
              onClick={() => void handleSubmitReport()}
              className="text-xs font-black px-4 py-2.5 rounded-2xl bg-rose-600 text-white hover:bg-rose-700 transition cursor-pointer disabled:opacity-40"
            >
              {reportBusy ? 'Yuborilmoqda…' : 'Shikoyatni yuborish'}
            </button>
          </div>
        </div>
      </Modal>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold max-w-[92vw] ${
            toast.kind === 'success'
              ? 'bg-emerald-600 text-white shadow-emerald-600/25'
              : 'bg-rose-600 text-white shadow-rose-600/25'
          }`}
        >
          {toast.kind === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Bildirishnomani yopish"
            className="ml-1 opacity-80 hover:opacity-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
