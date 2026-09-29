'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useEsEscritorio } from './useEsEscritorio';
import { useKitT } from './useIdiomaKit';

/**
 * Hoja de detalle de una fila (Figma `HojaDetalleEncabezado` 959:168240 y
 * 959:168241): panel lateral derecho en escritorio y tableta, hoja inferior en
 * móvil. Cabecera con título, insignia de estado + subtítulo y «×»; cuerpo con
 * scroll; pie fijo con las acciones del registro. La usan las sub-pestañas de
 * «Producción» del detalle de producto (orden, versiones de receta, traslado).
 *
 * A diferencia de `PanelAdaptable` (diálogo centrado), la hoja deja ver la
 * tabla de la que salió: el foco vuelve a la fila al cerrar (Radix).
 */
export interface HojaDetalleProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  titulo: string;
  /** Insignia de estado junto al subtítulo («En proceso», «v3 activa»). */
  insignia?: ReactNode;
  subtitulo?: ReactNode;
  children: ReactNode;
  /** Acciones del registro, fijas abajo (en móvil ocupan el ancho). */
  pie?: ReactNode;
  /** Ancho del panel en escritorio. */
  ancho?: 480 | 560 | 640;
  /** Bloquea el cierre mientras una acción está en curso. */
  ocupado?: boolean;
  className?: string;
}

const ANCHO: Record<NonNullable<HojaDetalleProps['ancho']>, string> = {
  480: 'sm:max-w-[480px]',
  560: 'sm:max-w-[560px]',
  640: 'sm:max-w-[640px]',
};

export function HojaDetalle({ abierto, onAbiertoChange, titulo, insignia, subtitulo, children, pie, ancho = 480, ocupado, className }: HojaDetalleProps) {
  const t = useKitT();
  const escritorio = useEsEscritorio();
  return (
    <Sheet open={abierto} onOpenChange={(a) => !ocupado && onAbiertoChange(a)}>
      <SheetContent
        side={escritorio ? 'right' : 'bottom'}
        hideCloseButton
        className={cn(
          'flex flex-col gap-0 bg-surface p-0',
          escritorio ? cn('w-full', ANCHO[ancho]) : 'max-h-[90dvh] rounded-t-2xl',
          className,
        )}
      >
        {!escritorio && <span aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong" />}
        <div className="flex items-start gap-3 border-b border-line px-5 pb-4 pt-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <SheetTitle className="text-lg font-semibold leading-6 text-fg">{titulo}</SheetTitle>
            {insignia || subtitulo ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {insignia}
                {subtitulo && <SheetDescription className="min-w-0 truncate text-sm text-fg-secondary">{subtitulo}</SheetDescription>}
              </div>
            ) : (
              <SheetDescription className="sr-only">{titulo}</SheetDescription>
            )}
          </div>
          <button
            type="button"
            aria-label={t('comun.cerrar')}
            disabled={ocupado}
            onClick={() => onAbiertoChange(false)}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
          >
            <X aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {pie && (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-line px-5 py-3 sm:flex-row sm:items-center sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
            {pie}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
