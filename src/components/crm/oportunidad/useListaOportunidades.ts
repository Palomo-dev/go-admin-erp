'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EVENTO_CAMBIO_CRM, pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { OrdenOportunidades } from './filtrosLogica';
import { unirPagina, type OportunidadApi, type ResumenApi } from './oportunidadLogica';

/**
 * Datos de la lista de Oportunidades y de la vista Tabla del Pipeline:
 * `GET /api/crm/opportunities` (paginado, filtrado y ordenado en el
 * servidor) y, si se pide, `GET /api/crm/opportunities/resumen` (conteos de
 * las pestañas y KPI). En móvil «Cargar más» acumula páginas. Se refresca
 * con `crm:entity-changed`.
 */
export type PestanaEstado = 'open' | 'won' | 'lost' | 'all';

export interface ConsultaLista {
  /** Filtros ya en query (sin paginación ni estado). */
  query: string;
  estado: PestanaEstado;
  orden: OrdenOportunidades;
  ascendente: boolean;
  /** Parámetros de periodo para el resumen; null = sin resumen. */
  periodo: string | null;
  acumular: boolean;
  activa?: boolean;
}

export function useListaOportunidades(c: ConsultaLista) {
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const [filas, setFilas] = useState<OportunidadApi[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [resumen, setResumen] = useState<ResumenApi | null>(null);
  const [errorResumen, setErrorResumen] = useState<unknown>(null);
  const [recarga, setRecarga] = useState(0);
  const pedido = useRef<AbortController | null>(null);
  const activa = c.activa ?? true;

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  // Cambiar de filtro, pestaña u orden vuelve a la página 1.
  useEffect(() => setPagina(1), [c.query, c.estado, c.orden, c.ascendente]);

  useEffect(() => {
    if (!activa) return;
    pedido.current?.abort();
    const control = new AbortController();
    pedido.current = control;
    setCargando(true);
    const p = new URLSearchParams(c.query);
    if (c.estado !== 'all') p.set('status', c.estado);
    p.set('sort', c.orden);
    p.set('dir', c.ascendente ? 'asc' : 'desc');
    p.set('page', String(pagina));
    p.set('limit', String(tamano));
    pedirCrm<OportunidadApi[]>(`/api/crm/opportunities?${p.toString()}`, { signal: control.signal })
      .then(({ data, extra }) => {
        setFilas((prev) => (c.acumular ? unirPagina(prev, data ?? [], pagina) : (data ?? [])));
        setTotal(typeof extra.total === 'number' ? extra.total : (data ?? []).length);
        setError(null);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e);
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
  }, [c.query, c.estado, c.orden, c.ascendente, c.acumular, pagina, tamano, recarga, activa]);

  useEffect(() => {
    if (!activa || c.periodo === null) return;
    let vivo = true;
    const p = new URLSearchParams(c.query);
    new URLSearchParams(c.periodo).forEach((v, k) => p.set(k, v));
    pedirCrm<ResumenApi>(`/api/crm/opportunities/resumen?${p.toString()}`)
      .then(({ data }) => vivo && (setResumen(data), setErrorResumen(null)))
      .catch((e: unknown) => vivo && setErrorResumen(e));
    return () => {
      vivo = false;
    };
  }, [c.query, c.periodo, recarga, activa]);

  useEffect(() => {
    const oir = () => recargar();
    window.addEventListener(EVENTO_CAMBIO_CRM, oir);
    return () => window.removeEventListener(EVENTO_CAMBIO_CRM, oir);
  }, [recargar]);

  return {
    filas,
    total,
    cargando,
    error,
    resumen,
    errorResumen,
    pagina,
    setPagina,
    tamano,
    setTamano: (n: number) => {
      setTamano(n);
      setPagina(1);
    },
    cargarMas: () => setPagina((n) => n + 1),
    recargar,
  };
}
