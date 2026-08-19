import {
  Briefcase,
  Building2,
  ChevronRight,
  FileText,
  HelpCircle,
  Instagram,
  PlusCircle,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';

import type { BloggerProfile, BrandProfile, UserRole } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: UserRole;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onOpenHowItWorks: () => void;
  onOpenCreateCampaign: () => void;
  onOpenAccountModal: () => void;
  profile: BrandProfile | BloggerProfile;
  /** Admin huquqi bor bo'lsa — qo'shimcha nazorat bo'limi. */
  isAdmin?: boolean;
}

export function Sidebar({
  isOpen,
  onClose,
  userRole,
  activeTab,
  onSelectTab,
  onOpenHowItWorks,
  onOpenCreateCampaign,
  onOpenAccountModal,
  profile,
  isAdmin = false,
}: SidebarProps) {
  const isAdvertiser = userRole === 'advertiser';
  const avatar = isAdvertiser ? (profile as BrandProfile).logo : (profile as BloggerProfile).avatar;
  const subtitle = isAdvertiser
    ? (profile as BrandProfile).category
    : `@${(profile as BloggerProfile).username}`;

  const handleNavClick = (tab: string) => {
    onSelectTab(tab);
    onClose();
  };

  const navClass = (tab: string, accent: 'violet' | 'pink') => {
    if (activeTab === tab) {
      return accent === 'violet'
        ? 'bg-gradient-to-r from-purple-100 to-pink-50 text-violet-950 font-black border border-purple-200 shadow-xs'
        : 'bg-gradient-to-r from-purple-100 to-pink-50 text-pink-950 font-black border border-pink-200 shadow-xs';
    }
    return accent === 'violet'
      ? 'text-slate-700 hover:bg-purple-50/60 hover:text-violet-950'
      : 'text-slate-600 hover:bg-pink-50/60 hover:text-pink-950';
  };

  return (
    <>
      {isOpen && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Yon menyuni yopish"
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs lg:hidden cursor-default"
        />
      )}

      <aside
        aria-label="Asosiy menyu"
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 sm:w-80 bg-white border-r border-purple-100 flex flex-col justify-between shadow-2xl lg:shadow-md transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-5 border-b border-purple-100/80 bg-gradient-to-b from-purple-50/50 to-white">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => handleNavClick('campaigns')}
              className="flex items-center gap-3 cursor-pointer group select-none text-left"
            >
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-400 flex items-center justify-center text-white shadow-md shadow-pink-500/25 group-hover:scale-105 transition-transform duration-200">
                <Instagram className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-lg tracking-tight bg-gradient-to-r from-violet-950 via-purple-900 to-pink-700 bg-clip-text text-transparent">
                    InstaCollab
                  </span>
                  <span className="bg-gradient-to-r from-pink-500 to-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-xs">
                    UZ
                  </span>
                </div>
                <p className="text-[10px] font-semibold text-slate-400">Instagram Reklama Bozori</p>
              </div>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Yon menyuni yopish"
              className="lg:hidden text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-purple-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* Faol hisob — turi ro'yxatdan o'tishda tanlangan va o'zgarmaydi */}
          <button
            type="button"
            onClick={() => {
              onOpenAccountModal();
              onClose();
            }}
            className="w-full text-left bg-gradient-to-br from-violet-950 via-purple-900 to-slate-900 rounded-2xl p-3.5 text-white shadow-lg shadow-purple-950/20 relative overflow-hidden cursor-pointer hover:shadow-xl transition"
          >
            <span
              className="absolute top-0 right-0 w-32 h-32 bg-pink-500/20 rounded-full blur-2xl pointer-events-none"
              aria-hidden="true"
            />

            <span className="flex items-center justify-between mb-2.5 relative z-10">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-pink-300 flex items-center gap-1">
                {isAdvertiser ? (
                  <>
                    <Building2 className="w-3 h-3 text-amber-300" aria-hidden="true" />
                    <span>Reklama Beruvchi</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-3 h-3 text-pink-300" aria-hidden="true" />
                    <span>Bloger</span>
                  </>
                )}
              </span>
              <span className="text-[10px] text-purple-200 bg-white/10 border border-white/20 px-2 py-0.5 rounded-lg font-bold">
                Hisobim
              </span>
            </span>

            <span className="flex items-center gap-3 relative z-10">
              <img
                src={avatar}
                alt=""
                className="w-10 h-10 rounded-xl object-cover border-2 border-white/30 shadow-md"
              />
              <span className="min-w-0 flex-1">
                <span className="text-xs font-black text-white truncate block">{profile.name}</span>
                <span className="text-[11px] text-purple-200/80 font-medium truncate block">{subtitle}</span>
              </span>
            </span>
          </button>
        </div>

        <nav aria-label="Bo'limlar" className="p-4 flex-1 overflow-y-auto">
          {isAdvertiser ? (
            <div className="space-y-2">
              <h2 className="text-[10px] font-black tracking-wider uppercase text-purple-900/60 px-3 mb-1">
                Reklama Beruvchi Menusi
              </h2>

              <button
                type="button"
                id="sidebar-btn-create-campaign"
                onClick={() => {
                  onOpenCreateCampaign();
                  onClose();
                }}
                className="w-full bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 hover:from-violet-700 hover:via-purple-700 hover:to-pink-700 text-white font-black text-xs py-3.5 px-4 rounded-2xl shadow-lg shadow-purple-600/25 transition flex items-center justify-between gap-2 cursor-pointer mb-3"
              >
                <span className="flex items-center gap-2">
                  <PlusCircle className="w-4 h-4 text-pink-200" aria-hidden="true" />
                  <span>Reklama Berish</span>
                </span>
                <span className="bg-white/20 text-[10px] px-1.5 py-0.5 rounded-md font-bold">Yangi</span>
              </button>

              <button
                type="button"
                id="sidebar-nav-campaigns"
                aria-current={activeTab === 'campaigns' ? 'page' : undefined}
                onClick={() => handleNavClick('campaigns')}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition cursor-pointer ${navClass('campaigns', 'violet')}`}
              >
                <span className="flex items-center gap-2.5">
                  <Briefcase
                    className={`w-4 h-4 ${activeTab === 'campaigns' ? 'text-violet-600' : 'text-slate-400'}`}
                    aria-hidden="true"
                  />
                  <span>Mening E'lonlarim &amp; Arizalar</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />
              </button>

              <button
                type="button"
                id="sidebar-nav-brand-profile"
                aria-current={activeTab === 'profile' ? 'page' : undefined}
                onClick={() => handleNavClick('profile')}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition cursor-pointer ${navClass('profile', 'violet')}`}
              >
                <span className="flex items-center gap-2.5">
                  <FileText
                    className={`w-4 h-4 ${activeTab === 'profile' ? 'text-violet-600' : 'text-slate-400'}`}
                    aria-hidden="true"
                  />
                  <span>Brend Profilim</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <h2 className="text-[10px] font-black tracking-wider uppercase text-pink-900/60 px-3 mb-1">
                Bloger Menusi
              </h2>

              <button
                type="button"
                id="sidebar-nav-blogger-campaigns"
                aria-current={activeTab === 'campaigns' ? 'page' : undefined}
                onClick={() => handleNavClick('campaigns')}
                className={`w-full flex items-center justify-between px-3.5 py-3.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                  activeTab === 'campaigns'
                    ? 'bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 text-white font-black shadow-md shadow-pink-500/20'
                    : 'text-slate-700 hover:bg-pink-50 hover:text-pink-950'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Briefcase
                    className={`w-4 h-4 ${activeTab === 'campaigns' ? 'text-white' : 'text-pink-500'}`}
                    aria-hidden="true"
                  />
                  <span>Reklamalarni Tanlash</span>
                </span>
                <span
                  className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
                    activeTab === 'campaigns' ? 'bg-white/25 text-white' : 'bg-pink-100 text-pink-800'
                  }`}
                >
                  Bozor
                </span>
              </button>

              <button
                type="button"
                id="sidebar-nav-blogger-profile"
                aria-current={activeTab === 'profile' ? 'page' : undefined}
                onClick={() => handleNavClick('profile')}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition cursor-pointer ${navClass('profile', 'pink')}`}
              >
                <span className="flex items-center gap-2.5">
                  <FileText
                    className={`w-4 h-4 ${activeTab === 'profile' ? 'text-pink-600' : 'text-slate-400'}`}
                    aria-hidden="true"
                  />
                  <span>Mening Profilim &amp; Media Kit</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-pink-400" aria-hidden="true" />
              </button>
            </div>
          )}
          {/* Admin bo'limi — faqat huquqi borlarga. */}
          {isAdmin && (
            <div className="mt-5 pt-4 border-t border-purple-100/80">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-3.5 mb-2">
                Nazorat
              </p>
              <button
                type="button"
                id="sidebar-nav-admin"
                aria-current={activeTab === 'admin' ? 'page' : undefined}
                onClick={() => handleNavClick('admin')}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition cursor-pointer ${
                  activeTab === 'admin'
                    ? 'bg-violet-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-violet-50'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <ShieldCheck
                    className={`w-4 h-4 ${activeTab === 'admin' ? 'text-white' : 'text-violet-600'}`}
                    aria-hidden="true"
                  />
                  <span>Administrator Paneli</span>
                </span>
                <ChevronRight
                  className={`w-3.5 h-3.5 ${activeTab === 'admin' ? 'text-white/70' : 'text-violet-400'}`}
                  aria-hidden="true"
                />
              </button>
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-purple-100/80 bg-purple-50/30">
          <button
            type="button"
            id="sidebar-btn-how-it-works"
            onClick={() => {
              onOpenHowItWorks();
              onClose();
            }}
            className="w-full text-center text-[11px] text-purple-700 hover:text-purple-950 font-bold py-2 rounded-xl hover:bg-purple-100/60 transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            <HelpCircle className="w-3.5 h-3.5 text-pink-500" aria-hidden="true" />
            <span>Platforma Qoidalari</span>
          </button>
        </div>
      </aside>
    </>
  );
}
