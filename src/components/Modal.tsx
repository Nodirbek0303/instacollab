import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Sarlavha — ekran o'qigichlar uchun `aria-labelledby` sifatida ham ishlatiladi. */
  title: string;
  eyebrow?: string;
  icon?: ReactNode;
  /** Sarlavha qatorining o'ng tomoniga qo'shimcha tugmalar. */
  headerExtra?: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
  /** To'q rangli sarlavha (chat va media kit uchun). */
  tone?: 'light' | 'dark';
  children: ReactNode;
  bodyClassName?: string;
  /** Ochilganda fokus beriladigan element uchun CSS selektor (masalan chat maydoni). */
  initialFocusSelector?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Barcha modallar uchun yagona qobiq.
 * Ilgari har bir modal o'z qobig'ini takrorlar edi va hech biri Esc, fon bosish
 * yoki fokus tutqichini qo'llab-quvvatlamasdi.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  eyebrow,
  icon,
  headerExtra,
  footer,
  size = 'lg',
  tone = 'light',
  children,
  bodyClassName = 'p-6 space-y-4',
  initialFocusSelector,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      // Fokus tutqichi: Tab modal ichida aylanadi, ortidagi sahifaga o'tmaydi.
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', handleKeyDown, true);

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferred = initialFocusSelector ? panel.querySelector<HTMLElement>(initialFocusSelector) : null;
      (preferred ?? panel.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = overflow;
      window.clearTimeout(timer);
      restoreFocusRef.current?.focus?.();
    };
  }, [isOpen, handleKeyDown, initialFocusSelector]);

  if (!isOpen) return null;

  const isDark = tone === 'dark';

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onMouseDown={(event) => {
        // Faqat fonning o'ziga bosilganda yopamiz (ichkarida matn tanlashni buzmaslik uchun).
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-white w-full ${
          size === 'lg' ? 'max-w-2xl' : 'max-w-md'
        } rounded-3xl shadow-2xl shadow-purple-950/20 border border-purple-100 overflow-hidden relative my-6 max-h-[92vh] flex flex-col`}
      >
        <div
          className={`p-5 flex items-start justify-between gap-3 border-b ${
            isDark
              ? 'bg-gradient-to-r from-violet-950 via-purple-900 to-pink-950 text-white border-purple-800/40'
              : 'bg-gradient-to-r from-purple-50/80 to-pink-50/60 border-purple-100'
          }`}
        >
          <div className="min-w-0">
            {eyebrow && (
              <span
                className={`text-[10px] uppercase tracking-wider font-bold block ${
                  isDark ? 'text-pink-300' : 'text-purple-900'
                }`}
              >
                {eyebrow}
              </span>
            )}
            <h2
              id={titleId}
              className={`text-base font-extrabold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}
            >
              {icon}
              <span className="truncate">{title}</span>
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              aria-label="Oynani yopish"
              className={`p-1.5 rounded-full transition cursor-pointer ${
                isDark
                  ? 'text-purple-200 hover:text-white bg-white/10 hover:bg-white/20'
                  : 'text-purple-400 hover:text-purple-700 hover:bg-purple-100'
              }`}
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className={`overflow-y-auto flex-1 ${bodyClassName}`}>{children}</div>

        {footer && <div className="p-4 border-t border-purple-100 bg-purple-50/40">{footer}</div>}
      </div>
    </div>
  );
}
