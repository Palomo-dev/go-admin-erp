'use client';

/**
 * Salud del sitio publicado (`GET /api/sitio-web/seo/salud`): sitemap, robots y
 * canónica en solo lectura. «Actualizar» pide una revisión fresca.
 */
import { useCallback, useEffect, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { SaludSeoRespuesta } from './saludSitio';

export interface SaludSeo {
  datos: SaludSeoRespuesta | null;
  cargando: boolean;
  actualizar: () => Promise<void>;
}

export function useSaludSeo(habilitado: boolean): SaludSeo {
  const [datos, setDatos] = useState<SaludSeoRespuesta | null>(null);
  const [cargando, setCargando] = useState(false);

  const leer = useCallback(async (fresco: boolean) => {
    setCargando(true);
    try {
      const org = getOrganizationId();
      const r = await fetch(`/api/sitio-web/seo/salud${fresco ? '?fresco=1' : ''}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: org > 0 ? { 'x-organization-id': String(org) } : undefined,
      });
      if (r.ok) setDatos((await r.json()) as SaludSeoRespuesta);
    } catch {
      // Sin salud no se bloquea la pantalla: los ítems quedan como «Falta».
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (habilitado) void leer(false);
  }, [habilitado, leer]);

  const actualizar = useCallback(() => leer(true), [leer]);
  return { datos, cargando, actualizar };
}
