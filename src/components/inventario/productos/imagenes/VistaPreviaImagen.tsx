'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, ImageOff, Star, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export interface ImagenVista {
  clave: string;
  url: string;
  alt: string;
  principal: boolean;
}

/**
 * «Vista previa» (A.8 #12) con navegación: flechas en pantalla y del teclado,
 * contador «2 de 4», texto alternativo y marca de principal.
 */
export function VistaPreviaImagen({
  imagenes,
  indice,
  onIndiceChange,
}: {
  imagenes: readonly ImagenVista[];
  /** null = cerrada. */
  indice: number | null;
  onIndiceChange: (indice: number | null) => void;
}) {
  const t = useTranslations('productoDetalle.imagenes');
  const [fallida, setFallida] = useState(false);
  const total = imagenes.length;
  const abierta = indice !== null && total > 0;
  const actual = abierta ? imagenes[Math.min(indice, total - 1)] : null;

  useEffect(() => setFallida(false), [actual?.url]);

  const mover = (delta: number) => {
    if (indice === null || total === 0) return;
    onIndiceChange((indice + delta + total) % total);
  };

  return (
    <Dialog open={abierta} onOpenChange={(v) => !v && onIndiceChange(null)}>
      <DialogContent
        hideCloseButton
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') mover(1);
          if (e.key === 'ArrowLeft') mover(-1);
        }}
        className="flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-none flex-col gap-0 overflow-hidden rounded-xl border-line bg-surface p-0 text-fg sm:max-w-[880px]"
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <DialogTitle className="text-base font-semibold text-fg">{t('vista.titulo')}</DialogTitle>
            <DialogDescription className="truncate text-xs text-fg-secondary">
              {actual ? t('vista.posicion', { n: (indice ?? 0) + 1, total }) : ''}
              {actual?.alt ? ` · ${actual.alt}` : ''}
            </DialogDescription>
          </div>
          {actual?.principal && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-deep">
              <Star className="size-3 fill-current" aria-hidden /> {t('principal')}
            </span>
          )}
          <button
            type="button"
            onClick={() => onIndiceChange(null)}
            aria-label={t('vista.cerrar')}
            className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="relative flex min-h-[240px] flex-1 items-center justify-center bg-subtle p-2">
          {actual &&
            (fallida || !actual.url ? (
              <div className="flex flex-col items-center gap-2 text-fg-muted">
                <ImageOff className="size-8" aria-hidden />
                <span className="text-sm">{t('sinImagen')}</span>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- imágenes públicas del bucket u object URL
              <img
                src={actual.url}
                alt={actual.alt || t('vista.altPorDefecto', { n: (indice ?? 0) + 1 })}
                onError={() => setFallida(true)}
                className="max-h-[70dvh] w-auto max-w-full object-contain"
              />
            ))}
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => mover(-1)}
                aria-label={t('vista.anterior')}
                className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-fg shadow-sm hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => mover(1)}
                aria-label={t('vista.siguiente')}
                className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-fg shadow-sm hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ChevronRight className="size-5" aria-hidden />
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
