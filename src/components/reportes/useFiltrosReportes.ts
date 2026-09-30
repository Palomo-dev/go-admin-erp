'use client';

/**
 * Filtros del centro de reportes leídos de la URL y escritos en ella
 * (`filtrosUrl.ts`). Los demás parámetros (`pestana`, `q`) se conservan: el
 * periodo elegido sigue igual al cambiar de pestaña o abrir un reporte.
 */
import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { aQuery, escribirFiltrosReportes, leerFiltrosReportes, type FiltrosReportes } from '@/lib/services/reportes/filtrosUrl';

const CLAVES_FILTRO = ['periodo', 'ref', 'desde', 'hasta', 'hi', 'hf', 'sucursal', 'comparar', 'vista'];

export function useFiltrosReportes() {
  const q = useSearchParams();
  const router = useRouter();
  const ruta = usePathname();
  const { getToday } = useFormatDate();
  const hoy = getToday();

  const filtros = useMemo(() => leerFiltrosReportes(q, hoy), [q, hoy]);

  /** Parámetros que no son filtros (pestaña, búsqueda) tal como están. */
  const otros = useCallback(() => {
    const r: Record<string, string> = {};
    q.forEach((v, k) => {
      if (!CLAVES_FILTRO.includes(k)) r[k] = v;
    });
    return r;
  }, [q]);

  const cambiar = useCallback(
    (parcial: Partial<FiltrosReportes>) => {
      const nuevo = { ...filtros, ...parcial };
      router.replace(`${ruta}${aQuery({ ...otros(), ...escribirFiltrosReportes(nuevo, hoy) })}`, { scroll: false });
    },
    [filtros, hoy, otros, router, ruta],
  );

  /** Cambia un parámetro que no es filtro (`pestana`, `q`); `null` lo quita. */
  const cambiarParametro = useCallback(
    (clave: string, valor: string | null) => {
      const r = { ...otros(), ...escribirFiltrosReportes(filtros, hoy) };
      if (valor === null || valor === '') delete r[clave];
      else r[clave] = valor;
      router.replace(`${ruta}${aQuery(r)}`, { scroll: false });
    },
    [filtros, hoy, otros, router, ruta],
  );

  /** Query de los filtros actuales (sin vista) para enlazar a otra pantalla del centro. */
  const queryFiltros = useCallback(
    (extra: Record<string, string> = {}) => aQuery({ ...escribirFiltrosReportes({ ...filtros, vista: null }, hoy), ...extra }),
    [filtros, hoy],
  );

  return { filtros, hoy, cambiar, cambiarParametro, queryFiltros, parametro: (k: string) => q.get(k) };
}
