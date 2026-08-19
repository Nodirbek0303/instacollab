/**
 * Rasmni yuborishdan oldin brauzerda tayyorlash.
 *
 * Telefondan olingan surat 3–8 MB bo'lishi mumkin, profil uchun esa 512×512
 * yetarli. Rasmni serverga jo'natishdan oldin kichraytiramiz: trafik tejaladi,
 * yuklash tezlashadi va bazada ortiqcha joy egallanmaydi.
 */

/** Profil surati uchun yetarli o'lcham. */
const MAX_SIDE = 512;
const JPEG_QUALITY = 0.85;

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024; // yuklashdan oldingi chegara

export class ImageError extends Error {}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageError("Faylni o'qib bo'lmadi"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImageError('Bu fayl rasm emas yoki buzilgan'));
    img.src = src;
  });
}

/**
 * Rasmni kvadrat qilib qirqadi (markazidan) va `MAX_SIDE` gacha kichraytiradi.
 * Profil suratlari doira ichida ko'rsatilgani uchun kvadrat eng to'g'ri shakl.
 */
export async function prepareProfileImage(file: File): Promise<Blob> {
  if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
    throw new ImageError('Faqat JPG, PNG yoki WEBP rasm tanlang');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImageError('Rasm juda katta (15 MB dan oshmasin)');
  }

  const img = await loadImage(await readAsDataUrl(file));

  // Markazdan kvadrat kesib olamiz.
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  const target = Math.min(side, MAX_SIDE);

  const canvas = document.createElement('canvas');
  canvas.width = target;
  canvas.height = target;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError("Brauzer rasmni qayta ishlay olmadi");

  // Shaffof PNG'lar uchun oq fon — aks holda JPEG'da qora bo'lib chiqadi.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, target, target);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) throw new ImageError("Rasmni tayyorlab bo'lmadi");
  return blob;
}

/** Tayyorlangan rasmni serverga yuboradi va uning manzilini qaytaradi. */
export async function uploadImage(blob: Blob): Promise<string> {
  const response = await fetch('/api/images', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
    body: blob,
  });

  const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!response.ok || !payload?.url) {
    throw new ImageError(payload?.error ?? "Rasmni yuklab bo'lmadi");
  }
  return payload.url;
}

/** Tanlash → kichraytirish → yuklash: bitta amalda. */
export async function uploadProfileImage(file: File): Promise<string> {
  return uploadImage(await prepareProfileImage(file));
}
