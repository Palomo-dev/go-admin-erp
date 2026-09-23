'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BranchBadge } from '@/components/kit';
import { partesHaceCuanto } from '../historialCajas';
import type { CashSession } from '../types';

/** Importe que el cierre ciego no deja ver (SISTEMA-BADGES: «Oculto», no «***»). */
export function Oculto() {
  const t = useTranslations('cajas.listado');
  return (
    <Badge tono="neutro" apariencia="suave" tamano="sm" icono={EyeOff}>
      {t('oculto')}
    </Badge>
  );
}

/** Sucursal de una caja: una sucursal o la caja global («Todas las sucursales»). */
export function SucursalCaja({ sesion }: { sesion: Pick<CashSession, 'branch_id' | 'branch_name'> }) {
  const t = useTranslations('cajas.listado');
  return sesion.branch_id === null ? (
    <BranchBadge alcance="todas" />
  ) : (
    <BranchBadge alcance="una" nombre={sesion.branch_name ?? t('sucursalNumero', { id: sesion.branch_id })} />
  );
}

/** «hace 3 h 20 min» en el idioma activo (`partesHaceCuanto` + `cajas.listado.hace`). */
export function useHaceCuanto(): (desde: string | Date) => string {
  const t = useTranslations('cajas.listado');
  return useCallback(
    (desde: string | Date) => {
      const p = partesHaceCuanto(desde);
      return t(`hace.${p.clave}`, p.valores);
    },
    [t],
  );
}

export type PestanaCajas = 'mi-caja' | 'abiertas' | 'historial';

export function esPestanaCajas(valor: string | null | undefined): valor is PestanaCajas {
  return valor === 'mi-caja' || valor === 'abiertas' || valor === 'historial';
}
