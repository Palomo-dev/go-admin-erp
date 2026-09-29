'use client';

import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge, type TamanoBadge } from '@/components/ui/badge';
import { metaOrigen } from '@/lib/inventario/origenesMovimientoStock';

/**
 * Origen de un movimiento de kardex (Figma `530:65022`, 24 orígenes del CHECK de
 * `stock_movements.source`). Etiqueta y tono salen del ÚNICO mapa
 * (`lib/inventario/origenesMovimientoStock.ts` → `META_ORIGEN`); ninguna pantalla
 * vuelve a tener el suyo.
 *
 * ```tsx
 * <BadgeOrigenMovimiento origen={mov.source} />
 * <BadgeOrigenMovimiento origen="adjustment" direccion={mov.direction} />  // con flecha ↙/↗
 * ```
 */
export interface BadgeOrigenMovimientoProps {
  origen: string | null | undefined;
  /** Muestra la flecha de entrada o salida (útil en orígenes de dos sentidos: ajuste, traslado). */
  direccion?: 'in' | 'out' | null;
  tamano?: TamanoBadge;
  className?: string;
}

export function BadgeOrigenMovimiento({ origen, direccion, tamano = 'sm', className }: BadgeOrigenMovimientoProps) {
  const t = useTranslations('inventario.origenes');
  const meta = metaOrigen(origen);
  const clave = meta && origen && t.has(origen) ? origen : 'desconocido';
  const icono = direccion === 'in' ? ArrowDownLeft : direccion === 'out' ? ArrowUpRight : undefined;
  return (
    <Badge
      tono={meta?.tono ?? 'neutro'}
      tamano={tamano}
      icono={icono}
      className={className}
      data-origen={origen ?? ''}
      title={meta ? undefined : origen ?? undefined}
    >
      {t(clave)}
    </Badge>
  );
}
