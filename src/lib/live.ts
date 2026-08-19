import type {
  BloggerProfile,
  BrandProfile,
  Campaign,
  ChatMessage,
  PlatformState,
  ProposalBid,
} from '../types';

/**
 * Jonli yangilanishlar — serverdan keladigan voqealar.
 *
 * Brauzerning `EventSource` i uzilishda o'zi qayta ulanadi, shuning uchun
 * qo'shimcha qayta ulanish mantiqi yozilmaydi. Bizning vazifamiz — kelgan
 * voqeani mahalliy holatga to'g'ri qo'shish.
 */

export type PlatformEvent =
  | { type: 'campaign:new'; campaign: Campaign }
  | { type: 'campaign:deleted'; campaignId: string }
  | { type: 'bid:new'; bid: ProposalBid; campaignId: string; bidsCount: number; blogger: BloggerProfile }
  | { type: 'bid:updated'; bid: ProposalBid }
  | { type: 'message:new'; message: ChatMessage }
  | { type: 'blogger:updated'; blogger: BloggerProfile }
  | { type: 'brand:updated'; brand: BrandProfile };

const EVENT_NAMES: PlatformEvent['type'][] = [
  'campaign:new',
  'campaign:deleted',
  'bid:new',
  'bid:updated',
  'message:new',
  'blogger:updated',
  'brand:updated',
];

/** Ro'yxatga elementni qo'shadi yoki mavjudini almashtiradi (takrorlanmasligi uchun). */
function upsert<T extends { id: string }>(list: T[], item: T, atStart = true): T[] {
  const index = list.findIndex((existing) => existing.id === item.id);
  if (index >= 0) {
    const copy = [...list];
    copy[index] = item;
    return copy;
  }
  return atStart ? [item, ...list] : [...list, item];
}

/**
 * Voqeani holatga qo'llaydi. Amal idempotent: o'z amalimizdan keyin kelgan
 * takroriy voqea holatni buzmaydi (id bo'yicha almashtiriladi, qo'shilmaydi).
 */
export function applyEvent(state: PlatformState, event: PlatformEvent): PlatformState {
  switch (event.type) {
    case 'campaign:new':
      return { ...state, campaigns: upsert(state.campaigns, event.campaign) };

    case 'campaign:deleted':
      return {
        ...state,
        campaigns: state.campaigns.filter((c) => c.id !== event.campaignId),
        bids: state.bids.filter((b) => b.campaignId !== event.campaignId),
      };

    case 'bid:new':
      return {
        ...state,
        bids: upsert(state.bids, event.bid),
        // Ariza egasining profili — u bo'lmasa e'lon egasi chat ocha olmaydi.
        bloggers: upsert(state.bloggers, event.blogger),
        // Sonni serverdan kelgan qiymatga tenglashtiramiz — o'zimiz oshirgan
        // bo'lsak ham ikki marta hisoblanmaydi.
        campaigns: state.campaigns.map((c) =>
          c.id === event.campaignId ? { ...c, bidsCount: event.bidsCount } : c,
        ),
      };

    case 'bid:updated':
      return { ...state, bids: upsert(state.bids, event.bid) };

    case 'message:new':
      return { ...state, messages: upsert(state.messages, event.message, false) };

    case 'blogger:updated':
      return { ...state, bloggers: upsert(state.bloggers, event.blogger) };

    case 'brand:updated':
      return {
        ...state,
        brands: upsert(state.brands, event.brand),
        campaigns: state.campaigns.map((c) =>
          c.brandId === event.brand.id
            ? { ...c, brandName: event.brand.name, brandLogo: event.brand.logo }
            : c,
        ),
      };

    default:
      return state;
  }
}

export interface LiveOptions {
  onEvent: (event: PlatformEvent) => void;
  onStatus?: (connected: boolean) => void;
}

/**
 * Jonli oqimga ulanadi. Qaytgan funksiya ulanishni yopadi.
 */
export function connectLive({ onEvent, onStatus }: LiveOptions): () => void {
  if (typeof EventSource === 'undefined') return () => {};

  const source = new EventSource('/api/events', { withCredentials: true });

  source.addEventListener('ready', () => onStatus?.(true));
  source.onopen = () => onStatus?.(true);
  source.onerror = () => {
    // EventSource o'zi qayta ulanadi; foydalanuvchiga faqat holatni ko'rsatamiz.
    onStatus?.(false);
  };

  for (const name of EVENT_NAMES) {
    source.addEventListener(name, (message) => {
      try {
        onEvent(JSON.parse((message as MessageEvent<string>).data) as PlatformEvent);
      } catch {
        /* buzilgan xabarni e'tiborsiz qoldiramiz */
      }
    });
  }

  return () => {
    onStatus?.(false);
    source.close();
  };
}
