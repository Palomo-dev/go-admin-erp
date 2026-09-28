'use client';

/**
 * Plan de la organización activa y su uso (`GET /api/me/plan`). Se pide al
 * abrir el panel de sesión y se reutiliza mientras no cambie la organización:
 * el bloque del sidebar solo necesita el nombre del plan, que llega en la
 * misma respuesta.
 */
import { useCallback, useEffect, useState } from 'react';

export interface PlanSesion {
  plan: {
    nombre: string | null;
    codigo: string | null;
    estado: 'prueba' | 'activo' | 'vencido' | 'cancelado' | 'sin_plan';
    diasPruebaRestantes: number | null;
    diasPruebaTotales: number | null;
    precio: number | null;
    moneda: string;
    periodo: 'mensual' | 'anual';
    proximoCobro: string | null;
    cancelaAlFinal: boolean;
  } | null;
  uso: {
    usuarios: { actual: number; maximo: number | null };
    sucursales: { actual: number; maximo: number | null };
    creditosIa: { restantesPlan: number; comprados: number; cupoMensual: number | null; seRenuevan: string | null };
  };
}

let cache: PlanSesion | null = null;
// Una sola petición en vuelo: la piden a la vez el bloque de sesión, el
// selector de organización y el de sucursal.
let enVuelo: Promise<PlanSesion> | null = null;

function pedir(): Promise<PlanSesion> {
  if (!enVuelo) {
    enVuelo = fetch('/api/me/plan', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`plan ${r.status}`);
        cache = (await r.json()) as PlanSesion;
        return cache;
      })
      .finally(() => {
        enVuelo = null;
      });
  }
  return enVuelo;
}

export function usePlanSesion() {
  const [datos, setDatos] = useState<PlanSesion | null>(cache);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      setDatos(await pedir());
    } catch (e) {
      console.warn('[usePlanSesion] no se pudo cargar el plan', e);
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!cache) void cargar();
    const alCambiarOrg = () => {
      cache = null;
      setDatos(null);
      void cargar();
    };
    window.addEventListener('organization-changed', alCambiarOrg);
    return () => window.removeEventListener('organization-changed', alCambiarOrg);
  }, [cargar]);

  return { datos, cargando, error, recargar: cargar };
}
