'use client';

/**
 * Pestañas, vistas y registros activos guardados en la URL (ver
 * `parametroUrl.ts`). El valor se DERIVA de `useSearchParams`: no hay estado
 * propio que desincronizar, así «atrás» y «adelante» del navegador mueven la
 * pestaña sin más código.
 *
 * ```tsx
 * const [estado, setEstado] = useOpcionUrl('estado', ['open', 'won', 'lost', 'all'] as const, 'open');
 * <TabBar id="lista" valor={estado} onValorChange={setEstado} … />
 * ```
 *
 * Cambiar de pestaña AGREGA una entrada al historial (`push`): es navegación
 * de la persona entre secciones, y «atrás» debe volver a la anterior. Se puede
 * pedir `replace` para cambios que no deben dejar rastro (p. ej. limpiar un id
 * que ya no existe).
 */
import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { escribirParametrosUrl, leerOpcionUrl, urlConParametros } from './parametroUrl';

export type HistorialUrl = 'push' | 'replace';

export function useParametrosUrl() {
  const router = useRouter();
  // Con src/pages en el repo estos hooks devuelven `| null` (ver useListadoServidor).
  const ruta = usePathname() ?? '';
  const params = useSearchParams();
  const actuales = params?.toString() ?? '';

  const leer = useCallback((clave: string) => new URLSearchParams(actuales).get(clave), [actuales]);

  const fijar = useCallback(
    (cambios: Readonly<Record<string, string | null>>, historial: HistorialUrl = 'push') => {
      const siguiente = escribirParametrosUrl(actuales, cambios);
      if (siguiente.toString() === actuales) return;
      const url = urlConParametros(ruta, siguiente);
      if (historial === 'push') router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [actuales, ruta, router],
  );

  return { leer, fijar };
}

/** Una opción de una lista cerrada (pestaña, vista). El valor por defecto no se escribe en la URL. */
export function useOpcionUrl<V extends string>(
  clave: string,
  valores: readonly V[],
  porDefecto: V,
  historial: HistorialUrl = 'push',
): [V, (valor: V) => void] {
  const { leer, fijar } = useParametrosUrl();
  const valor = leerOpcionUrl({ get: leer }, clave, valores, porDefecto);
  const cambiar = useCallback(
    (v: V) => fijar({ [clave]: v === porDefecto ? null : v }, historial),
    [clave, fijar, historial, porDefecto],
  );
  return [valor, cambiar];
}
