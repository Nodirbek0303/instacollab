import type { Response } from 'express';

import type { BloggerProfile, BrandProfile, Campaign, ChatMessage, ProposalBid } from '../types';

/**
 * Jonli yangilanishlar — Server-Sent Events (SSE).
 *
 * Mijoz `/api/events` ga bitta uzoq ulanish ochadi va server o'zgarish bo'lishi
 * bilan xabar yuboradi. Sahifani qo'lda yangilash kerak emas.
 *
 * Nega SSE, WebSocket emas: bu yerda ma'lumot faqat bir tomonga —
 * serverdan mijozga — oqadi. SSE oddiy HTTP ustida ishlaydi, proksi orqali
 * muammosiz o'tadi va brauzer uzilishda o'zi qayta ulanadi.
 */

export type PlatformEvent =
  | { type: 'campaign:new'; campaign: Campaign }
  | { type: 'campaign:deleted'; campaignId: string }
  | { type: 'bid:new'; bid: ProposalBid; campaignId: string; bidsCount: number }
  | { type: 'bid:updated'; bid: ProposalBid }
  | { type: 'message:new'; message: ChatMessage }
  | { type: 'blogger:updated'; blogger: BloggerProfile }
  | { type: 'brand:updated'; brand: BrandProfile };

interface Client {
  id: number;
  accountId: string;
  profileId: string;
  res: Response;
}

const clients = new Set<Client>();
let nextId = 1;

/** Ulangan mijozlar soni — diagnostika uchun. */
export function connectedClients(): number {
  return clients.size;
}

function write(client: Client, payload: string): void {
  try {
    client.res.write(payload);
  } catch {
    clients.delete(client);
  }
}

/** Yangi mijozni ro'yxatga oladi va ulanish yopilganda o'zi chiqarib tashlaydi. */
export function addClient(res: Response, accountId: string, profileId: string): void {
  const client: Client = { id: nextId++, accountId, profileId, res };
  clients.add(client);

  res.on('close', () => {
    clients.delete(client);
  });

  // Birinchi xabar — ulanish tirikligini darhol tasdiqlaydi.
  write(client, `event: ready\ndata: {"ok":true}\n\n`);
}

/**
 * Voqeani tegishli mijozlarga yuboradi.
 *
 * `only` berilsa — faqat o'sha profillarga. Bu shaxsiy ma'lumot (ariza
 * kontaktlari, chat xabarlari) begonalarga ketmasligi uchun kerak.
 */
export function broadcast(event: PlatformEvent, only?: string[]): void {
  if (clients.size === 0) return;

  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  const allowed = only ? new Set(only) : null;

  for (const client of clients) {
    if (allowed && !allowed.has(client.profileId)) continue;
    write(client, payload);
  }
}

/**
 * Proksi va brauzerlar jim turgan ulanishni uzib yuboradi, shuning uchun
 * har 25 soniyada izoh qatori yuboriladi (u hech qanday voqea hisoblanmaydi).
 */
export function startHeartbeat(): void {
  const timer = setInterval(() => {
    for (const client of clients) write(client, ': ping\n\n');
  }, 25_000);
  timer.unref();
}
