import { useEffect, useMemo, useRef, useState } from 'react';
import { Instagram, MessageSquare, Phone, Send, Send as TelegramIcon } from 'lucide-react';

import type { BloggerProfile, BrandProfile, ChatMessage, UserRole } from '../types';
import { buildThreadId } from '../types';
import { formatTimestamp, instagramUrl, telegramUrl } from '../lib/format';
import { ApiError } from '../lib/api';
import { Modal } from './Modal';
import { PhoneDialog } from './PhoneDialog';

interface ChatDealModalProps {
  isOpen: boolean;
  onClose: () => void;
  brand: BrandProfile | null;
  blogger: BloggerProfile | null;
  currentUserRole: UserRole;
  messages: ChatMessage[];
  onSendMessage: (text: string) => Promise<void>;
}

export function ChatDealModal({
  isOpen,
  onClose,
  brand,
  blogger,
  currentUserRole,
  messages,
  onSendMessage,
}: ChatDealModalProps) {
  // MUHIM: barcha hooklar erta `return`dan oldin turadi (React Hooks qoidasi).
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPhone, setShowPhone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isAdvertiser = currentUserRole === 'advertiser';
  const opponent = isAdvertiser ? blogger : brand;
  const threadId = brand && blogger ? buildThreadId(brand.id, blogger.id) : null;

  const threadMessages = useMemo(
    () => (threadId ? messages.filter((message) => message.threadId === threadId) : []),
    [messages, threadId],
  );

  // Yangi xabar kelganda oxiriga aylantiramiz.
  useEffect(() => {
    if (!isOpen) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [isOpen, threadMessages.length]);

  useEffect(() => {
    if (!isOpen) {
      setInputText('');
      setError(null);
      setShowPhone(false);
    }
  }, [isOpen]);

  if (!brand || !blogger || !opponent) return null;

  const opponentName = opponent.name;
  const opponentUsername = isAdvertiser ? blogger.username : brand.username;
  const opponentAvatar = isAdvertiser ? blogger.avatar : brand.logo;
  const opponentTelegram = isAdvertiser ? blogger.contactTelegram : brand.contactTelegram;
  const opponentPhone = isAdvertiser ? blogger.phone : brand.phone;
  const opponentInstagram = isAdvertiser ? blogger.username : (brand.websiteOrInstagram ?? brand.username);
  const currentUserId = isAdvertiser ? brand.id : blogger.id;

  const tgUrl = telegramUrl(opponentTelegram);
  const igUrl = instagramUrl(opponentInstagram);

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = inputText.trim();
    if (!text || isSending) return;

    setIsSending(true);
    setError(null);
    try {
      await onSendMessage(text);
      setInputText('');
    } catch (sendError) {
      setError(sendError instanceof ApiError ? sendError.message : "Xabarni yuborib bo'lmadi.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={opponentName}
        eyebrow={`@${opponentUsername}`}
        icon={
          <img
            src={opponentAvatar}
            alt=""
            className="w-7 h-7 rounded-xl object-cover border border-purple-200 shrink-0"
          />
        }
        bodyClassName="p-0 flex flex-col"
        initialFocusSelector="#input-chat-message"
        headerExtra={
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {tgUrl && (
              <a
                href={tgUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-[11px] font-bold flex items-center gap-1 transition"
              >
                <TelegramIcon className="w-3 h-3" aria-hidden="true" />
                <span>Telegram</span>
              </a>
            )}
            {igUrl && (
              <a
                href={igUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white text-[11px] font-bold flex items-center gap-1 transition"
              >
                <Instagram className="w-3 h-3" aria-hidden="true" />
                <span>Instagram</span>
              </a>
            )}
            {opponentPhone && (
              <button
                type="button"
                onClick={() => setShowPhone(true)}
                className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
              >
                <Phone className="w-3 h-3" aria-hidden="true" />
                <span>Telefon</span>
              </button>
            )}
          </div>
        }
      >
        <div className="flex flex-col h-[60vh] min-h-[360px]">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FDF7FF]/60">
            {threadMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
                <MessageSquare className="w-9 h-9 text-purple-300" aria-hidden="true" />
                <p className="text-xs font-bold text-slate-700">Suhbat hali boshlanmagan</p>
                <p className="text-[11px] text-slate-500 max-w-xs">
                  {isAdvertiser
                    ? "Blogerga hamkorlik shartlarini yozing — u javobni shu yerda ko'radi."
                    : "Brendga o'zingizni tanishtiring va reklama g'oyangizni taklif qiling."}
                </p>
              </div>
            ) : (
              <ul className="list-none p-0 m-0 space-y-3">
                {threadMessages.map((message) => {
                  const isMine = message.senderId === currentUserId;

                  return (
                    <li key={message.id} className={`flex gap-2.5 max-w-[85%] ${isMine ? 'ml-auto flex-row-reverse' : ''}`}>
                      <img
                        src={message.senderAvatar}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover shrink-0 mt-1 border border-purple-100"
                      />
                      <div className="min-w-0">
                        <div
                          className={`p-3.5 rounded-3xl text-xs leading-relaxed ${
                            isMine
                              ? 'bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 text-white rounded-tr-xs shadow-md shadow-purple-600/20'
                              : 'bg-white border border-purple-100 text-slate-800 rounded-tl-xs'
                          }`}
                        >
                          <span
                            className={`text-[10px] font-extrabold block mb-1 ${
                              isMine ? 'text-pink-200' : 'text-purple-900'
                            }`}
                          >
                            {message.senderName}
                          </span>
                          <p className="whitespace-pre-wrap break-words">{message.text}</p>
                        </div>
                        <span
                          className={`text-[10px] text-slate-400 mt-1 block px-1 font-medium ${isMine ? 'text-right' : ''}`}
                        >
                          {formatTimestamp(message.createdAt)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {error && (
            <p role="alert" className="mx-3 mb-2 text-[11px] font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
              {error}
            </p>
          )}

          <form onSubmit={handleSend} className="p-3.5 border-t border-purple-100 bg-white flex items-center gap-2">
            <label htmlFor="input-chat-message" className="sr-only">
              Xabar matni
            </label>
            <input
              id="input-chat-message"
              type="text"
              maxLength={2000}
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              placeholder="Xabaringizni yozing..."
              className="flex-1 px-4 py-2.5 rounded-2xl border border-purple-100 text-xs bg-purple-50/30 text-slate-900 focus:bg-white focus:outline-none focus:border-purple-300 shadow-inner font-medium"
            />
            <button
              type="submit"
              id="btn-send-chat-msg"
              disabled={isSending || inputText.trim() === ''}
              aria-label="Xabarni yuborish"
              className="p-3 bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 hover:from-pink-600 hover:via-rose-600 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl transition cursor-pointer shadow-md shadow-pink-500/20"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </Modal>

      <PhoneDialog
        target={showPhone && opponentPhone ? { name: opponentName, phone: opponentPhone } : null}
        onClose={() => setShowPhone(false)}
      />
    </>
  );
}
