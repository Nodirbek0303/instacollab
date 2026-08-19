import type {
  AuthPayload,
  BloggerProfile,
  BrandProfile,
  Campaign,
  ChatMessage,
  PlatformState,
  ProposalBid,
  UserRole,
} from '../types';

/** Server qaytargan xatoni foydalanuvchiga tushunarli matn bilan uzatadi. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      // Sessiya cookie'si har doim yuborilsin.
      credentials: 'same-origin',
      headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
    });
  } catch {
    throw new ApiError("Server bilan aloqa yo'q. Internetni tekshirib, qayta urinib ko'ring.", 0);
  }

  const text = await response.text();
  const payload: unknown = text ? safeParse(text) : null;

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : null) ?? "Amalni bajarib bo'lmadi.";
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
const patch = (body: unknown): RequestInit => ({ method: 'PATCH', body: JSON.stringify(body) });

export interface RegisterInput {
  role: UserRole;
  phone: string;
  password: string;
  [field: string]: unknown;
}

export interface AppConfig {
  telegramBot: string | null;
  telegramBotUrl: string | null;
  demoMode: boolean;
}

export const api = {
  getConfig: () => request<AppConfig>('/api/config'),

  /* ---- Autentifikatsiya ---- */

  me: () => request<AuthPayload>('/api/auth/me'),

  register: (input: RegisterInput) => request<AuthPayload>('/api/auth/register', post(input)),

  login: (phone: string, password: string) =>
    request<AuthPayload>('/api/auth/login', post({ phone, password })),

  /** Telegram Mini App orqali parolsiz kirish. */
  loginWithTelegram: (initData: string) =>
    request<AuthPayload>('/api/auth/telegram', post({ initData })),

  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/api/auth/password', post({ currentPassword, newPassword })),

  /* ---- Ma'lumotlar ---- */

  getState: () => request<PlatformState>('/api/state'),

  updateBrand: (id: string, input: BrandProfile) =>
    request<BrandProfile>(`/api/brands/${encodeURIComponent(id)}`, patch(input)),

  updateBlogger: (id: string, input: BloggerProfile) =>
    request<BloggerProfile>(`/api/bloggers/${encodeURIComponent(id)}`, patch(input)),

  createCampaign: (input: Record<string, unknown>) => request<Campaign>('/api/campaigns', post(input)),

  deleteCampaign: (id: string) =>
    request<{ ok: true }>(`/api/campaigns/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  createBid: (input: Record<string, unknown>) => request<ProposalBid>('/api/bids', post(input)),

  updateBidStatus: (id: string, status: ProposalBid['status']) =>
    request<ProposalBid>(`/api/bids/${encodeURIComponent(id)}`, patch({ status })),

  sendMessage: (partnerId: string, text: string) =>
    request<ChatMessage>('/api/messages', post({ partnerId, text })),
};
