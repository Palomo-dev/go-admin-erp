'use client';

/**
 * Lectura del Resumen del sitio (`GET /api/sitio-web/resumen`): UNA llamada
 * para tarjeta, lista de lanzamiento, KPIs, alertas y cambios. La organización
 * la resuelve el servidor desde la sesión; la cabecera solo dice cuál es la
 * activa (el servidor la valida contra la membresía).
 */
import { useCallback, useEffect, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { ResumenSitioRespuesta } from '@/lib/website/resumenSitio';

export type FalloResumen = 'error' | 'sin_permiso';

export interface ResumenSitio {
  datos: ResumenSitioRespuesta | null;
  cargando: boolean;
  fallo: FalloResumen | null;
  recargar: () => Promise<void>;
}

export const RUTA_API_RESUMEN = '/api/sitio-web/resumen';

export async function pedirResumen(): Promise<ResumenSitioRespuesta> {
  const org = getOrganizationId();
  const respuesta = await fetch(RUTA_API_RESUMEN, {
    credentials: 'same-origin',
    headers: org > 0 ? { 'x-organization-id': String(org) } : undefined,
  });
  if (respuesta.status === 401 || respuesta.status === 403) throw new ErrorResumen('sin_permiso');
  if (!respuesta.ok) throw new ErrorResumen('error');
  return (await respuesta.json()) as ResumenSitioRespuesta;
}

export class ErrorResumen extends Error {
  constructor(public readonly fallo: FalloResumen) {
    super(fallo);
    this.name = 'ErrorResumen';
  }
}

export function useResumenSitio(): ResumenSitio {
  const [datos, setDatos] = useState<ResumenSitioRespuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState<FalloResumen | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setFallo(null);
    try {
      setDatos(await pedirResumen());
    } catch (error) {
      setFallo(error instanceof ErrorResumen ? error.fallo : 'error');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { datos, cargando, fallo, recargar };
}
