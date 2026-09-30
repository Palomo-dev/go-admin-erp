'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { parametrosTimeline, type FiltrosTimeline } from '@/components/crm/kit/timelineFiltersLogica';
import { ErrorApiCrm, EVENTO_CAMBIO_CRM, pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { KpisActividades } from '@/lib/services/crm/actividadesOrgService';
import { filtrosPorDefecto, TAMANO_PAGINA_ACTIVIDADES, type EntradaFeed } from './actividadesPantallaLogica';

/**
 * Datos de Actividades: `GET /api/crm/activities` por cursor («Cargar 20
 * más» sin perder lo cargado) y `GET /api/crm/activities/resumen` (7 KPI).
 * Un cambio de filtro son 2 peticiones (antes, ~14 consultas desde el
 * navegador). Se refresca con `crm:entity-changed`.
 */
export function useActividadesPantalla() {
  const { timezone, getToday } = useFormatDate();
  const [filtros, setFiltros] = useState<FiltrosTimeline>(() => filtrosPorDefecto(getToday()));
  const [entradas, setEntradas] = useState<EntradaFeed[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [errorMas, setErrorMas] = useState<Error | null>(null);
  const [kpis, setKpis] = useState<KpisActividades | null>(null);
  const [recarga, setRecarga] = useState(0);
  const pedido = useRef<AbortController | null>(null);

  const consulta = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ ...parametrosTimeline(filtros, timezone), ...extra });
    return p.toString();
  }, [filtros, timezone]);

  useEffect(() => {
    pedido.current?.abort();
    const control = new AbortController();
    pedido.current = control;
    setCargando(true);
    setErrorMas(null);
    pedirCrm<EntradaFeed[]>(`/api/crm/activities?${consulta({ limit: String(TAMANO_PAGINA_ACTIVIDADES) })}`, { signal: control.signal })
      .then(({ data, extra }) => {
        setEntradas(data);
        setCursor((extra.next_cursor as string | null) ?? null);
        setTotal(typeof extra.total === 'number' ? extra.total : null);
        setError(null);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setEntradas([]);
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => !control.signal.aborted && setCargando(false));
    // Los KPI no dependen del chip de tipo (son el desglose por tipo).
    const kp = new URLSearchParams(parametrosTimeline({ ...filtros, tipo: 'todos' }, timezone)).toString();
    pedirCrm<KpisActividades>(`/api/crm/activities/resumen?${kp}`, { signal: control.signal })
      .then(({ data }) => setKpis(data))
      .catch(() => undefined);
    return () => control.abort();
  }, [consulta, filtros, timezone, recarga]);

  const cargarMas = useCallback(async () => {
    if (!cursor || cargandoMas) return;
    setCargandoMas(true);
    setErrorMas(null);
    try {
      const { data, extra } = await pedirCrm<EntradaFeed[]>(`/api/crm/activities?${consulta({ limit: String(TAMANO_PAGINA_ACTIVIDADES), cursor })}`);
      setEntradas((prev) => {
        const vistos = new Set(prev.map((e) => `${e.fuente}-${e.id}`));
        return [...prev, ...data.filter((e) => !vistos.has(`${e.fuente}-${e.id}`))];
      });
      setCursor((extra.next_cursor as string | null) ?? null);
    } catch (e) {
      setErrorMas(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setCargandoMas(false);
    }
  }, [cursor, cargandoMas, consulta]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  useEffect(() => {
    window.addEventListener(EVENTO_CAMBIO_CRM, recargar);
    return () => window.removeEventListener(EVENTO_CAMBIO_CRM, recargar);
  }, [recargar]);

  return {
    filtros,
    setFiltros,
    entradas,
    cursor,
    total,
    cargando,
    cargandoMas,
    error,
    errorMas,
    errorStatus: error instanceof ErrorApiCrm ? error.status : null,
    kpis,
    cargarMas,
    recargar,
    /** Tras editar o borrar: se actualiza lo cargado sin volver a la primera página. */
    reemplazar: (id: string, fuente: string, nueva: EntradaFeed | null) =>
      setEntradas((prev) => (nueva ? prev.map((e) => (e.id === id && e.fuente === fuente ? nueva : e)) : prev.filter((e) => !(e.id === id && e.fuente === fuente)))),
  };
}
