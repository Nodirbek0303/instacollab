import { ArrowLeft, CheckCircle2, Clock, CreditCard, Send } from 'lucide-react';

import { openLink } from '../lib/telegram';

interface PendingApprovalScreenProps {
  /** To'lov uchun murojaat qilinadigan Telegram username'i (@ siz). */
  adminContact: string | null;
  /** Bot manzili — admin username'i berilmagan bo'lsa shu yerga yo'naltiramiz. */
  botUrl: string | null;
  /** Serverdan kelgan tushuntirish matni. */
  message?: string;
  /** Yangi ro'yxatdan o'tganmi yoki kirishga urinayaptimi. */
  justRegistered: boolean;
  onBack: () => void;
}

const STEPS = [
  {
    Icon: CheckCircle2,
    title: 'Hisob yaratildi',
    body: "Ma'lumotlaringiz saqlandi va administratorga xabar bordi.",
    done: true,
  },
  {
    Icon: CreditCard,
    title: "To'lovni amalga oshiring",
    body: "Administratorga Telegram orqali yozing — to'lov summasi va usulini u aytadi.",
    done: false,
  },
  {
    Icon: Clock,
    title: 'Tasdiqni kuting',
    body: "To'lov qabul qilingach hisobingiz ochiladi va Telegramga xabar keladi.",
    done: false,
  },
];

export function PendingApprovalScreen({
  adminContact,
  botUrl,
  message,
  justRegistered,
  onBack,
}: PendingApprovalScreenProps) {
  const adminUrl = adminContact ? `https://t.me/${adminContact}` : botUrl;

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white border border-purple-100 rounded-3xl shadow-lg shadow-purple-950/5 p-6 sm:p-8">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-600" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-lg font-black text-slate-900 leading-tight">
                {justRegistered ? "Ro'yxatdan o'tdingiz" : 'Hisobingiz hali ochilmagan'}
              </h1>
              <p className="text-[11px] font-bold text-amber-700">Administrator tasdig'i kutilmoqda</p>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed mt-3">
            {message ??
              "Hisobingiz administrator tasdig'ini kutmoqda. To'lovni amalga oshirib, administratorga yozing — tasdiqlangach hisobingiz ochiladi."}
          </p>

          <ol className="space-y-3 my-6 list-none m-0 p-0">
            {STEPS.map(({ Icon, title, body, done }, index) => (
              <li key={title} className="flex gap-3">
                <span
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    done ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-black text-slate-900">
                    {index + 1}. {title}
                  </p>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{body}</p>
                </div>
              </li>
            ))}
          </ol>

          {adminUrl ? (
            <button
              type="button"
              id="btn-contact-admin"
              onClick={() => openLink(adminUrl)}
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white text-sm font-black px-4 py-3.5 rounded-2xl shadow-md shadow-violet-600/20 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              Administratorga yozish
              {adminContact && <span className="font-bold opacity-80">@{adminContact}</span>}
            </button>
          ) : (
            <p className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-2xl px-3.5 py-3 text-center">
              Administrator bilan bog'lanish uchun botdagi «🆘 Yordam» tugmasidan foydalaning.
            </p>
          )}

          <p className="text-[11px] text-slate-500 text-center mt-3 leading-relaxed">
            Tasdiqlangach shu telefon raqamingiz va parolingiz bilan kirasiz. Qayta ro'yxatdan
            o'tish shart emas.
          </p>

          <button
            type="button"
            onClick={onBack}
            className="w-full mt-5 text-xs font-black text-slate-600 hover:text-slate-900 py-2.5 rounded-2xl hover:bg-slate-50 transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Kirish sahifasiga qaytish
          </button>
        </div>
      </div>
    </div>
  );
}
