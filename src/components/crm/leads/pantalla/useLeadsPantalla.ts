'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { ErrorApiCrm, EVENTO_CAMBIO_CRM, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { acumular, filtrosLeadsVacios, parametrosLeads, parametrosResumenLeads, TAMANO_PAGINA_LEADS, type FiltrosLeads, type LeadApi, type ResumenLeads } from './leadsPantallaLogica';

/**
 * Datos de la pantalla Leads: `GET /api/crm/leads` (paginado en el servidor)
 * y `GET /api/crm/leads/resumen` (KPI y leads sin colocar). En escritorio se
 * pagina; en móvil «Cargar 25 más» acumula. Se refresca con
 * `crm:entity-changed` (acciones rápidas, calificar, asignar, descartar).
 */
export function useLeadsPantalla(opciones: { acumularPaginas: boolean }) {
  const { timezone, getToday } = useFormatDate();
  const [filtros, setFiltrosState] = useState<FiltrosLeads>(filtrosLeadsVacios);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(TAMANO_PAGINA_LEADS);
  const [filas, setFilas] = useState<LeadApi[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<ErrorApiCrm | Error | null>(null);
  const [resumen, setResumen] = useState<ResumenLeads | null>(null);
  const [errorResumen, setErrorResumen] = useState<unknown>(null);
  const [recarga, setRecarga] = useState(0);
  const pedido = useRef<AbortController | null>(null);

  const setFiltros = useCallback((f: FiltrosLeads) => {
    setFiltrosState(f);
    setPagina(1);
  }, []);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    pedido.current?.abort();
    const control = new AbortController();
    pedido.current = control;
    setCargando(true);
    pedirCrm<LeadApi[]>(`/api/crm/leads?${parametrosLeads(filtros, pagina, tamano, timezone)}`, { signal: control.signal })
      .then(({ data, extra }) => {
        setFilas((prev) => (opciones.acumularPaginas ? acumular(prev, data, pagina) : data));
        setTotal(typeof extra.total === 'number' ? extra.total : data.length);
        setError(null);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
  }, [filtros, pagina, tamano, timezone, recarga, opciones.acumularPaginas]);

  useEffect(() => {
    let vivo = true;
    pedirCrm<ResumenLeads>(`/api/crm/leads/resumen?${parametrosResumenLeads(getToday(), timezone)}`)
      .then(({ data }) => vivo && (setResumen(data), setErrorResumen(null)))
      .catch((e: unknown) => vivo && setErrorResumen(e));
    return () => {
      vivo = false;
    };
  }, [getToday, timezone, recarga]);

  useEffect(() => {
    const oir = () => recargar();
    window.addEventListener(EVENTO_CAMBIO_CRM, oir);
    return () => window.removeEventListener(EVENTO_CAMBIO_CRM, oir);
  }, [recargar]);

  return {
    filtros,
    setFiltros,
    pagina,
    setPagina,
    tamano,
    setTamano: (n: number) => {
      setTamano(n);
      setPagina(1);
    },
    filas,
    total,
    cargando,
    error,
    errorStatus: error instanceof ErrorApiCrm ? error.status : null,
    resumen,
    errorResumen,
    recargar,
  };
}
