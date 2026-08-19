import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  CheckCircle2,
  Eye,
  EyeOff,
  Flag,
  History,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';

import { ApiError, api, type AccountAction, type AdminOverview, type CampaignAction } from '../lib/api';
import { Modal } from './Modal';

interface AdminPanelProps {
  onToast: (kind: 'success' | 'error', text: string) => void;
}

type Section = 'overview' | 'accounts' | 'campaigns' | 'reports' | 'verified' | 'log';

/** Amalni bajarishdan oldin so'raladigan sabab oynasi. */
interface Pending {
  title: string;
  hint: string;
  /** Sabab majburiymi — bloklashda ha, qaytarishda yo'q. */
  reasonRequired: boolean;
  run: (reason: string) => Promise<void>;
}

const SECTIONS: { id: Section; label: string; Icon: typeof Users }[] = [
  { id: 'overview', label: 'Umumiy', Icon: ShieldCheck },
  { id: 'accounts', label: 'Hisoblar', Icon: Users },
  { id: 'campaigns', label: "E'lonlar", Icon: Eye },
  { id: 'reports', label: 'Shikoyatlar', Icon: Flag },
  { id: 'verified', label: 'Ptichka', Icon: BadgeCheck },
  { id: 'log', label: 'Kuzatuv', Icon: History },
];

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('uz-UZ', { dateStyle: 'short', timeStyle: 'short' });
}

