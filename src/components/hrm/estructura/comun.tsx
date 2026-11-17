'use client';

/**
 * Piezas compartidas de Recursos humanos › Estructura (áreas, cargos y plazas):
 * lectura por las rutas del servidor (`/api/hrm/estructura/**`, la
 * organización sale de la sesión), la insignia de plazas y los textos de
 * error de las RPC.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { estadoPlaza } from '@/lib/hrm/estructura/logica';

export const RUTA_HRM = '/app/hrm/empleados';
export const RUTA_AREAS = '/app/hrm/areas';
export const RUTA_CARGOS = '/app/hrm/cargos';
export const RUTA_PLAZAS = '/app/hrm/plazas';

export class ErrorEstructura extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string,
    /** Datos extra de la respuesta de error (p. ej. la sede de una etiqueta NFC de otra sede). */
    public readonly datos?: Record<string, unknown> | null
  ) {
    super(codigo);
  }
}

export async function pedir<T>(url: string, init?: { metodo?: 'GET' | 'POST' | 'PUT' | 'DELETE'; cuerpo?: unknown }): Promise<T> {
  const r = await fetch(url, {
    method: init?.metodo ?? 'GET',
    headers: init?.cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init?.cuerpo === undefined ? undefined : JSON.stringify(init.cuerpo),
    cache: 'no-store',
  });
  const datos = (await r.json().catch(() => null)) as (T & { code?: string }) | null;
  if (!r.ok) throw new ErrorEstructura(r.status, datos?.code ?? 'error_hrm', datos as Record<string, unknown> | null);
  return datos as T;
}

export type Carga<T> =
  | { estado: 'cargando' }
  | { estado: 'error'; codigo: string }
  | { estado: 'sinPermiso' }
  | { estado: 'noExiste' }
  | { estado: 'listo'; datos: T };

/** Carga con reintento: 403 es «sin permiso» y 404 «no existe», no «error». */
export function useCarga<T>(url: string | null): { carga: Carga<T>; recargar: () => Promise<void> } {
  const [carga, setCarga] = useState<Carga<T>>({ estado: 'cargando' });
  const actual = useRef(url);
  actual.current = url;
  const recargar = useCallback(async () => {
    if (!url) return;
    try {
      const datos = await pedir<T>(url);
      if (actual.current === url) setCarga({ estado: 'listo', datos });
    } catch (e) {
      if (actual.current !== url) return;
      if (e instanceof ErrorEstructura && e.status === 403) setCarga({ estado: 'sinPermiso' });
      else if (e instanceof ErrorEstructura && e.status === 404) setCarga({ estado: 'noExiste' });
      else setCarga({ estado: 'error', codigo: e instanceof ErrorEstructura ? e.codigo : 'error_hrm' });
    }
  }, [url]);
  useEffect(() => {
    setCarga((c) => (c.estado === 'listo' ? c : { estado: 'cargando' }));
    void recargar();
  }, [recargar]);
  return { carga, recargar };
}

/** Pesos sin decimales en la moneda de la organización. */
export function useFormatoMoneda(): (v: number | null | undefined) => string {
  const moneda = useMonedaOrganizacion();
  return useMemo(() => {
    const f = crearFormateadorMoneda(moneda, { decimals: 0 });
    return (v: number | null | undefined) => (v === null || v === undefined ? '—' : f(v));
  }, [moneda]);
}

/** Texto del error que devolvió la base, con respaldo genérico. */
export function useMensajeError(): (e: unknown) => string {
  const t = useTranslations('hrmEstructura.errores');
  return useCallback(
    (e: unknown) => {
      const codigo = e instanceof ErrorEstructura ? e.codigo : 'error_hrm';
      return t.has(codigo) ? t(codigo) : t('error_hrm');
    },
    [t]
  );
}

/** «1 vacante», «Completa», «1 sobre lo aprobado» o «Sin presupuesto». */
export function BadgePlaza({ aprobadas, ocupadas, tamano = 'sm' }: { aprobadas: number | null; ocupadas: number; tamano?: 'sm' | 'md' }) {
  const t = useTranslations('hrmEstructura.plazas.estado');
  const e = estadoPlaza(aprobadas, ocupadas);
  if (e.tipo === 'completa') return <Badge tono="exito" tamano={tamano}>{t('completa')}</Badge>;
  if (e.tipo === 'vacantes') return <Badge tono="advertencia" tamano={tamano}>{t('vacantes', { n: e.n })}</Badge>;
  if (e.tipo === 'sobre') return <Badge tono="peligro" tamano={tamano}>{t('sobre', { n: e.n })}</Badge>;
  return <Badge tono="neutro" tamano={tamano}>{t('sinPresupuesto')}</Badge>;
}

/** Nombre del nivel del cargo: «2 · Operativo calificado». */
export function useNivel(): (n: number | null | undefined) => string {
  const t = useTranslations('hrmEstructura.niveles');
  return useCallback((n) => (n ? `${n} · ${t(String(n))}` : '—'), [t]);
}
