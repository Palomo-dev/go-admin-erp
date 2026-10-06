'use client';

/**
 * Cupo del plan para las pantallas de Organización: una sola fuente
 * (`GET /api/me/plan`, vía `usePlanSesion`) y una sola regla
 * (`src/lib/organizacion/cupo.ts`). Antes Miembros, Invitaciones, Sucursales y
 * Plan sumaban el plan y los complementos cada una por su lado (P3-1) y daban
 * cifras distintas (P1-8).
 */
import { useMemo } from 'react';
import { usePlanSesion } from '@/components/shell/sesion/usePlanSesion';
import { cupoSucursales, cupoUsuarios, type Cupo } from '@/lib/organizacion/cupo';
import { estadoPlan, type EstadoPlan } from '@/lib/organizacion/plan';

export interface CupoPlan {
  cargando: boolean;
  error: boolean;
  usuarios: Cupo | null;
  sucursales: Cupo | null;
  estado: EstadoPlan;
  recargar: () => Promise<void>;
  datos: ReturnType<typeof usePlanSesion>['datos'];
}

export function useCupoPlan(): CupoPlan {
  const { datos, cargando, error, recargar } = usePlanSesion();
  return useMemo(() => {
    const u = datos?.uso.usuarios;
    const s = datos?.uso.sucursales;
    return {
      cargando: cargando || (!datos && !error),
      error,
      usuarios: u ? cupoUsuarios(u.actual, u.invitacionesVigentes ?? 0, u.maximo) : null,
      sucursales: s ? cupoSucursales(s.actual, s.maximo) : null,
      estado: estadoPlan(datos?.plan ?? null),
      recargar,
      datos,
    };
  }, [datos, cargando, error, recargar]);
}
