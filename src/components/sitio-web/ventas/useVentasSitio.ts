'use client';

/**
 * Hook ÚNICO de «Ventas en línea» (Figma B/10): lee `GET /api/sitio-web/ventas`
 * y aplica las dos escrituras del área (opciones del checkout y el interruptor
 * de reservas en la web). Cada escritura devuelve el tablero recalculado por
 * el servidor: el navegador no recalcula estados ni conteos.
 */
import { useCallback, useEffect, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { RespuestaVentas } from '@/lib/website/ventasSitio.server';
import type { CambiosCheckout } from './estadoVentas';

export type FalloVentas = 'error' | 'sin_permiso';

export const RUTA_API_VENTAS = '/api/sitio-web/ventas';

export class ErrorApiVentas extends Error {
  constructor(
    public readonly fallo: FalloVentas,
    mensaje: string,
    public readonly codigo: string | null = null,
  ) {
    super(mensaje);
    this.name = 'ErrorApiVentas';
  }
}

function cabeceras(json: boolean): HeadersInit {
  const org = getOrganizationId();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(org > 0 ? { 'x-organization-id': String(org) } : {}),
  };
}

/** fetch común del área: 401/403 → sin permiso; otro error → mensaje del servidor. */
export async function pedirJson<T>(url: string, init?: { method: 'PUT' | 'PATCH'; cuerpo: unknown }): Promise<T> {
  const r = await fetch(url, {
    method: init?.method ?? 'GET',
    credentials: 'same-origin',
    headers: cabeceras(!!init),
    body: init ? JSON.stringify(init.cuerpo) : undefined,
  });
  if (r.ok) return (await r.json()) as T;
  const cuerpo = (await r.json().catch(() => null)) as { error?: string; codigo?: string } | null;
  throw new ErrorApiVentas(r.status === 401 || r.status === 403 ? 'sin_permiso' : 'error', cuerpo?.error ?? 'Error inesperado', cuerpo?.codigo ?? null);
}

export interface VentasSitio {
  datos: RespuestaVentas | null;
  cargando: boolean;
  /** Recarga en segundo plano (botón Recargar, «Reintentar» de una tarjeta): no vuelve al esqueleto. */
  actualizando: boolean;
  fallo: FalloVentas | null;
  recargar: (silencioso?: boolean) => Promise<void>;
  guardarCheckout: (cambios: CambiosCheckout) => Promise<void>;
  alternarReservas: (activo: boolean) => Promise<void>;
}

export function useVentasSitio(): VentasSitio {
  const [datos, setDatos] = useState<RespuestaVentas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [fallo, setFallo] = useState<FalloVentas | null>(null);

  const recargar = useCallback(async (silencioso = false) => {
    if (silencioso) setActualizando(true);
    else setCargando(true);
    setFallo(null);
    try {
      setDatos(await pedirJson<RespuestaVentas>(RUTA_API_VENTAS));
    } catch (error) {
      if (!silencioso) setDatos(null);
      setFallo(error instanceof ErrorApiVentas ? error.fallo : 'error');
    } finally {
      setCargando(false);
      setActualizando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const guardarCheckout = useCallback(async (cambios: CambiosCheckout) => {
    setDatos(await pedirJson<RespuestaVentas>(`${RUTA_API_VENTAS}/checkout`, { method: 'PUT', cuerpo: cambios }));
  }, []);

  const alternarReservas = useCallback(async (activo: boolean) => {
    setDatos(await pedirJson<RespuestaVentas>(`${RUTA_API_VENTAS}/reservas`, { method: 'PUT', cuerpo: { activo } }));
  }, []);

  return { datos, cargando, actualizando, fallo, recargar, guardarCheckout, alternarReservas };
}
