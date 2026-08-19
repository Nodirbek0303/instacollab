import { Building2, Info, Instagram, Sparkles } from 'lucide-react';

import { Modal } from './Modal';

interface HowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HowItWorksModal({ isOpen, onClose }: HowItWorksModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      tone="dark"
      eyebrow="Qo'llanma & qoidalar"
      title="InstaCollab qanday ishlaydi?"
      icon={<Sparkles className="w-4 h-4 text-amber-400" aria-hidden="true" />}
      bodyClassName="p-6 space-y-6 text-xs text-slate-700 leading-relaxed"
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 hover:from-violet-700 hover:via-purple-700 hover:to-pink-700 text-white rounded-2xl text-xs font-bold shadow-lg shadow-purple-600/25 transition cursor-pointer"
          >
            Tushundim, boshlash
          </button>
        </div>
      }
    >
      {/* Blogerlar uchun */}
      <section className="space-y-3">
        <h3 className="font-extrabold text-sm text-pink-600 flex items-center gap-2">
          <Instagram className="w-4 h-4" aria-hidden="true" />
          <span>Blogerlar uchun</span>
        </h3>
        <ol className="space-y-2 bg-gradient-to-br from-pink-50/70 to-purple-50/50 border border-pink-100/80 p-4 rounded-2xl list-none m-0">
          <li className="flex gap-2">
            <span className="font-extrabold text-pink-600 shrink-0">1-qadam:</span>
            <span>
              <strong>Profilingizni to'ldiring:</strong> obunachilar soni, Story va Reels qamrovi, tariflaringiz va
              aloqa kontaktlaringiz.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-extrabold text-pink-600 shrink-0">2-qadam:</span>
            <span>
              <strong>Ariza yuboring:</strong> «Reklamalar Bozori» bo'limida brendlar e'lonlarini ko'rib, o'z
              taklifingizni yuboring. E'londagi minimal obunachi talabiga javob berishingiz kerak.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-extrabold text-pink-600 shrink-0">3-qadam:</span>
            <span>
              <strong>Shartlarni kelishing:</strong> brend bilan sayt chatida, Telegram yoki telefon orqali ssenariy,
              muddat va narxni to'g'ridan-to'g'ri muhokama qilasiz.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-extrabold text-pink-600 shrink-0">4-qadam:</span>
            <span>
              <strong>Reklamani joylang:</strong> kelishilgan kontentni Instagram sahifangizga chiqarasiz va
              natijani brendga ko'rsatasiz.
            </span>
          </li>
        </ol>
      </section>

      {/* Reklama beruvchilar uchun */}
      <section className="space-y-3">
        <h3 className="font-extrabold text-sm text-purple-950 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-purple-600" aria-hidden="true" />
          <span>Reklama beruvchilar uchun</span>
        </h3>
        <ol className="space-y-2 bg-purple-50/40 border border-purple-100/80 p-4 rounded-2xl list-none m-0">
          <li className="flex gap-2">
            <span className="font-extrabold text-purple-900 shrink-0">1-qadam:</span>
            <span>
              <strong>Reklama e'loni joylang:</strong> yo'nalish, byudjet va blogerga qo'yiladigan talablarni
              ko'rsating. E'lon barcha blogerlarga ko'rinadi.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-extrabold text-purple-900 shrink-0">2-qadam:</span>
            <span>
              <strong>Arizalarni kuting:</strong> qiziqqan blogerlar o'zlari murojaat qiladi. Har bir arizada
              blogerning obunachilar soni, taklif qilgan narxi va aloqa ma'lumotlari bo'ladi.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-extrabold text-purple-900 shrink-0">3-qadam:</span>
            <span>
              Mos blogerni «Tasdiqlash» tugmasi bilan tanlab, u bilan sayt chati, Telegram yoki telefon orqali
              bevosita kelishasiz.
            </span>
          </li>
        </ol>
      </section>

      {/* Halol ogohlantirish — ilgari bu yerda mavjud bo'lmagan "escrow" va'da qilingandi */}
      <section className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4 flex items-start gap-3">
        <Info className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h3 className="font-extrabold text-amber-950 text-xs mb-1">To'lov haqida muhim ma'lumot</h3>
          <p className="text-[11px] text-amber-900 font-medium leading-relaxed">
            InstaCollab hozircha <strong>faqat tanishtiruv maydoni</strong>: u brend va blogerni bir-biriga
            bog'laydi, xolos. Platformada to'lov tizimi, kafolat yoki escrow xizmati <strong>yo'q</strong> — pul
            o'tkazmasi va shartnoma to'g'ridan-to'g'ri tomonlar o'rtasida amalga oshiriladi.
          </p>
          <p className="text-[11px] text-amber-900/90 leading-relaxed mt-2">
            Shuning uchun: to'lovni bosqichma-bosqich (masalan, 50% oldindan / 50% e'londan keyin) kelishing,
            blogerning Instagram sahifasi va statistikasini o'zingiz tekshiring, barcha shartlarni yozma tarzda
            chatda qayd eting.
          </p>
        </div>
      </section>
    </Modal>
  );
}