export function AdminPanel({ onToast }: AdminPanelProps) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [section, setSection] = useState<Section>('overview');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.adminOverview());
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Ma'lumotni olib bo'lmadi");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Har bir amal bir xil yo'l bilan bajariladi: so'rov → yangilash → xabar. */
  const perform = useCallback(
    async (job: () => Promise<string>) => {
      setBusy(true);
      try {
        const message = await job();
        await load();
        onToast('success', message);
        setPending(null);
        setReason('');
      } catch (caught) {
        onToast('error', caught instanceof ApiError ? caught.message : 'Amal bajarilmadi');
      } finally {
        setBusy(false);
      }
    },
    [load, onToast],
  );

  const ask = (next: Pending) => {
    setReason('');
    setPending(next);
  };

  const accountAction = (id: string, name: string, action: AccountAction) => {
    const labels: Record<AccountAction, { title: string; hint: string; done: string }> = {
      freeze: {
        title: 'Hisobni muzlatish',
        hint: `«${name}» tizimga kira olmaydi va e'lonlari bozordan yo'qoladi. Hech narsa o'chirilmaydi — istalgan payt qaytarasiz.`,
        done: 'Hisob muzlatildi',
      },
      unfreeze: {
        title: 'Muzlatishni bekor qilish',
        hint: `«${name}» yana tizimga kira oladi va e'lonlari bozorga qaytadi.`,
        done: 'Hisob qaytarildi',
      },
      delete: {
        title: "Hisobni o'chirish",
        hint: `«${name}» profili va e'lonlari hech kimga ko'rinmaydi. Ma'lumot bazada qoladi, shuning uchun keyin qayta tiklash mumkin.`,
        done: "Hisob o'chirildi",
      },
      restore: {
        title: 'Hisobni qayta tiklash',
        hint: `«${name}» to'liq ishchi holatga qaytadi.`,
        done: 'Hisob qayta tiklandi',
      },
    };

    const config = labels[action];
    ask({
      title: config.title,
      hint: config.hint,
      reasonRequired: action === 'freeze' || action === 'delete',
      run: (text) =>
        perform(async () => {
          await api.adminAccountAction(id, action, text);
          return config.done;
        }),
    });
  };

  const campaignAction = (id: string, title: string, action: CampaignAction) => {
    const labels: Record<CampaignAction, { title: string; hint: string; done: string }> = {
      hide: {
        title: "E'lonni yashirish",
        hint: `«${title}» bozordan olinadi. Egasi uni sabab bilan ko'rib turadi va tuzatishi mumkin.`,
        done: "E'lon yashirildi",
      },
      show: {
        title: "E'lonni qaytarish",
        hint: `«${title}» yana bozorda ko'rinadi.`,
        done: "E'lon qaytarildi",
      },
      delete: {
        title: "E'lonni o'chirish",
        hint: `«${title}» butunlay olib qo'yiladi. Yozuv bazada qoladi — kerak bo'lsa qaytarasiz.`,
        done: "E'lon o'chirildi",
      },
      restore: {
        title: "E'lonni qayta tiklash",
        hint: `«${title}» bozorga qaytariladi.`,
        done: "E'lon qaytarildi",
      },
    };

    const config = labels[action];
    ask({
      title: config.title,
      hint: config.hint,
      reasonRequired: action === 'hide' || action === 'delete',
      run: (text) =>
        perform(async () => {
          await api.adminCampaignAction(id, action, text);
          return config.done;
        }),
    });
  };

  const resetPassword = (id: string, name: string) => {
    ask({
      title: 'Parolni tiklash',
      hint: `«${name}» uchun yangi vaqtinchalik parol yaratiladi va barcha sessiyalari bekor qilinadi. Hisob Telegramga ulangan bo'lsa, parol botga yuboriladi.`,
      reasonRequired: false,
      run: () =>
        perform(async () => {
          const result = await api.adminResetPassword(id);
          return `Yangi parol: ${result.password}`;
        }),
    });
  };

  const accounts = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return data.accounts;
    return data.accounts.filter((row) =>
      [row.profileName, row.phone, row.telegramUsername ?? ''].join(' ').toLowerCase().includes(needle),
    );
  }, [data, query]);

  const campaigns = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return data.campaigns;
    return data.campaigns.filter((row) =>
      [row.title, row.brandName, row.niche].join(' ').toLowerCase().includes(needle),
    );
  }, [data, query]);

  if (error) {
    return (
      <div className="bg-white border border-rose-200 rounded-3xl p-6 text-sm text-rose-900 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-bold">Admin paneli ochilmadi</p>
          <p className="text-xs text-rose-800/80 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white border border-purple-100 rounded-3xl p-10 text-center text-sm text-slate-500 font-semibold">
        Yuklanmoqda…
      </div>
    );
  }

  const openReports = data.reports.filter((report) => !report.resolvedAt);
  const pendingVerifications = data.verificationRequests.filter((r) => r.status === 'pending');

  return (
    <div className="space-y-5">
      {/* ---------- Sarlavha ---------- */}
      <section className="bg-gradient-to-br from-slate-900 via-violet-950 to-purple-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg shadow-purple-950/20">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-black bg-white/15 px-2.5 py-1 rounded-full">
          <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
          Administrator paneli
        </span>
        <h2 className="text-2xl sm:text-3xl font-black mt-3 tracking-tight">Platforma nazorati</h2>
        <p className="text-purple-100/80 text-sm mt-2 max-w-2xl">
          Hisoblarni muzlatish va qayta tiklash, yolg'on e'lonlarni tekshirib olib qo'yish, shikoyatlarni
          ko'rib chiqish. Har bir amal sabab bilan yozib boriladi.
        </p>
      </section>

      {/* ---------- Bo'limlar ---------- */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {SECTIONS.map(({ id, label, Icon }) => {
          const count =
            id === 'reports'
              ? openReports.length
              : id === 'verified'
                ? pendingVerifications.length
                : id === 'accounts'
                  ? data.accounts.length
                  : 0;
          return (
            <button
              key={id}
              type="button"
              id={`admin-tab-${id}`}
              aria-pressed={section === id}
              onClick={() => setSection(id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-black transition cursor-pointer shrink-0 border ${
                section === id
                  ? 'bg-violet-900 text-white border-violet-900 shadow-sm'
                  : 'bg-white text-slate-600 border-purple-100 hover:border-violet-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{label}</span>
              {count > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md font-black ${
                    id === 'reports'
                      ? 'bg-rose-500 text-white'
                      : id === 'verified'
                        ? 'bg-violet-600 text-white'
                        : 'bg-purple-100 text-purple-900'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold bg-white border border-purple-100 text-slate-600 hover:border-violet-300 transition cursor-pointer shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          Yangilash
        </button>
      </div>

      {/* ---------- Umumiy ---------- */}
      {section === 'overview' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Hisoblar', value: data.stats.accounts, tone: 'violet' },
            { label: 'Muzlatilgan', value: data.stats.frozen, tone: 'amber' },
            { label: "O'chirilgan", value: data.stats.deleted, tone: 'rose' },
            { label: 'Onlayn', value: data.stats.liveClients, tone: 'emerald' },
            { label: 'Brendlar', value: data.stats.brands, tone: 'violet' },
            { label: 'Blogerlar', value: data.stats.bloggers, tone: 'violet' },
            { label: "E'lonlar", value: data.stats.campaigns, tone: 'violet' },
            { label: 'Yashirilgan', value: data.stats.hiddenCampaigns, tone: 'amber' },
            { label: 'Arizalar', value: data.stats.bids, tone: 'violet' },
            { label: 'Xabarlar', value: data.stats.messages, tone: 'violet' },
            { label: 'Ochiq shikoyat', value: data.stats.openReports, tone: 'rose' },
            { label: 'Ochiq murojaat', value: data.stats.openTickets, tone: 'rose' },
            { label: 'Ptichkali', value: data.stats.verified, tone: 'violet' },
            { label: 'Ptichka so‘rovi', value: data.stats.verificationPending, tone: 'amber' },
            { label: 'Obunalar', value: data.stats.follows, tone: 'violet' },
          ].map((card) => (
            <div
              key={card.label}
              className={`bg-white border rounded-2xl p-4 ${
                card.value > 0 && card.tone === 'rose'
                  ? 'border-rose-200'
                  : card.value > 0 && card.tone === 'amber'
                    ? 'border-amber-200'
                    : 'border-purple-100'
              }`}
            >
              <p className="text-[11px] font-bold text-slate-500">{card.label}</p>
              <p
                className={`text-2xl font-black mt-1 tabular-nums ${
                  card.value > 0 && card.tone === 'rose'
                    ? 'text-rose-600'
                    : card.value > 0 && card.tone === 'amber'
                      ? 'text-amber-600'
                      : card.tone === 'emerald'
                        ? 'text-emerald-600'
                        : 'text-violet-950'
                }`}
              >
                {card.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Qidiruv ---------- */}
      {(section === 'accounts' || section === 'campaigns') && (
        <div className="relative">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={section === 'accounts' ? 'Ism, telefon yoki username…' : "E'lon yoki brend nomi…"}
            className="w-full pl-10 pr-4 py-3 rounded-2xl border border-purple-100 bg-white text-sm font-semibold outline-none focus:border-violet-400"
          />
        </div>
      )}

      {/* ---------- Hisoblar ---------- */}
      {section === 'accounts' && (
        <div className="space-y-2.5">
          {accounts.length === 0 && (
            <p className="text-sm text-slate-500 font-semibold text-center py-8">Hech narsa topilmadi.</p>
          )}

          {accounts.map((row) => (
            <div
              key={row.id}
              className={`bg-white border rounded-2xl p-4 ${
                row.status === 'deleted'
                  ? 'border-rose-200 bg-rose-50/30'
                  : row.status === 'frozen'
                    ? 'border-amber-200 bg-amber-50/30'
                    : 'border-purple-100'
              }`}
            >
              <div className="flex items-start gap-3">
                {row.profileAvatar ? (
                  <img
                    src={row.profileAvatar}
                    alt=""
                    className="w-11 h-11 rounded-2xl object-cover border border-purple-100 shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-2xl bg-purple-100 shrink-0" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-black text-slate-900 truncate">{row.profileName}</h4>

                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-900">
                      {row.role === 'advertiser' ? 'Reklama beruvchi' : 'Bloger'}
                    </span>

                    {row.isAdmin && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-violet-900 text-white">
                        ADMIN
                      </span>
                    )}

                    {row.status === 'frozen' && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-500 text-white">
                        MUZLATILGAN
                      </span>
                    )}
                    {row.status === 'deleted' && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-rose-600 text-white">
                        O'CHIRILGAN
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500 font-semibold mt-1 tabular-nums">
                    {row.phone}
                    {row.telegramUsername ? ` · @${row.telegramUsername}` : ''} · {formatDate(row.createdAt)}
                  </p>

                  <p className="text-[11px] text-slate-500 font-semibold mt-0.5 tabular-nums">
                    {row.campaignsCount} ta e'lon · {row.bidsCount} ta ariza
                  </p>

                  {row.statusReason && (
                    <p className="text-[11px] font-bold text-amber-900 bg-amber-100/70 border border-amber-200 rounded-xl px-2.5 py-1.5 mt-2">
                      {row.statusReason}
                      <span className="text-amber-700/70 font-semibold"> · {formatDate(row.statusAt)}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-purple-50">
                {row.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => accountAction(row.id, row.profileName, 'freeze')}
                    className="flex items-center gap-1.5 text-[11px] font-black px-3 py-2 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 transition cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" aria-hidden="true" />
                    Muzlatish
                  </button>
                )}

                {row.status === 'frozen' && (
                  <button
                    type="button"
                    onClick={() => accountAction(row.id, row.profileName, 'unfreeze')}
                    className="flex items-center gap-1.5 text-[11px] font-black px-3 py-2 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    Muzlatishni bekor qilish
                  </button>
                )}

                {row.status !== 'deleted' ? (
                  <button
                    type="button"
                    onClick={() => accountAction(row.id, row.profileName, 'delete')}
                    className="flex items-center gap-1.5 text-[11px] font-black px-3 py-2 rounded-xl bg-rose-50 text-rose-900 border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    O'chirish
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => accountAction(row.id, row.profileName, 'restore')}
                    className="flex items-center gap-1.5 text-[11px] font-black px-3 py-2 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    Qayta tiklash
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => resetPassword(row.id, row.profileName)}
                  className="flex items-center gap-1.5 text-[11px] font-black px-3 py-2 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                  Parolni tiklash
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- E'lonlar ---------- */}
      {section === 'campaigns' && (
        <div className="space-y-2.5">
          {campaigns.length === 0 && (
            <p className="text-sm text-slate-500 font-semibold text-center py-8">Hech narsa topilmadi.</p>
          )}

          {campaigns.map((row) => (
            <div
              key={row.id}
              className={`bg-white border rounded-2xl p-4 ${
                row.moderationState === 'deleted'
                  ? 'border-rose-200 bg-rose-50/30'
                  : row.moderationState === 'hidden'
                    ? 'border-amber-200 bg-amber-50/30'
                    : row.reportsCount > 0
                      ? 'border-rose-200'
                      : 'border-purple-100'
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-black text-slate-900">{row.title}</h4>

                {row.reportsCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded-md bg-rose-600 text-white">
                    <Flag className="w-3 h-3" aria-hidden="true" />
                    {row.reportsCount} shikoyat
                  </span>
                )}
                {row.moderationState === 'hidden' && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-500 text-white">
                    YASHIRILGAN
                  </span>
                )}
                {row.moderationState === 'deleted' && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-rose-600 text-white">
                    O'CHIRILGAN
                  </span>
                )}
                {row.ownerStatus !== 'active' && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-slate-700 text-white">
                    EGASI BLOKLANGAN
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-500 font-semibold mt-1">
                {row.brandName} · {row.niche} · {row.bidsCount} ta ariza · {row.createdDate}
              </p>
              <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">{row.description}</p>
              <p className="text-[11px] text-slate-500 font-semibold mt-1.5 tabular-nums">
                📞 {row.phone} · ✈️ {row.contactTelegram}
              </p>

              {row.moderation?.reason && (
                <p className="text-[11px] font-bold text-amber-900 bg-amber-100/70 border border-amber-200 rounded-xl px-2.5 py-1.5 mt-2">
                  {row.moderation.reason}
                  <span className="text-amber-700/70 font-semibold"> · {formatDate(row.moderation.at)}</span>
                </p>
              )}

              <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-purple-50">
                {row.moderationState === 'ok' ? (
                  <button
                    type="button"
                    onClick={() => campaignAction(row.id, row.title, 'hide')}
                    className="flex items-center gap-1.5 text-[11px] font-black px-3 py-2 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 transition cursor-pointer"
                  >
                    <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                    Yashirish
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => campaignAction(row.id, row.title, 'show')}
                    className="flex items-center gap-1.5 text-[11px] font-black px-3 py-2 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    Qaytarish
                  </button>
                )}

                {row.moderationState !== 'deleted' && (
                  <button
                    type="button"
                    onClick={() => campaignAction(row.id, row.title, 'delete')}
                    className="flex items-center gap-1.5 text-[11px] font-black px-3 py-2 rounded-xl bg-rose-50 text-rose-900 border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    O'chirish
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Shikoyatlar ---------- */}
      {section === 'reports' && (
        <div className="space-y-2.5">
          {data.reports.length === 0 && (
            <p className="text-sm text-slate-500 font-semibold text-center py-8">
              Hozircha shikoyat yo'q.
            </p>
          )}

          {data.reports.map((report) => (
            <div
              key={report.id}
              className={`bg-white border rounded-2xl p-4 ${
                report.resolvedAt ? 'border-purple-100 opacity-70' : 'border-rose-200'
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Flag
                  className={`w-4 h-4 ${report.resolvedAt ? 'text-slate-400' : 'text-rose-600'}`}
                  aria-hidden="true"
                />
                <h4 className="text-sm font-black text-slate-900">{report.campaignTitle}</h4>
                {report.resolvedAt && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-700">
                    {report.outcome === 'removed' ? 'TASDIQLANDI' : 'ASOSSIZ'}
                  </span>
                )}
              </div>

              <p className="text-xs font-bold text-rose-900 mt-1.5">{report.reason}</p>
              {report.comment && <p className="text-xs text-slate-600 mt-1">{report.comment}</p>}
              <p className="text-[11px] text-slate-500 font-semibold mt-1.5">
                {report.reporterName} · {formatDate(report.createdAt)}
              </p>

              {!report.resolvedAt && (
                <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-purple-50">
                  <button
                    type="button"
                    onClick={() =>
                      void perform(async () => {
                        await api.adminCampaignAction(report.campaignId, 'delete', report.reason);
                        await api.adminResolveReport(report.id, 'removed');
                        return "E'lon o'chirildi va shikoyat yopildi";
                      })
                    }
                    className="flex items-center gap-1.5 text-[11px] font-black px-3 py-2 rounded-xl bg-rose-50 text-rose-900 border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    E'lonni o'chirish
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void perform(async () => {
                        await api.adminResolveReport(report.id, 'rejected');
                        return 'Shikoyat asossiz deb yopildi';
                      })
                    }
                    className="flex items-center gap-1.5 text-[11px] font-black px-3 py-2 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Asossiz
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ---------- Ptichka ---------- */}
      {section === 'verified' && (
        <div className="space-y-5">
          <div>
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
              Kutayotgan so'rovlar ({pendingVerifications.length})
            </h3>

            {pendingVerifications.length === 0 ? (
              <p className="text-sm text-slate-500 font-semibold bg-white border border-purple-100 rounded-2xl p-5 text-center">
                Yangi so'rov yo'q.
              </p>
            ) : (
              <div className="space-y-2.5">
                {pendingVerifications.map((request) => (
                  <div key={request.id} className="bg-white border border-violet-200 rounded-2xl p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <BadgeCheck className="w-4 h-4 text-violet-600" aria-hidden="true" />
                      <h4 className="text-sm font-black text-slate-900">{request.bloggerName}</h4>
                      <span className="text-[11px] font-bold text-slate-500">
                        @{request.bloggerUsername}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 font-semibold mt-1 tabular-nums">
                      {request.phone ?? 'telefon yo‘q'} · {formatDate(request.createdAt)}
                    </p>
                    {request.note && <p className="text-xs text-slate-600 mt-1.5">{request.note}</p>}

                    <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-purple-50">
                      <button
                        type="button"
                        onClick={() =>
                          void perform(async () => {
                            await api.adminDecideVerification(request.id, 'approved');
                            return `${request.bloggerName} — ptichka berildi`;
                          })
                        }
                        className="flex items-center gap-1.5 text-[11px] font-black px-3 py-2 rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition cursor-pointer"
                      >
                        <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        To'lov qabul qilindi — ptichka bering
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          ask({
                            title: "So'rovni rad etish",
                            hint: `«${request.bloggerName}» ga sabab bilan xabar boradi.`,
                            reasonRequired: false,
                            run: (text) =>
                              perform(async () => {
                                await api.adminDecideVerification(request.id, 'rejected', text);
                                return "So'rov rad etildi";
                              }),
                          })
                        }
                        className="flex items-center gap-1.5 text-[11px] font-black px-3 py-2 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition cursor-pointer"
                      >
                        Rad etish
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
              Ptichkali blogerlar ({data.verifiedBloggers.length})
            </h3>

            {data.verifiedBloggers.length === 0 ? (
              <p className="text-sm text-slate-500 font-semibold bg-white border border-purple-100 rounded-2xl p-5 text-center">
                Hozircha ptichkali bloger yo'q.
              </p>
            ) : (
              <div className="space-y-2.5">
                {data.verifiedBloggers.map((row) => (
                  <div
                    key={row.id}
                    className="bg-white border rounded-2xl p-4 flex items-center gap-3 flex-wrap"
                    style={{ borderColor: `${row.themeColor ?? '#7c3aed'}59` }}
                  >
                    <img
                      src={row.avatar}
                      alt=""
                      className="w-10 h-10 rounded-2xl object-cover border border-purple-100 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-black text-slate-900 truncate">{row.name}</h4>
                        <BadgeCheck
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: row.themeColor ?? '#7c3aed' }}
                          aria-hidden="true"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 font-semibold">
                        @{row.username} · {formatDate(row.verifiedAt)}
                        {row.themeColor ? ` · ${row.themeColor}` : ''}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        ask({
                          title: "Ptichkani olib qo'yish",
                          hint: `«${row.name}» ptichkadan va tanlagan rangidan mahrum bo'ladi. Unga Telegram orqali xabar boradi.`,
                          reasonRequired: false,
                          run: (text) =>
                            perform(async () => {
                              await api.adminSetVerification(row.id, 'revoke', text);
                              return "Ptichka olib qo'yildi";
                            }),
                        })
                      }
                      className="text-[11px] font-black px-3 py-2 rounded-xl bg-rose-50 text-rose-900 border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
                    >
                      Olib qo'yish
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- Kuzatuv jurnali ---------- */}
      {section === 'log' && (
        <div className="bg-white border border-purple-100 rounded-2xl divide-y divide-purple-50">
          {data.log.length === 0 && (
            <p className="text-sm text-slate-500 font-semibold text-center py-8">
              Hozircha hech qanday amal bajarilmagan.
            </p>
          )}

          {data.log.map((entry) => (
            <div key={entry.id} className="p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-slate-900">{entry.action}</span>
                <span className="text-[11px] text-slate-500 font-semibold tabular-nums">
                  {formatDate(entry.createdAt)}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 font-semibold mt-0.5">{entry.targetLabel}</p>
              {entry.reason && <p className="text-[11px] text-slate-500 mt-0.5">Sabab: {entry.reason}</p>}
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">Admin: {entry.adminName}</p>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Tasdiqlash oynasi ---------- */}
      {pending && (
        <Modal
          isOpen
          title={pending.title}
          onClose={() => setPending(null)}
          initialFocusSelector="#admin-reason"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">{pending.hint}</p>

            <label className="block">
              <span className="text-xs font-bold text-slate-700">
                Sabab {pending.reasonRequired ? '*' : '(ixtiyoriy)'}
              </span>
              <textarea
                id="admin-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Masalan: aloqa raqami ishlamaydi, e'lon yolg'on"
                className="mt-1.5 w-full px-3.5 py-2.5 rounded-2xl border border-purple-100 text-sm outline-none focus:border-violet-400 resize-none"
              />
              <span className="text-[11px] text-slate-500">
                Sabab foydalanuvchiga ham ko'rsatiladi va kuzatuv jurnaliga yoziladi.
              </span>
            </label>

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="text-xs font-black px-4 py-2.5 rounded-2xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                disabled={busy || (pending.reasonRequired && reason.trim().length === 0)}
                onClick={() => void pending.run(reason.trim())}
                className="text-xs font-black px-4 py-2.5 rounded-2xl bg-violet-900 text-white hover:bg-violet-950 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? 'Bajarilmoqda…' : 'Tasdiqlash'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
