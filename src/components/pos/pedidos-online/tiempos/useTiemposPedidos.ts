'use client';

/**
 * Lectura de los tiempos de los pedidos online (`GET /api/pos/pedidos-online-tiempos`) para el
 * diálogo de confirmar (lista y detalle) y la pestaña de Configuración. `ajustes = null` = la
 * organización nunca los guardó: el diálogo sigue con los tiempos de siempre.
 */
import * as React from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { normalizarAjustesTiempos, type AjustesTiemposPedidos } from '@/lib/pos/pedidosWeb/tiemposPedidos';

export interface SedeTiempos {
  id: number;
  nombre: string;
}

export interface LecturaTiempos {
  ajustes: AjustesTiemposPedidos | null;
  sedes: SedeTiempos[];
  tipoOrganizacion: number | null;
  puedeEditar: boolean;
}

export class TiemposError extends Error {
  constructor(public readonly codigo: string) {
    super(codigo);
  }
}

export async function pedirTiempos(init: RequestInit = {}): Promise<LecturaTiempos & { ok?: boolean }> {
  const h: Record<string, string> = {};
  if (init.body) h['Content-Type'] = 'application/json';
  const org = Number(getOrganizationId()) || null;
  if (org) h['x-organization-id'] = String(org);
  const r = await fetch('/api/pos/pedidos-online-tiempos', { credentials: 'same-origin', cache: 'no-store', ...init, headers: h });
  const cuerpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new TiemposError(typeof cuerpo.codigo === 'string' ? cuerpo.codigo : 'error');
  return {
    ajustes: cuerpo.ajustes ? normalizarAjustesTiempos(cuerpo.ajustes) : null,
    sedes: Array.isArray(cuerpo.sedes) ? (cuerpo.sedes as SedeTiempos[]) : [],
    tipoOrganizacion: typeof cuerpo.tipoOrganizacion === 'number' ? cuerpo.tipoOrganizacion : null,
    puedeEditar: cuerpo.puedeEditar === true,
    ok: cuerpo.ok === true,
  };
}

/** Tiempos guardados para el diálogo de confirmar. Un error de lectura = sin configuración. */
export function useTiemposPedidos(): { ajustes: AjustesTiemposPedidos | null; sedes: SedeTiempos[]; cargado: boolean } {
  const [estado, setEstado] = React.useState<{ ajustes: AjustesTiemposPedidos | null; sedes: SedeTiempos[]; cargado: boolean }>({ ajustes: null, sedes: [], cargado: false });
  React.useEffect(() => {
    let vivo = true;
    pedirTiempos()
      .then((r) => vivo && setEstado({ ajustes: r.ajustes, sedes: r.sedes, cargado: true }))
      .catch(() => vivo && setEstado({ ajustes: null, sedes: [], cargado: true }));
    return () => {
      vivo = false;
    };
  }, []);
  return estado;
}
