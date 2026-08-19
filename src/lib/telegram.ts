/**
 * Telegram Mini App bilan ishlash.
 *
 * Ilova brauzerda ham, Telegram ichida ham bir xil ishlaydi: bu modul shunchaki
 * Telegram muhiti bor-yo'qligini aniqlaydi va bor bo'lsa uning imkoniyatlaridan
 * foydalanadi (avtomatik kirish, mavzu ranglari, «Orqaga» tugmasi).
 */

interface TelegramWebApp {
  initData: string;
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isExpanded: boolean;
  ready: () => void;
  expand: () => void;
  close: () => void;
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  openTelegramLink: (url: string) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  BackButton: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (handler: () => void) => void;
    offClick: (handler: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

function webApp(): TelegramWebApp | null {
  const app = window.Telegram?.WebApp;
  // `initData` bo'sh bo'lsa — bu oddiy brauzer, Telegram emas.
  return app && app.initData ? app : null;
}

/** Ilova Telegram ichida ochilganmi? */
export function isTelegramMiniApp(): boolean {
  return webApp() !== null;
}

/** Serverga yuboriladigan imzolangan ma'lumot. */
export function getInitData(): string | null {
  return webApp()?.initData ?? null;
}

/** Telegram muhitini ishga tayyorlaydi: to'liq ekran, mavzu ranglari. */
export function initTelegram(): void {
  const app = webApp();
  if (!app) return;

  app.ready();
  app.expand();
  app.setHeaderColor?.('#FDF7FF');
  app.setBackgroundColor?.('#FDF7FF');
  // Panel ichida aylantirishda oyna tasodifan yopilib ketmasligi uchun.
  app.disableVerticalSwipes?.();

  document.documentElement.classList.add('in-telegram');
}

/**
 * Telegramning «Orqaga» tugmasini boshqaradi.
 * `handler` berilsa tugma ko'rinadi, `null` berilsa yashiriladi.
 */
export function setBackButton(handler: (() => void) | null): () => void {
  const app = webApp();
  if (!app) return () => {};

  if (!handler) {
    app.BackButton.hide();
    return () => {};
  }

  app.BackButton.onClick(handler);
  app.BackButton.show();

  return () => {
    app.BackButton.offClick(handler);
    app.BackButton.hide();
  };
}

/** Tashqi havolani Telegram ichidan to'g'ri ochadi. */
export function openLink(url: string): void {
  const app = webApp();
  if (!app) {
    window.open(url, '_blank', 'noreferrer');
    return;
  }
  if (url.startsWith('https://t.me/')) app.openTelegramLink(url);
  else app.openLink(url);
}

/** Muvaffaqiyat yoki xato haqida sezdiradigan tebranish (mavjud bo'lsa). */
export function haptic(kind: 'success' | 'error' | 'warning'): void {
  webApp()?.HapticFeedback?.notificationOccurred(kind);
}
