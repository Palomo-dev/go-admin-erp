'use client';

/**
 * Personas y métodos de pago de los filtros de los reportes de ventas
 * (`GET /api/reportes/opciones-ventas`). Una sola petición por organización
 * aunque varias barras los pidan a la vez; un fallo no se queda en caché.
 * Solo se pide si el reporte abierto declara «Persona» o «Método de pago».
 */
import { useEffect, useState } from 'react';
import { clienteReportes } from '@/lib/services/reportes/clienteReportes';
import type { OpcionesVentas } from '@/lib/services/reportes/opcionesVentas.server';

const VACIAS: OpcionesVentas = { personas: [], metodos: [] };
const porOrg = new Map<number, Promise<OpcionesVentas>>();

function opcionesDe(orgId: number): Promise<OpcionesVentas> {
  let p = porOrg.get(orgId);
  if (!p) {
    p = clienteReportes.opcionesVentas().catch((e: unknown) => {
      porOrg.delete(orgId);
      console.warn('[reportes] no se leyeron las opciones de ventas', e);
      return VACIAS;
    });
    porOrg.set(orgId, p);
  }
  return p;
}

export function useOpcionesVentas(orgId: number | null, activo: boolean): { opciones: OpcionesVentas; cargando: boolean } {
  const [estado, setEstado] = useState<{ orgId: number | null; opciones: OpcionesVentas }>({ orgId: null, opciones: VACIAS });

  useEffect(() => {
    if (!orgId || !activo) return;
    let vivo = true;
    void opcionesDe(orgId).then((opciones) => {
      if (vivo) setEstado({ orgId, opciones });
    });
    return () => {
      vivo = false;
    };
  }, [orgId, activo]);

  const vigente = estado.orgId === orgId;
  return { opciones: vigente ? estado.opciones : VACIAS, cargando: activo && !!orgId && !vigente };
}
