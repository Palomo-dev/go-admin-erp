'use client';

/**
 * `BadgeEstadoDevolucion` (Figma 680:406543): Procesada · Pendiente · Anulada,
 * sobre `StatusBadge` y la tabla única de tonos (`BADGE_ESTADO_DEVOLUCION`).
 */
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/kit';
import { BADGE_ESTADO_DEVOLUCION, estadoDevolucion } from '@/lib/pos/devoluciones/presentacionDevoluciones';

export function BadgeEstadoDevolucion({ estado, tamano = 'sm' }: { estado: string | null | undefined; tamano?: 'sm' | 'md' }) {
  const t = useTranslations('posDevoluciones.listado.estados');
  const e = estadoDevolucion(estado);
  return <StatusBadge estado={BADGE_ESTADO_DEVOLUCION[e]} etiqueta={t(e)} tamano={tamano} />;
}
