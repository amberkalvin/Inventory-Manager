import { useRef, useState } from 'react';
import { Camera, CarFront, Loader2, Trash2 } from 'lucide-react';
import { compressVehicleImage } from '../utils/imageUpload';
import { triggerHaptic } from '../services/nativeBridge';

interface VehicleThumbnailProps {
  photoUrl?: string;
  alt: string;
  size: 'sm' | 'md' | 'banner';
  onPhotoChange?: (dataUrl: string) => Promise<void> | void;
  onPhotoRemove?: () => Promise<void> | void;
}

export function VehicleThumbnail({
  photoUrl,
  alt,
  size,
  onPhotoChange,
  onPhotoRemove,
}: VehicleThumbnailProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onPhotoChange) return;
    setBusy(true);
    try {
      const compressed = await compressVehicleImage(file);
      triggerHaptic('success');
      await onPhotoChange(compressed);
    } catch {
      // Ignore invalid/cancelled images
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const triggerPick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onPhotoChange || busy) return;
    triggerHaptic('light');
    inputRef.current?.click();
  };

  if (size === 'banner') {
    return (
      <div className="relative w-full h-44 rounded-2xl overflow-hidden bg-[#0B0E14] border border-white/[0.09] group">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={alt}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-500 bg-gradient-to-b from-[#141B27] to-[#0C1018]">
            <CarFront className="w-9 h-9 text-slate-600" />
            <span className="text-xs font-medium text-slate-400">No vehicle photo yet</span>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2">
          {photoUrl && onPhotoRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic('medium');
                void onPhotoRemove();
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/75 hover:bg-red-500/85 text-slate-200 hover:text-white text-xs font-semibold backdrop-blur-xs border border-white/15 transition-colors cursor-pointer"
              aria-label="Remove vehicle photo"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onPhotoChange && (
            <button
              type="button"
              disabled={busy}
              onClick={triggerPick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/75 hover:bg-sky-500 text-white hover:text-slate-950 text-xs font-semibold backdrop-blur-xs border border-white/15 transition-colors cursor-pointer"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
              <span>{photoUrl ? 'Change Photo' : 'Add Photo'}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const dimensions =
    size === 'sm' ? 'w-14 h-12 rounded-xl' : 'w-20 h-16 rounded-xl';

  return (
    <div
      onClick={onPhotoChange ? triggerPick : undefined}
      title={onPhotoChange ? (photoUrl ? 'Tap to change photo' : 'Tap to upload photo') : undefined}
      className={`relative shrink-0 overflow-hidden bg-gradient-to-b from-[#172030] to-[#0D1119] border border-white/[0.09] group ${dimensions} ${
        onPhotoChange ? 'cursor-pointer' : ''
      }`}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={alt}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-slate-600">
          <CarFront className={size === 'sm' ? 'w-5 h-5' : 'w-6 h-6'} />
        </div>
      )}

      {onPhotoChange && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <span
            aria-hidden="true"
            className={`absolute bottom-1 right-1 w-5 h-5 rounded-md bg-black/75 border border-white/15 flex items-center justify-center text-slate-200 transition-opacity ${
              photoUrl
                ? 'opacity-80 sm:opacity-0 sm:group-hover:opacity-100'
                : 'opacity-90'
            }`}
          >
            {busy ? (
              <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
            ) : (
              <Camera className="w-3 h-3" />
            )}
          </span>
        </>
      )}
    </div>
  );
}
