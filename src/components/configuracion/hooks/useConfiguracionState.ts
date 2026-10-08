'use client';

/**
 * Estado de Configuración en la URL (deep links estables):
 * `/app/configuracion?modulo=crm&seccion=agente-voz#desinteres`.
 *
 * - `modulo` y `seccion` eligen la sección; sin `seccion`, la primera del
 *   módulo. `?tab=` de CRM (enlaces anteriores) se traduce a su sección.
 * - El ajuste llega en `#ancla` o en `?ajuste=` (las redirecciones de servidor
 *   lo mandan así; ver `destinoRutaMovida`).
 * - `movido` lo ponen las redirecciones de las rutas viejas: la página muestra
 *   una vez «Esta configuración se movió aquí» y lo quita de la URL.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { getConfigModule, type ConfigModule } from '../config/configModulesRegistry';
import { resolverSeccion, type SeccionConfig } from '../config/configSectionsRegistry';

interface UseConfiguracionStateReturn {
  /** Módulo pedido en la URL (`null` en el índice del celular). */
  moduleId: string | null;
  currentModule: ConfigModule | undefined;
  seccion: SeccionConfig | undefined;
  /** Ancla del ajuste a resaltar. */
  ajuste: string | null;
  movido: string | null;
  setModule: (moduleId: string) => void;
  setSeccion: (seccion: SeccionConfig) => void;
  /** Vuelve al índice de módulos (celular). */
  limpiarModulo: () => void;
  quitarMovido: () => void;
}

export function useConfiguracionState(): UseConfiguracionStateReturn {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [hash, setHash] = useState<string | null>(null);

  useEffect(() => {
    const leer = () => setHash(window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : null);
    leer();
    window.addEventListener('hashchange', leer);
    return () => window.removeEventListener('hashchange', leer);
  }, [searchParams]);

  const moduleId = useMemo(() => {
    const param = searchParams?.get('modulo') ?? null;
    return param && getConfigModule(param) ? param : null;
  }, [searchParams]);

  const currentModule = useMemo(() => (moduleId ? getConfigModule(moduleId) : undefined), [moduleId]);
  const seccion = useMemo(
    () => (moduleId ? resolverSeccion(moduleId, searchParams?.get('seccion') ?? null, searchParams?.get('tab') ?? null) : undefined),
    [moduleId, searchParams],
  );
  const ajuste = searchParams?.get('ajuste') ?? hash;
  const movido = searchParams?.get('movido') ?? null;

  const navegar = useCallback(
    (cambios: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      for (const [k, v] of Object.entries(cambios)) {
        if (v === null) params.delete(k);
        else params.set(k, v);
      }
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const setModule = useCallback((id: string) => navegar({ modulo: id, seccion: null, tab: null, ajuste: null, movido: null }), [navegar]);
  const setSeccion = useCallback((s: SeccionConfig) => navegar({ modulo: s.modulo, seccion: s.seccion, tab: null, ajuste: null, movido: null }), [navegar]);
  const limpiarModulo = useCallback(() => navegar({ modulo: null, seccion: null, tab: null, ajuste: null, movido: null }), [navegar]);
  const quitarMovido = useCallback(() => navegar({ movido: null }), [navegar]);

  return { moduleId, currentModule, seccion, ajuste, movido, setModule, setSeccion, limpiarModulo, quitarMovido };
}
