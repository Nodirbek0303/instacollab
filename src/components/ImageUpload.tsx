import { useId, useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';

import { ImageError, uploadProfileImage } from '../lib/image';

interface ImageUploadProps {
  /** Hozirgi rasm manzili. */
  value: string;
  onChange: (url: string) => void;
  label: string;
  hint?: string;
  /** Rasm o'chirilganda qo'yiladigan manzil (standart rasm). */
  fallback?: string;
  /** Doira (profil surati) yoki kvadrat (logotip). */
  shape?: 'circle' | 'rounded';
  alt: string;
}

export function ImageUpload({
  value,
  onChange,
  label,
  hint,
  fallback,
  shape = 'circle',
  alt,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setIsBusy(true);
    setError(null);
    try {
      const url = await uploadProfileImage(file);
      onChange(url);
    } catch (uploadError) {
      setError(uploadError instanceof ImageError ? uploadError.message : "Rasmni yuklab bo'lmadi");
    } finally {
      setIsBusy(false);
      // Bir xil faylni qayta tanlash mumkin bo'lishi uchun tozalaymiz.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const rounding = shape === 'circle' ? 'rounded-full' : 'rounded-2xl';

  return (
    <div>
      <span className="block text-xs font-bold text-slate-700 mb-2">{label}</span>

      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <img
            src={value}
            alt={alt}
            className={`w-20 h-20 object-cover border-2 border-purple-100 shadow-sm bg-purple-50 ${rounding}`}
          />
          {isBusy && (
            <span
              className={`absolute inset-0 bg-slate-900/50 flex items-center justify-center ${rounding}`}
              aria-hidden="true"
            >
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            </span>
          )}
        </div>

        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={inputId}
              className={`px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition ${
                isBusy
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-violet-600 hover:bg-violet-700 text-white cursor-pointer shadow-sm'
              }`}
            >
              <Camera className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isBusy ? 'Yuklanmoqda…' : 'Rasm tanlash'}</span>
            </label>

            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={isBusy}
              onChange={(event) => void handleFile(event.target.files?.[0])}
              className="sr-only"
            />

            {fallback && value !== fallback && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  onChange(fallback);
                }}
                disabled={isBusy}
                className="px-3 py-2 rounded-2xl border border-purple-200 text-slate-600 hover:bg-purple-50 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" aria-hidden="true" />
                <span>Olib tashlash</span>
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            {hint ?? 'JPG, PNG yoki WEBP. Rasm avtomatik kvadrat qilib kichraytiriladi.'}
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[11px] font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
