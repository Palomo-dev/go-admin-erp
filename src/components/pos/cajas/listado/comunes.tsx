'use client';

import { EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BranchBadge } from '@/components/kit';
import type { CashSession } from '../types';

/** Importe que el cierre ciego no deja ver (SISTEMA-BADGES: «Oculto», no «***»). */
export function Oculto() {
  return (
    <Badge tono="neutro" apariencia="suave" tamano="sm" icono={EyeOff}>
      Oculto
    </Badge>
  );
}

/** Sucursal de una caja: una sucursal o la caja global («Todas las sucursales»). */
export function SucursalCaja({ sesion }: { sesion: Pick<CashSession, 'branch_id' | 'branch_name'> }) {
  return sesion.branch_id === null ? (
    <BranchBadge alcance="todas" />
  ) : (
    <BranchBadge alcance="una" nombre={sesion.branch_name ?? `Sucursal #${sesion.branch_id}`} />
  );
}

export const MOTIVO_CIERRE_CIEGO = 'Cierre ciego activo: el detalle de la caja solo lo ve un administrador';

export type PestanaCajas = 'mi-caja' | 'abiertas' | 'historial';

export function esPestanaCajas(valor: string | null | undefined): valor is PestanaCajas {
  return valor === 'mi-caja' || valor === 'abiertas' || valor === 'historial';
}
