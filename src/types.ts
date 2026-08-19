export type UserRole = 'advertiser' | 'blogger';

/**
 * Yagona yo'nalishlar ro'yxati. Ilgari bu ro'yxat 4 ta faylda alohida
 * takrorlangan edi — endi hamma joy shu manbadan foydalanadi.
 */
export const NICHES = [
  'Texnologiya & IT',
  'Moda & Go\'zallik',
  'Oshpazlik & Restoran',
  'Lifestyle & Kundalik',
  'Ta\'lim & Biznes',
  'Sport & Fitnes',
  'Yumor & Prikollar',
  'Avtomobillar',
  'Sayohat & Turizm',
] as const;

export type NicheCategory = (typeof NICHES)[number];

/** Filtrlarda ishlatiladigan "Barchasi" varianti bilan birga. */
export const NICHE_FILTERS = ['Barchasi', ...NICHES] as const;

export const CITIES = [
  'Toshkent',
  'Samarqand',
  'Farg\'ona',
  'Buxoro',
  'Namangan',
  'Andijon',
  'Nukus',
  'Qarshi',
] as const;

export const TIERS = [
  'Yangi Boshlovchi',
  'O\'sayotgan Bloger',
  'Pro Bloger',
  'Top Influenser',
] as const;

export type BloggerTier = (typeof TIERS)[number];

export const CAMPAIGN_FORMATS = [
  'Story (24 soat)',
  '3x Story seriyasi',
  'Reels Integratsiya',
  'Maxsus Reels',
  'UGC Video',
] as const;

export type CampaignFormat = (typeof CAMPAIGN_FORMATS)[number];

export interface BrandProfile {
  id: string;
  name: string;
  username: string; // masalan: 'neostore_uz'
  logo: string;
  category: string;
  description: string;
  contactPerson: string;
  contactTelegram: string;
  phone: string;
  websiteOrInstagram?: string;
  totalCampaignsCreated?: number;
}

export interface BloggerPricing {
  story?: number;
  post?: number;
  reels?: number;
}

export interface AudienceDemographics {
  malePercentage: number;
  femalePercentage: number;
  topAge: string;
  topCities: { city: string; percentage: number }[];
}

export interface BloggerProfile {
  id: string;
  name: string;
  username: string;
  avatar: string;
  niche: string;
  bio: string;
  city: string;
  followersCount: number;
  avgStoryViews: number;
  avgReelsViews: number;
  engagementRate: number; // masalan: 7.8
  tier: BloggerTier;
  isVerified: boolean;
  rating: number;
  completedDeals: number;
  audienceDemographics?: AudienceDemographics;
  /** Bloger o'zi belgilaydigan taxminiy tariflar (so'mda). */
  pricing?: BloggerPricing;
  tags: string[];
  contactTelegram?: string;
  phone?: string;
}

export interface Campaign {
  id: string;
  brandName: string;
  brandLogo: string;
  brandId: string;
  title: string;
  description: string;
  niche: string;
  format: CampaignFormat;
  deadlineDays: number;
  requiredFollowersMin: number;
  targetAudience: string;
  status: 'active' | 'in_progress' | 'completed' | 'paused';
  bidsCount: number;
  createdDate: string;
  talkingPoints: string[];
  hashtags: string[];
  contactTelegram: string;
  contactInstagram?: string;
  phone: string;
  dosAndDonts?: {
    dos: string[];
    donts: string[];
  };
  /** Admin qarori. Yo'q bo'lsa — tekshiruvdan o'tmagan, lekin ko'rinadi. */
  moderation?: Moderation;
}

export interface ProposalBid {
  id: string;
  campaignId: string;
  campaignTitle: string;
  brandName: string;
  bloggerId: string;
  bloggerName: string;
  bloggerUsername: string;
  bloggerAvatar: string;
  bloggerFollowers: number;
  bloggerNiche: string;
  bloggerTelegram?: string;
  bloggerPhone?: string;
  message: string;
  creativeIdea: string;
  status: 'pending' | 'accepted' | 'rejected';
  submittedAt: string;
  /** Bloger e'londagi minimal obunachi talabiga javob bermaganda belgilanadi. */
  belowRequirement?: boolean;
}

export interface ChatMessage {
  id: string;
  /** Har doim `${brandId}::${bloggerId}` ko'rinishida — ikkala tomon bir suhbatni ko'radi. */
  threadId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderRole: UserRole;
  text: string;
  createdAt: string; // ISO
}

/* ---------------- Hisoblar va sessiyalar ---------------- */

/**
 * Foydalanuvchi hisobi. Har bir hisob BITTA turga ega:
 * `advertiser` — reklama beruvchi (brend profiliga bog'lanadi),
 * `blogger` — reklama oluvchi (bloger profiliga bog'lanadi).
 * Bu tur ro'yxatdan o'tishda tanlanadi va keyin o'zgarmaydi.
 */
