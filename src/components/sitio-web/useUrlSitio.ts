'use client';

/**
 * URL pública del sitio de la organización: subdominio (`organizations`) y
 * dominio propio principal verificado (`organization_domains`), resueltos con
 * `hostSitio`. Lo usan el Resumen del módulo, `useAjustesSitio` y la cabecera
 * del menú móvil (Figma 01c), así que no hay una segunda consulta ni una
 * segunda regla del dominio.
 *
 * Se cachea por organización durante la sesión de la pestaña (el menú móvil se
 * abre y se cierra muchas veces); `recargar()` vuelve a consultar.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { domainService } from '@/lib/services/domainService';
import { hostSitio } from './rutasSitioWeb';

export interface UrlSitio {
  subdominio: string | null;
  /** `tu-marca.goadmin.io` o el dominio propio; `null` si no hay ninguno. */
  host: string | null;
  /** `https://<host>`; `null` si no hay host. */
  url: string | null;
  cargando: boolean;
  recargar: () => Promise<void>;
}

interface Datos {
  subdominio: string | null;
  host: string | null;
}

const cache = new Map<number, Promise<Datos>>();

async function consultar(organizationId: number): Promise<Datos> {
  const [org, dominios] = await Promise.all([
    supabase.from('organizations').select('subdomain').eq('id', organizationId).single(),
    domainService.getDomains(organizationId).catch((error: unknown) => {
      console.error('Error cargando los dominios del sitio:', error);
      return [];
    }),
  ]);
  if (org.error) console.error('Error cargando el subdominio:', org.error);
  const subdominio = (org.data?.subdomain as string | null | undefined) || null;
  return { subdominio, host: hostSitio(dominios, subdominio) };
}

function leer(organizationId: number, forzar: boolean): Promise<Datos> {
  const enCache = cache.get(organizationId);
  if (enCache && !forzar) return enCache;
  const nueva = consultar(organizationId).catch((error: unknown) => {
    cache.delete(organizationId);
    throw error;
  });
  cache.set(organizationId, nueva);
  return nueva;
}

export function useUrlSitio(organizationId: number | null | undefined): UrlSitio {
  const [datos, setDatos] = useState<Datos>({ subdominio: null, host: null });
  const [cargando, setCargando] = useState(!!organizationId);

  const cargar = useCallback(
    async (forzar: boolean) => {
      if (!organizationId) return;
      setCargando(true);
      try {
        setDatos(await leer(organizationId, forzar));
      } catch (error) {
        console.error('Error cargando la URL del sitio:', error);
      } finally {
        setCargando(false);
      }
    },
    [organizationId]
  );

  useEffect(() => {
    void cargar(false);
  }, [cargar]);

  const recargar = useCallback(() => cargar(true), [cargar]);

  return { ...datos, url: datos.host ? `https://${datos.host}` : null, cargando, recargar };
}
