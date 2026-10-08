'use client';

/**
 * Tarjeta de un ajuste dentro de una sección de Configuración (Figma «10.
 * Configuración unificada»): «Qué hace» arriba, las opciones del componente
 * que ya existía debajo, y el pie con quién y cuándo cuando hay datos.
 *
 * El `id` es el ancla del deep link (`#numeros-prueba`): al llegar por él la
 * tarjeta se resalta (`data-resaltado`, ver `useResaltarAncla`).
 */
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { History } from 'lucide-react';
import { cn } from '@/utils/Utils';

export const CLASES_ANCLA =
  'scroll-mt-24 rounded-xl outline-none transition-shadow motion-reduce:transition-none data-[resaltado=true]:ring-2 data-[resaltado=true]:ring-brand data-[resaltado=true]:ring-offset-2 data-[resaltado=true]:ring-offset-canvas';

interface Props {
  id: string;
  queHace?: string;
  /** Quién y cuándo lo cambió, ya formateado; sin datos no se pinta. */
  pie?: string | null;
  children: ReactNode;
  className?: string;
}

export function TarjetaAjuste({ id, queHace, pie, children, className }: Props) {
  const t = useTranslations('configuracionUnificada');
  return (
    <section id={id} className={cn(CLASES_ANCLA, 'flex flex-col gap-4 border border-line bg-surface p-4 md:px-6 md:py-5', className)}>
      {queHace && (
        <div className="rounded-lg bg-subtle px-3 py-2.5">
          <p className="text-xs font-medium text-fg-muted">{t('queHace')}</p>
          <p className="text-sm text-fg-secondary">{queHace}</p>
        </div>
      )}
      {children}
      {pie && (
        <p className="flex items-center gap-2 border-t border-line pt-3 text-xs text-fg-muted">
          <History aria-hidden="true" className="size-3.5 shrink-0" />
          {pie}
        </p>
      )}
    </section>
  );
}

/** Ancla sin tarjeta, para un ajuste que ya es una tarjeta (la del desinterés). */
export function AnclaAjuste({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} className={cn(CLASES_ANCLA, 'max-w-3xl')}>
      {children}
    </div>
  );
}
