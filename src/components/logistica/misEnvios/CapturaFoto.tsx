'use client';

/**
 * Tomar una foto con la cámara del celular (o elegirla de la galería) para la prueba de entrega,
 * el comprobante de la transferencia o la evidencia de una novedad. La foto se reduce a 1.600 px
 * en JPEG antes de subirla (el bucket admite 5 MB y la señal en la calle es mala).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { cn } from '@/utils/Utils';

export interface CapturaFotoProps {
  titulo: string;
  descripcion?: string;
  fotos: Blob[];
  onFotosChange: (fotos: Blob[]) => void;
  maximo?: number;
  textoQuitar: string;
  invalido?: boolean;
}

const LADO_MAXIMO = 1600;

/** Reduce una foto del celular a JPEG de 1.600 px. Si el navegador no puede, devuelve el archivo. */
export async function comprimirImagen(archivo: File): Promise<Blob> {
  if (typeof document === 'undefined' || !archivo.type.startsWith('image/')) return archivo;
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    const ctx = lienzo.getContext('2d');
    if (!ctx) return archivo;
    ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.8));
    return blob ?? archivo;
  } catch {
    return archivo;
  }
}

export function CapturaFoto({ titulo, descripcion, fotos, onFotosChange, maximo = 3, textoQuitar, invalido }: CapturaFotoProps) {
  const id = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [vistas, setVistas] = useState<string[]>([]);

  useEffect(() => {
    const urls = fotos.map((f) => URL.createObjectURL(f));
    setVistas(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [fotos]);

  const agregar = async (lista: FileList | null) => {
    if (!lista || lista.length === 0) return;
    const nuevas = await Promise.all([...lista].slice(0, maximo - fotos.length).map(comprimirImagen));
    onFotosChange([...fotos, ...nuevas]);
    if (entrada.current) entrada.current.value = '';
  };

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className={cn(
          'flex min-h-[64px] cursor-pointer items-center gap-3 rounded-xl border bg-subtle px-4 py-3',
          invalido ? 'border-line-danger' : 'border-line',
          fotos.length >= maximo && 'pointer-events-none opacity-50',
        )}
      >
        <Camera aria-hidden="true" className="size-5 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        <span className="flex min-w-0 flex-col">
          <span className="text-[15px] font-medium text-fg">
            {titulo}
            {fotos.length > 0 ? ` (${fotos.length})` : ''}
          </span>
          {descripcion && <span className="text-[13px] text-fg-muted">{descripcion}</span>}
        </span>
      </label>
      <input
        id={id}
        ref={entrada}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={fotos.length >= maximo}
        onChange={(e) => void agregar(e.target.files)}
      />
      {vistas.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {vistas.map((src, i) => (
            <li key={src} className="relative size-20 overflow-hidden rounded-lg border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
              <img src={src} alt="" className="size-full object-cover" />
              <button
                type="button"
                onClick={() => onFotosChange(fotos.filter((_, j) => j !== i))}
                aria-label={`${textoQuitar} ${i + 1}`}
                className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-surface/90 text-fg shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
