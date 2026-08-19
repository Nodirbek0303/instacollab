import { useEffect, useState } from 'react';
import {
  Building2,
  Check,
  Instagram,
  Lock,
  LogOut,
  Phone,
  Send as TelegramIcon,
  Settings,
  ShieldCheck,
} from 'lucide-react';

import type { BloggerProfile, BrandProfile, PublicAccount } from '../types';
import { ApiError, api, type AppConfig } from '../lib/api';
import { Modal } from './Modal';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: PublicAccount;
  profile: BrandProfile | BloggerProfile;
  config: AppConfig | null;
  onLogout: () => Promise<void>;
  onOpenProfileTab: () => void;
}

/** Telefonni +998 90 123-45-67 ko'rinishida ko'rsatadi. */
function prettyPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 12) return phone;
  return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)}-${digits.slice(8, 10)}-${digits.slice(10)}`;
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-2xl border border-purple-100 text-xs bg-purple-50/30 text-slate-900 focus:bg-white focus:outline-none focus:border-purple-300 shadow-inner';

export function AccountModal({
  isOpen,
  onClose,
  account,
  profile,
  config,
  onLogout,
  onOpenProfileTab,
}: AccountModalProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) return;
    setShowPasswordForm(false);
    setCurrentPassword('');
    setNewPassword('');
    setError(null);
    setSavedAt(null);
  }, [isOpen]);

  const isAdvertiser = account.role === 'advertiser';
  const avatar = isAdvertiser ? (profile as BrandProfile).logo : (profile as BloggerProfile).avatar;
  const subtitle = isAdvertiser
    ? (profile as BrandProfile).category
    : `@${(profile as BloggerProfile).username}`;

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setShowPasswordForm(false);
      setSavedAt(Date.now());
    } catch (changeError) {
      setError(changeError instanceof ApiError ? changeError.message : "Parolni o'zgartirib bo'lmadi.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      eyebrow="Hisobim"
      title={profile.name}
      icon={
        isAdvertiser ? (
          <Building2 className="w-4 h-4 text-violet-600" aria-hidden="true" />
        ) : (
          <Instagram className="w-4 h-4 text-pink-600" aria-hidden="true" />
        )
      }
      bodyClassName="p-6 space-y-4"
    >
      <div className="flex items-center gap-3.5">
        <img
          src={avatar}
          alt={`${profile.name} rasmi`}
          className="w-14 h-14 rounded-2xl object-cover border-2 border-purple-100 shadow-sm"
        />
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-900 truncate">{profile.name}</p>
          <p className="text-xs text-slate-500 truncate">{subtitle}</p>
          <span
            className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md inline-block mt-1 ${
              isAdvertiser
                ? 'bg-violet-100 text-violet-900 border border-violet-200'
                : 'bg-pink-100 text-pink-900 border border-pink-200'
            }`}
          >
            {isAdvertiser ? 'Reklama beruvchi' : 'Bloger'}
          </span>
        </div>
      </div>

      <dl className="bg-purple-50/50 border border-purple-100 rounded-2xl p-4 space-y-2.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-500 font-medium flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
            Telefon (login)
          </dt>
          <dd className="font-bold text-slate-900">{prettyPhone(account.phone)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-500 font-medium flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-500" aria-hidden="true" />
            Hisob turi
          </dt>
          <dd className="font-bold text-slate-900">{isAdvertiser ? "E'lon joylaydi" : 'Reklama oladi'}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-500 font-medium flex items-center gap-1.5">
            <TelegramIcon className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" />
            Telegram
          </dt>
          <dd className={`font-bold ${account.telegramId ? 'text-emerald-700' : 'text-slate-400'}`}>
            {account.telegramId
              ? account.telegramUsername
                ? `@${account.telegramUsername}`
                : 'Ulangan'
              : 'Ulanmagan'}
          </dd>
        </div>
      </dl>

      {/* Telegram bot — bildirishnomalar va parolni tiklash */}
      {config?.telegramBotUrl && !account.telegramId && (
        <a
          href={config.telegramBotUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 p-3.5 rounded-2xl bg-sky-50 border border-sky-200 hover:bg-sky-100 transition"
        >
          <span className="w-9 h-9 rounded-xl bg-sky-500 text-white flex items-center justify-center shrink-0">
            <TelegramIcon className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-black text-sky-950">Telegram botni ulang</span>
            <span className="block text-[11px] text-sky-800/80">
              {config.telegramBot} — arizalar va xabarlar haqida darhol xabar beradi, parolni tiklashga yordamlashadi
            </span>
          </span>
        </a>
      )}

      {savedAt !== null && (
        <p
          role="status"
          className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center gap-2"
        >
          <Check className="w-4 h-4" aria-hidden="true" />
          Parol o'zgartirildi. Boshqa qurilmalardagi sessiyalar bekor qilindi.
        </p>
      )}

      {/* Parolni o'zgartirish */}
      {showPasswordForm ? (
        <form onSubmit={handleChangePassword} className="space-y-3 border-t border-purple-100 pt-4">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Parolni o'zgartirish</h3>

          {error && (
            <p role="alert" className="text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-2xl p-3">
              {error}
            </p>
          )}

          <div>
            <label htmlFor="input-current-password" className="block text-xs font-bold text-slate-700 mb-1">
              Joriy parol
            </label>
            <input
              id="input-current-password"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="input-new-password" className="block text-xs font-bold text-slate-700 mb-1">
              Yangi parol <span className="font-normal text-slate-400">(kamida 8 belgi)</span>
            </label>
            <input
              id="input-new-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPasswordForm(false)}
              className="px-4 py-2.5 rounded-2xl border border-purple-200 text-slate-600 text-xs font-bold hover:bg-purple-50 cursor-pointer"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold cursor-pointer"
            >
              {isSaving ? 'Saqlanmoqda…' : 'Parolni saqlash'}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowPasswordForm(true)}
          className="w-full py-2.5 px-4 rounded-2xl border border-purple-200 text-slate-700 hover:bg-purple-50 text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5"
        >
          <Lock className="w-3.5 h-3.5 text-purple-600" aria-hidden="true" />
          <span>Parolni o'zgartirish</span>
        </button>
      )}

      <p className="text-[11px] text-slate-500 leading-relaxed">
        Hisob turi ro'yxatdan o'tishda tanlangan va o'zgartirilmaydi. Ikkinchi turdagi hisob kerak bo'lsa, boshqa
        telefon raqami bilan alohida ro'yxatdan o'ting.
      </p>

      <div className="flex flex-col sm:flex-row items-stretch gap-2 pt-1 border-t border-purple-100">
        <button
          type="button"
          onClick={onOpenProfileTab}
          className="flex-1 mt-3 py-2.5 px-4 rounded-2xl border border-purple-200 text-slate-700 hover:bg-purple-50 text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5"
        >
          <Settings className="w-3.5 h-3.5 text-purple-600" aria-hidden="true" />
          <span>{isAdvertiser ? 'Brend profilini tahrirlash' : 'Media Kitni tahrirlash'}</span>
        </button>

        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="sm:mt-3 py-2.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md shadow-rose-600/20 cursor-pointer flex items-center justify-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isLoggingOut ? 'Chiqilmoqda…' : 'Chiqish'}</span>
        </button>
      </div>
    </Modal>
  );
}
