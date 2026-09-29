'use client';

import { useState, type ReactNode } from 'react';
import { ImageOff, Images } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { RowActionsMenu, StatusBadge, type AccionFila } from '@/components/kit';

/**
 * `ImageCard` de Figma (`580:278659`, Estado = default · seleccionada): foto
 * cuadrada con la casilla arriba a la izquierda y la visibilidad arriba a la
 * derecha; nombre, «peso · medidas» y, al pie, el uso como enlace («En 3
 * productos») o «Sin usar», con «⋮» siempre visible (en móvil no hay hover).
 *
 * El clic en la tarjeta abre el detalle; la casilla y el menú no lo disparan.
 */
export interface TarjetaImagenProps {
  url: string;
  nombre: string;
  alt: string;
  /** «412 KB · 1200 × 1200». */
  detalle?: string;
  /** Badge de la esquina (Pública · Privada · Principal). */
  insignia?: { etiqueta: string; tono: 'informacion' | 'neutro' | 'marca' };
  /** Pie izquierdo: enlace de uso o texto atenuado. */
  pie: ReactNode;
  acciones: readonly AccionFila[];
  seleccionada?: boolean;
  onSeleccionChange?: (v: boolean) => void;
  etiquetaSeleccion?: string;
  onAbrir: () => void;
  etiquetaAbrir: string;
}

export function TarjetaImagen({
  url,
  nombre,
  alt,
  detalle,
  insignia,
  pie,
  acciones,
  seleccionada,
  onSeleccionChange,
  etiquetaSeleccion,
  onAbrir,
  etiquetaAbrir,
}: TarjetaImagenProps) {
  const [fallo, setFallo] = useState(false);
  return (
    <article
      className={cn(
        'group relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-surface transition-shadow',
        seleccionada ? 'border-brand ring-1 ring-brand' : 'border-line hover:border-line-strong hover:shadow-sm',
      )}
    >
      <button
        type="button"
        onClick={onAbrir}
        aria-label={etiquetaAbrir}
        className="relative block aspect-[4/3] w-full overflow-hidden bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
      >
        {url && !fallo ? (
          // eslint-disable-next-line @next/next/no-img-element -- imágenes del storage con URL pública; next/image exigiría dominios por organización
          <img src={url} alt={alt} loading="lazy" onError={() => setFallo(true)} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-fg-muted">
            {fallo ? <ImageOff aria-hidden="true" className="size-6" strokeWidth={1.5} /> : <Images aria-hidden="true" className="size-6" strokeWidth={1.5} />}
          </span>
        )}
      </button>

      {onSeleccionChange && (
        <label className="absolute left-2 top-2 flex size-8 cursor-pointer items-center justify-center rounded-md">
          <input
            type="checkbox"
            checked={!!seleccionada}
            onChange={(e) => onSeleccionChange(e.target.checked)}
            aria-label={etiquetaSeleccion}
            className="size-[18px] cursor-pointer rounded border-line-strong bg-surface accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </label>
      )}
      {insignia && (
        <span className="pointer-events-none absolute right-2 top-2">
          <StatusBadge estado={insignia.etiqueta} tono={insignia.tono} tamano="sm" />
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 pb-2 pt-2.5">
        <p className="truncate text-sm font-medium text-fg" title={nombre}>
          {nombre}
        </p>
        {detalle && <p className="truncate text-xs text-fg-secondary">{detalle}</p>}
        <div className="mt-1.5 flex min-h-8 items-center justify-between gap-2">
          <div className="min-w-0 truncate text-[13px]">{pie}</div>
          <RowActionsMenu acciones={acciones} titulo={nombre} orientacion="vertical" tamano="sm" />
        </div>
      </div>
    </article>
  );
}
