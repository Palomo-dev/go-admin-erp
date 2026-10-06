'use client';

/**
 * Píxeles tipados del sitio (`/api/sitio-web/analitica/pixeles`, Figma B/09-01
 * «Píxeles y medición»): leer, conectar o quitar un ID y probar si el sitio
 * publicado lo carga.
 */
import { useCallback, useEffect, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { EstadoPixel, PixelesRespuesta, PruebaPixelRespuesta, TipoPixel } from './saludSitio';

export type { EstadoPixel, PruebaPixelRespuesta };

export const RUTA_API_PIXELES = '/api/sitio-web/analitica/pixeles';

function cabeceras(json = false): HeadersInit {
  const org = getOrganizationId();
  return { ...(org > 0 ? { 'x-organization-id': String(org) } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) };
}

export interface Pixeles {
  datos: PixelesRespuesta | null;
  cargando: boolean;
  error: boolean;
  guardar: (tipo: TipoPixel, id: string | null) => Promise<'ok' | 'invalido' | 'pendiente' | 'error'>;
  probar: (tipo: TipoPixel) => Promise<PruebaPixelRespuesta | null>;
  recargar: () => Promise<void>;
}

export function usePixeles(habilitado = true): Pixeles {
  const [datos, setDatos] = useState<PixelesRespuesta | null>(null);
  const [cargando, setCargando] = useState(habilitado);
  const [error, setError] = useState(false);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      const r = await fetch(RUTA_API_PIXELES, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() });
      if (!r.ok) throw new Error(String(r.status));
      setDatos((await r.json()) as PixelesRespuesta);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (habilitado) void recargar();
  }, [habilitado, recargar]);

  const guardar = useCallback(async (tipo: TipoPixel, id: string | null) => {
    try {
      const r = await fetch(RUTA_API_PIXELES, { method: 'PUT', credentials: 'same-origin', headers: cabeceras(true), body: JSON.stringify({ tipo, id }) });
      const cuerpo = (await r.json().catch(() => null)) as (PixelesRespuesta & { codigo?: string }) | null;
      if (r.ok && cuerpo) {
        setDatos(cuerpo);
        return 'ok' as const;
      }
      if (cuerpo?.codigo === 'peticion_invalida') return 'invalido' as const;
      if (cuerpo?.codigo === 'pendiente_migracion') return 'pendiente' as const;
      return 'error' as const;
    } catch {
      return 'error' as const;
    }
  }, []);

  const probar = useCallback(async (tipo: TipoPixel) => {
    try {
      const r = await fetch(`${RUTA_API_PIXELES}/${tipo}/prueba`, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() });
      if (!r.ok) return null;
      return (await r.json()) as PruebaPixelRespuesta;
    } catch {
      return null;
    }
  }, []);

  return { datos, cargando, error, guardar, probar, recargar };
}