export interface Account {
  id: string;
  /** Login vazifasini bajaradi. Har doim `+998XXXXXXXXX` ko'rinishida saqlanadi. */
  phone: string;
  /** `scrypt$<salt>$<hash>` — ochiq parol hech qachon saqlanmaydi. */
  passwordHash: string;
  role: UserRole;
  /** Bog'langan brend yoki bloger profilining id'si. */
  profileId: string;
  createdAt: string;
  /** Telegram bot orqali ulangan bo'lsa — foydalanuvchining Telegram id'si. */
  telegramId?: number;
  telegramUsername?: string;
  /**
   * Admin qo'ygan holat. Yo'q bo'lsa — `active` deb hisoblanadi (eski yozuvlar
   * uchun).
   *
   *  • `frozen`  — vaqtincha to'xtatilgan: kira olmaydi, lekin hammasi joyida
   *                turadi va istalgan payt qaytariladi;
   *  • `deleted` — o'chirilgan: e'lonlari va profili hech kimga ko'rinmaydi.
   *                Ma'lumot bazadan yo'qolmaydi, shuning uchun qayta tiklash
   *                mumkin. Butunlay yo'q qilish alohida amal.
   */
  status?: AccountStatus;
  statusReason?: string;
  statusAt?: string;
  /** Holatni o'zgartirgan admin hisobining id'si. */
  statusBy?: string;
}

export type AccountStatus = 'active' | 'frozen' | 'deleted';

/**
 * E'lonning moderatsiya holati. Bu `Campaign.status` dan boshqa narsa:
 * `status` — brendning o'z holati (faol, tugagan…), `moderation` esa
 * adminning qarori.
 */
export type ModerationState = 'ok' | 'hidden' | 'deleted';

export interface Moderation {
  state: ModerationState;
  /** Nima uchun yashirildi yoki o'chirildi — foydalanuvchiga ham ko'rsatiladi. */
  reason?: string;
  at?: string;
  /** Qaror qabul qilgan admin hisobining id'si. */
  by?: string;
}

export interface SessionRecord {
  token: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
}

/** Mijozga yuboriladigan hisob ma'lumoti — parol xeshisiz. */
export interface PublicAccount {
  id: string;
  phone: string;
  role: UserRole;
  profileId: string;
  telegramId?: number;
  telegramUsername?: string;
}

/** `/api/auth/me`, `/login` va `/register` javobi. */
export interface AuthPayload {
  account: PublicAccount;
  profile: BrandProfile | BloggerProfile;
}

/** Butun platforma holati — server ham, localStorage keshi ham shu shaklda saqlaydi. */
export interface PlatformState {
  brands: BrandProfile[];
  bloggers: BloggerProfile[];
  campaigns: Campaign[];
  bids: ProposalBid[];
  messages: ChatMessage[];
}

/* ---------------- Telegram bot va yordam xizmati ---------------- */

/** Foydalanuvchining support (yordam xizmati)ga murojaati. */
export interface SupportTicket {
  id: string;
  kind: 'password_reset' | 'question';
  /** Parolni tiklashda — qaysi raqam uchun so'ralgani. */
  phone?: string;
  telegramId: number;
  telegramName: string;
  text?: string;
  status: 'open' | 'resolved' | 'rejected';
  createdAt: string;
  resolvedAt?: string;
  /** Murojaatni yopgan support adminining Telegram id'si. */
  resolvedBy?: number;
}

/** Botdagi ko'p bosqichli suhbat holati (ro'yxatdan o'tish, ulash va h.k.). */
export interface BotSession {
  chatId: number;
  step: string;
  draft: Record<string, unknown>;
  updatedAt: string;
}

/**
 * E'lon ustidan shikoyat. Yolg'on e'lonni admin o'zi qidirib yurmasligi uchun
 * blogerlar «Shikoyat qilish» tugmasi orqali belgilab qo'yadi.
 */
export interface CampaignReport {
  id: string;
  campaignId: string;
  campaignTitle: string;
  /** Shikoyat qilgan profil (bloger yoki brend). */
  reporterId: string;
  reporterName: string;
  reason: ReportReason;
  comment?: string;
  createdAt: string;
  /** Admin ko'rib chiqqan bo'lsa. */
  resolvedAt?: string;
  resolvedBy?: string;
  /** Admin nima qilgani: e'lon o'chirildimi yoki shikoyat asossiz topildimi. */
  outcome?: 'removed' | 'rejected';
}

export const REPORT_REASONS = [
  'Yolg\'on ma\'lumot',
  'Aloqa ma\'lumotlari ishlamaydi',
  'Firibgarlik / oldindan pul so\'rayapti',
  'Nomaqbul mazmun',
  'Takroriy e\'lon',
  'Boshqa sabab',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * Adminning har bir amali yozib boriladi — kim, nima qildi, qachon va nega.
 * Bu «to'liq kuzatuv»ning asosi: keyinchalik «bu hisobni kim muzlatgan?»
 * degan savolga javob beradi.
 */
export interface AdminAction {
  id: string;
  /** Amalni bajargan admin hisobi. */
  adminId: string;
  adminName: string;
  action: string;
  /** Nimaga nisbatan: hisob, e'lon yoki shikoyat id'si. */
  targetType: 'account' | 'campaign' | 'report';
  targetId: string;
  /** Inson o'qiy oladigan qisqa izoh. */
  targetLabel: string;
  reason?: string;
  createdAt: string;
}

/** Serverdagi `data/db.json` faylining to'liq tuzilishi. */
export interface DatabaseShape extends PlatformState {
  accounts: Account[];
  sessions: SessionRecord[];
  /** Support adminlarining Telegram id'lari. */
  supportAdmins: number[];
  tickets: SupportTicket[];
  botSessions: BotSession[];
  reports: CampaignReport[];
  adminLog: AdminAction[];
}

/** Ikki tomon o'rtasidagi suhbat kalitini bir xil tarzda hosil qiladi. */
export function buildThreadId(brandId: string, bloggerId: string): string {
  return `${brandId}::${bloggerId}`;
}
