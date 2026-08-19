import { Phone, PhoneCall } from 'lucide-react';

import { Modal } from './Modal';
import { telUrl } from '../lib/format';

interface PhoneDialogProps {
  target: { name: string; phone: string } | null;
  onClose: () => void;
}

/** Telefon raqamini ko'rsatuvchi kichik oyna — katalog va bozorda birgalikda ishlatiladi. */
export function PhoneDialog({ target, onClose }: PhoneDialogProps) {
  const href = telUrl(target?.phone);

  return (
    <Modal
      isOpen={target !== null}
      onClose={onClose}
      size="md"
      eyebrow="To'g'ridan-to'g'ri aloqa"
      title={target?.name ?? ''}
      icon={<Phone className="w-4 h-4 text-emerald-600" aria-hidden="true" />}
      bodyClassName="p-6"
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-2xl border border-purple-200 text-xs font-bold text-slate-600 hover:bg-purple-50 cursor-pointer"
          >
            Yopish
          </button>
          {href && (
            <a
              href={href}
              className="flex-1 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 text-center flex items-center justify-center gap-1.5"
            >
              <Phone className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Qo'ng'iroq qilish</span>
            </a>
          )}
        </div>
      }
    >
      <div className="text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
          <PhoneCall className="w-7 h-7" aria-hidden="true" />
        </div>
        <p className="text-xl font-black text-slate-900 select-all">{target?.phone}</p>
        <p className="text-xs text-slate-500 max-w-xs mx-auto">
          Qo'ng'iroq qilishingiz yoki shu raqam orqali Telegram/WhatsApp'da yozishingiz mumkin.
        </p>
      </div>
    </Modal>
  );
}
