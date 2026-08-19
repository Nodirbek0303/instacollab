import type {
  AccountStatus,
  AdminAction,
  AuthPayload,
  BloggerProfile,
  BrandProfile,
  Campaign,
  CampaignReport,
  ChatMessage,
  ModerationState,
  PlatformState,
  ProposalBid,
  UserRole,
  VerificationRequest,
} from '../types';

/** Server qaytargan xatoni foydalanuvchiga tushunarli matn bilan uzatadi. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Serverning to'liq javobi — qo'shimcha maydonlar uchun (masalan `pending`). */
    readonly payload: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Hisob admin tasdig'ini kutayaptimi. */
  get isPendingApproval(): boolean {
    return this.payload?.pending === true;
  }

  /** To'lov uchun murojaat qilinadigan Telegram username'i. */
  get adminContact(): string | null {
    const value = this.payload?.adminContact;
    return typeof value === 'string' && value ? value : null;
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
    throw new ApiError(
      message,
      response.status,
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null,
    );
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
  /** To'lov uchun murojaat qilinadigan Telegram username'i (@ siz). */
  adminContact: string | null;
}

/** Ro'yxatdan o'tish tasdiq kutayotgan bo'lsa server shuni qaytaradi. */
export interface PendingApproval {
  pending: true;
  adminContact: string | null;
  message: string;
}

export const api = {
  getConfig: () => request<AppConfig>('/api/config'),

  /* ---- Autentifikatsiya ---- */

  me: () => request<AuthPayload>('/api/auth/me'),

  register: (input: RegisterInput) =>
    request<AuthPayload | PendingApproval>('/api/auth/register', post(input)),

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

  /* ---- Shikoyat ---- */

  reportCampaign: (campaignId: string, reason: string, comment?: string) =>
    request<CampaignReport>('/api/reports', post({ campaignId, reason, comment })),

  /* ---- Admin ---- */

  amIAdmin: () => request<{ isAdmin: boolean }>('/api/admin/me'),

  adminOverview: () => request<AdminOverview>('/api/admin/overview'),

  adminAccountAction: (id: string, action: AccountAction, reason?: string) =>
    request<{ ok: true; status: string }>(`/api/admin/accounts/${encodeURIComponent(id)}`, patch({ action, reason })),

  adminCampaignAction: (id: string, action: CampaignAction, reason?: string) =>
    request<{ ok: true; state: string }>(`/api/admin/campaigns/${encodeURIComponent(id)}`, patch({ action, reason })),

  adminResolveReport: (id: string, outcome: 'removed' | 'rejected') =>
    request<{ ok: true }>(`/api/admin/reports/${encodeURIComponent(id)}`, patch({ outcome })),

  /* ---- Hamjamiyat va ptichka ---- */

  toggleFollow: (targetId: string) =>
    request<{ following: boolean; followers: number }>('/api/follows', post({ targetId })),

  requestVerification: (note?: string) =>
    request<VerificationRequest>('/api/verification/request', post({ note })),

  myVerification: () =>
    request<{ request: VerificationRequest | null; price: string | null }>('/api/verification/mine'),

  setThemeColor: (color: string | null) =>
    request<{ ok: true; themeColor: string | null }>('/api/verification/color', patch({ color })),

  adminDecideVerification: (id: string, decision: 'approved' | 'rejected', note?: string) =>
    request<{ ok: true }>(
      `/api/admin/verification/requests/${encodeURIComponent(id)}`,
      patch({ decision, note }),
    ),

  adminSetVerification: (bloggerId: string, action: 'grant' | 'revoke', reason?: string) =>
    request<{ ok: true; isVerified: boolean }>(
      `/api/admin/verification/${encodeURIComponent(bloggerId)}`,
      patch({ action, reason }),
    ),

  adminResetPassword: (id: string) =>
    request<{ ok: true; password: string }>(
      `/api/admin/accounts/${encodeURIComponent(id)}/reset-password`,
      { method: 'POST' },
    ),
};

export type AccountAction = 'approve' | 'reject' | 'freeze' | 'unfreeze' | 'delete' | 'restore';
export type CampaignAction = 'hide' | 'show' | 'delete' | 'restore';

/** Admin panelidagi bitta hisob qatori. */
export interface AdminAccountRow {
  id: string;
  phone: string;
  role: UserRole;
  profileId: string;
  profileName: string;
  profileAvatar: string;
  createdAt: string;
  telegramId: number | null;
  telegramUsername: string | null;
  status: AccountStatus;
  statusReason: string | null;
  statusAt: string | null;
  isAdmin: boolean;
  campaignsCount: number;
  bidsCount: number;
}

export interface AdminCampaignRow extends Campaign {
  moderationState: ModerationState;
  reportsCount: number;
  ownerStatus: AccountStatus;
}

export interface AdminVerifiedRow {
  id: string;
  name: string;
  username: string;
  avatar: string;
  verifiedAt: string | null;
  themeColor: string | null;
}

export interface AdminOverview {
  stats: Record<string, number>;
  accounts: AdminAccountRow[];
  campaigns: AdminCampaignRow[];
  reports: CampaignReport[];
  verificationRequests: VerificationRequest[];
  verifiedBloggers: AdminVerifiedRow[];
  log: AdminAction[];
}
