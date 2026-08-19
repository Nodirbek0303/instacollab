import { Briefcase, ChevronDown, FileText, Menu, Plus, ShieldCheck, Users } from 'lucide-react';

import type { BloggerProfile, BrandProfile, UserRole } from '../types';

interface TopHeaderProps {
  onToggleSidebar: () => void;
  userRole: UserRole;
  activeTab: string;
  onOpenCreateCampaign: () => void;
  onOpenAccountModal: () => void;
  profile: BrandProfile | BloggerProfile;
  onSelectTab: (tab: string) => void;
  /** Jonli oqim ulanganmi. */
  isLive?: boolean;
  /** Admin huquqi bor foydalanuvchiga qo'shimcha bo'lim ko'rsatiladi. */
  isAdmin?: boolean;
}

const ADMIN_TITLE = 'Administrator Paneli';

const TITLES: Record<UserRole, Record<string, string>> = {
  advertiser: {
    bloggers: 'Instagram Blogerlari Katalogi',
    campaigns: "Reklama E'lonlarim & Kelgan Arizalar",
    profile: 'Brend Profilim',
    admin: ADMIN_TITLE,
  },
  blogger: {
    campaigns: "Brendlarning Reklama E'lonlari (Tanlash)",
    bloggers: 'Blogerlar Hamjamiyati',
    profile: 'Mening Profilim & Media Kit',
    admin: ADMIN_TITLE,
  },
};

export function TopHeader({
  onToggleSidebar,
  userRole,
  activeTab,
  onOpenCreateCampaign,
  onOpenAccountModal,
  profile,
  onSelectTab,
  isLive = false,
  isAdmin = false,
}: TopHeaderProps) {
  const isAdvertiser = userRole === 'advertiser';
  const title = TITLES[userRole][activeTab] ?? (isAdvertiser ? 'Reklama Beruvchi Kabineti' : 'Bloger Kabineti');

  const avatar = isAdvertiser ? (profile as BrandProfile).logo : (profile as BloggerProfile).avatar;
  const label = isAdvertiser ? profile.name : `@${(profile as BloggerProfile).username}`;

  const tabClass = (tab: string) =>
    activeTab === tab
      ? `bg-white shadow-xs border ${isAdvertiser ? 'text-violet-950 border-purple-100' : 'text-pink-950 border-pink-100'}`
      : `text-slate-600 ${isAdvertiser ? 'hover:text-violet-950' : 'hover:text-pink-950'}`;

  const tabs = isAdvertiser
    ? [
        { id: 'bloggers', label: 'Blogerlar Katalogi', Icon: Users },
        { id: 'campaigns', label: "Mening E'lonlarim", Icon: Briefcase },
        { id: 'profile', label: 'Brend Profilim', Icon: FileText },
      ]
    : [
        { id: 'campaigns', label: 'Reklamalar Bozori', Icon: Briefcase },
        { id: 'bloggers', label: 'Blogerlar', Icon: Users },
        { id: 'profile', label: 'Media Kit', Icon: FileText },
      ];

  if (isAdmin) tabs.push({ id: 'admin', label: 'Admin', Icon: ShieldCheck });

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-purple-100/90 shadow-xs shadow-purple-950/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <button
            type="button"
            id="btn-toggle-sidebar"
            onClick={onToggleSidebar}
            aria-label="Yon menyuni ochish"
            className="lg:hidden p-2.5 rounded-2xl bg-purple-50 hover:bg-purple-100/80 border border-purple-200/80 text-violet-950 transition cursor-pointer shadow-xs flex items-center gap-2 group"
          >
            <Menu className="w-5 h-5 text-purple-700 group-hover:scale-110 transition-transform" aria-hidden="true" />
            <span className="text-xs font-black hidden sm:inline text-purple-950">Menyu</span>
          </button>

          <div className="min-w-0">
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full inline-block ${
                isAdvertiser
                  ? 'bg-violet-100 text-violet-900 border border-violet-200/80'
                  : 'bg-pink-100 text-pink-900 border border-pink-200/80'
              }`}
            >
              {isAdvertiser ? 'Reklama Beruvchi' : 'Bloger'}
            </span>
            <h1 className="text-xs sm:text-sm font-extrabold text-slate-900 truncate leading-tight mt-0.5 flex items-center gap-1.5">
              <span className="truncate">{title}</span>
              {/* Jonli holat: yashil nuqta — yangilanishlar o'zi kelib turibdi */}
              <span
                title={isLive ? "Jonli: yangilanishlar o'zi keladi" : 'Ulanish tiklanmoqda…'}
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                }`}
              >
                <span className="sr-only">{isLive ? 'Jonli ulanish faol' : 'Ulanish yo‘q'}</span>
              </span>
            </h1>
          </div>
        </div>

        <nav
          aria-label="Bo'limlar"
          className="hidden xl:flex items-center bg-purple-50/70 p-1 rounded-2xl border border-purple-100/90"
        >
          {tabs.map(({ id, label: tabLabel, Icon }) => (
            <button
              key={id}
              type="button"
              id={`header-tab-${id}`}
              aria-current={activeTab === id ? 'page' : undefined}
              onClick={() => onSelectTab(id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${tabClass(id)}`}
            >
              <Icon
                className={`w-3.5 h-3.5 ${isAdvertiser ? 'text-violet-600' : 'text-pink-600'}`}
                aria-hidden="true"
              />
              <span>{tabLabel}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <button
            type="button"
            id="btn-header-account"
            onClick={onOpenAccountModal}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-2xl bg-purple-50/80 hover:bg-purple-100/80 border border-purple-200/80 transition cursor-pointer shadow-xs"
            title="Hisobim va chiqish"
          >
            <img
              src={avatar}
              alt=""
              className="w-6 h-6 rounded-full object-cover border border-purple-200 shadow-xs shrink-0"
            />
            <span className="text-left hidden md:block">
              <span className="text-[10px] text-purple-950 font-black block leading-tight truncate max-w-[110px]">
                {label}
              </span>
              <span className="text-[9px] text-slate-400 font-semibold block leading-none">
                {isAdvertiser ? 'Brend' : 'Bloger'}
              </span>
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-purple-500" aria-hidden="true" />
          </button>

          {isAdvertiser ? (
            <button
              type="button"
              id="btn-header-create-ad"
              onClick={onOpenCreateCampaign}
              className="bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 hover:from-violet-700 hover:via-purple-700 hover:to-pink-700 text-white text-xs font-black px-3.5 sm:px-4 py-2.5 rounded-2xl shadow-md shadow-purple-600/25 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Reklama Berish</span>
              <span className="sm:hidden">E'lon</span>
            </button>
          ) : (
            <button
              type="button"
              id="btn-header-browse-ads"
              onClick={() => onSelectTab('campaigns')}
              className="bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 hover:from-pink-600 hover:via-rose-600 hover:to-amber-600 text-white text-xs font-black px-3.5 sm:px-4 py-2.5 rounded-2xl shadow-md shadow-pink-500/25 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Briefcase className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Reklamalarni Tanlash</span>
              <span className="sm:hidden">Reklamalar</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
