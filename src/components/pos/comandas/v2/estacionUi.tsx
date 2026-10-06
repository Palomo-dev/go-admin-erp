'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChefHat, Flame, Receipt, Snowflake, UtensilsCrossed, Wine, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { aspectoEstacion, type AspectoEstacion } from '@/lib/pos/cocina/tableroComandas';

/**
 * Piezas de estación del Figma (`EstacionChip` 952:31928 y el punto de color
 * de `PestanaEstacion` 952:31944). El color sale de los tonos del manual; el
 * nombre, de i18n (`posComandasV2.estaciones.<clave>`), y una clave
 * desconocida se muestra tal cual, neutra.
 */
const ICONOS: Record<AspectoEstacion['icono'], LucideIcon> = {
  flame: Flame,
  snowflake: Snowflake,
  wine: Wine,
  receipt: Receipt,
  utensils: UtensilsCrossed,
  'chef-hat': ChefHat,
};

/** Chip suave (texto oscuro sobre tinte) y punto de la pestaña, por tono. */
const TONOS: Record<AspectoEstacion['tono'], { chip: string; punto: string }> = {
  rojo: { chip: 'bg-danger-subtle text-danger-text', punto: 'bg-danger' },
  cian: { chip: 'bg-info-subtle text-info-text', punto: 'bg-info' },
  violeta: { chip: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300', punto: 'bg-violet-500' },
  pizarra: { chip: 'bg-subtle text-fg-secondary', punto: 'bg-fg-muted' },
};

export function iconoEstacion(clave: string | null | undefined): LucideIcon {
  return ICONOS[aspectoEstacion(clave).icono];
}

export function puntoEstacion(clave: string | null | undefined): string {
  return TONOS[aspectoEstacion(clave).tono].punto;
}

export function useNombreEstacion() {
  const t = useTranslations('posComandasV2.estaciones');
  return React.useCallback(
    (clave: string | null | undefined) => {
      const k = clave || 'all';
      return t.has(k) ? t(k) : k;
    },
    [t],
  );
}

export function EstacionChip({
  clave,
  tamano = 'sm',
  className,
}: {
  clave: string | null | undefined;
  tamano?: 'sm' | 'md';
  className?: string;
}) {
  const nombre = useNombreEstacion();
  const Icono = iconoEstacion(clave);
  const tono = TONOS[aspectoEstacion(clave).tono];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full font-medium',
        tamano === 'md' ? 'h-8 px-3 text-sm' : 'h-[22px] px-2 text-xs',
        tono.chip,
        className,
      )}
    >
      <Icono aria-hidden="true" className={tamano === 'md' ? 'size-4' : 'size-3.5'} strokeWidth={1.5} />
      {nombre(clave)}
    </span>
  );
}
