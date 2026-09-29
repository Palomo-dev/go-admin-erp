'use client';

import { useTranslations } from 'next-intl';
import { Layers } from 'lucide-react';
import type { TableWithSession } from './types';

/**
 * Cabecera de una zona en la cuadrícula de mesas (Figma `ZonaHeader`
 * `868:31867`): nombre y resumen «18 mesas · 6 libres · 2 por cobrar».
 * Solo presentación: el pliegue guardado de la zona queda para después.
 */
export interface ZonaHeaderProps {
  /** Nombre de la zona; `null` para las mesas sin zona. */
  zona: string | null;
  mesas: readonly TableWithSession[];
}

export function ZonaHeader({ zona, mesas }: ZonaHeaderProps) {
  const t = useTranslations('posMesas.zona');
  const libres = mesas.filter((m) => m.state === 'free' && !m.session).length;
  const porCobrar = mesas.filter((m) => m.session?.status === 'bill_requested').length;
  const partes = [t('mesas', { n: mesas.length }), t('libres', { n: libres })];
  if (porCobrar > 0) partes.push(t('porCobrar', { n: porCobrar }));

  return (
    <div className="mb-3 flex min-w-0 items-center gap-2">
      <Layers aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
      <h3 className="truncate text-base font-semibold text-fg">{zona ?? t('sinZona')}</h3>
      <span className="truncate text-[13px] text-fg-secondary">{partes.join(' · ')}</span>
    </div>
  );
}
