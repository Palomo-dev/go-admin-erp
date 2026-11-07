'use client';

/**
 * Cajas abiertas como cuentas de dinero (`GET /api/tesoreria/cuentas`). El
 * saldo llega del servidor con el cierre ciego ya aplicado (`null` = oculto).
 */
import { useCallback, useEffect, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { CajaDinero } from '@/lib/finanzas/tesoreria/cuentasDinero';

export type EstadoCajas = 'cargando' | 'listo' | 'error' | 'sinPermiso';

export function useCajasDinero(activo = true) {
  const [cajas, setCajas] = useState<CajaDinero[]>([]);
  const [modo, setModo] = useState<'branch' | 'user'>('branch');
  const [estado, setEstado] = useState<EstadoCajas>('cargando');

  const recargar = useCallback(async () => {
    setEstado('cargando');
    try {
      const org = getOrganizationId();
      const r = await fetch('/api/tesoreria/cuentas', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: org ? { 'x-organization-id': String(org) } : undefined,
      });
      if (r.status === 403) {
        setCajas([]);
        setEstado('sinPermiso');
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { modo?: 'branch' | 'user'; cajas?: CajaDinero[] };
      setCajas(d.cajas ?? []);
      setModo(d.modo === 'user' ? 'user' : 'branch');
      setEstado('listo');
    } catch {
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    if (activo) void recargar();
  }, [activo, recargar]);

  return { cajas, modo, estado, recargar };
}
