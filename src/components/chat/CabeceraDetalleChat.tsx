'use client';

/**
 * Cabecera de los detalles del Chat (Figma 91-chat-22/24/31/32/33): «←»,
 * ícono opcional (el del canal), migas «Chat › …», título con insignia,
 * subtítulo y acciones a la derecha.
 *
 * En celular la «←» y el título van en el MobileHeader del shell
 * (`useCabeceraMovil`); aquí la flecha propia existe solo desde lg y el resto
 * (insignia, subtítulo, acciones) sigue a la vista
 * (`src/__tests__/detalleMovil/dobleAtrasChat.test.tsx`).
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';

export interface CabeceraDetalleChatProps {
  titulo: string;
  volverA: string;
  /** Migas sobre el título («Chat › Canales»), de la más general a la más cercana. */
  migas?: readonly string[];
  icono?: ReactNode;
  badge?: ReactNode;
  subtitulo?: ReactNode;
  /** Subtítulo del MobileHeader (texto). */
  subtituloMovil?: string;
  acciones?: ReactNode;
  className?: string;
}

export function CabeceraDetalleChat({ titulo, volverA, migas, icono, badge, subtitulo, subtituloMovil, acciones, className }: CabeceraDetalleChatProps) {
  const t = useTranslations('chatModulo.comun');
  useCabeceraMovil({ modo: 'page', titulo, subtitulo: subtituloMovil ?? (typeof subtitulo === 'string' ? subtitulo : undefined), volverA });

  return (
    <header className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href={volverA}
          aria-label={t('volver')}
          className="hidden size-8 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:flex"
        >
          <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </Link>
        {icono}
        <div className="flex min-w-0 flex-col gap-0.5">
          {migas && migas.length > 0 && (
            <p className="hidden truncate text-xs text-fg-muted lg:block">{migas.join(' › ')}</p>
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold leading-7 text-fg">{titulo}</h1>
            {badge}
          </div>
          {subtitulo && <div className="text-[13px] leading-[18px] text-fg-secondary">{subtitulo}</div>}
        </div>
      </div>
      {acciones && <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}
