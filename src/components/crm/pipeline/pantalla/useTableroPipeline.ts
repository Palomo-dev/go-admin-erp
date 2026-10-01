'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EVENTO_CAMBIO_CRM, pedirCrm, type DetalleCambioCrm } from '@/components/crm/acciones/apiCrm';
import { COLUMNA_VACIA, moverEnTablero, unirPagina, type EtapaApi, type OportunidadApi, type ResumenApi, type Tablero } from '@/components/crm/oportunidad/oportunidadLogica';
import { recargaDeTablero } from './tableroPipelineLogica';

/**
 * Datos del kanban (CRM ola 3B, plan §4.2): la cabecera del tablero
 * (`GET /api/crm/pipelines/[id]/board`: etapas, totales por columna y KPI) y
 * las tarjetas POR COLUMNA, paginadas (`GET /api/crm/opportunities?stage_id=…`,
 * 20 por página, «Cargar más» por columna): en organizaciones grandes nunca
 * se trae todo. Mover es optimista (`mover`) con reversión (`revertir`).
 * Mover, ganar o perder refresca solo los totales: recargar el tablero
 * encendía el loader y vaciaba las columnas.
 */
export const POR_COLUMNA = 20;

export interface CabeceraTablero {
  pipeline: { id: string; name: string; pipeline_type: string | null; is_default: boolean | null };
  etapas: EtapaApi[];
  resumen: ResumenApi;
}

export function useTableroPipeline(o: { pipelineId: string | null; query: string; periodo: string }) {
  const [cabecera, setCabecera] = useState<CabeceraTablero | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [tablero, setTablero] = useState<Tablero>({});
  const [recarga, setRecarga] = useState(0);
  const snapshots = useRef(new Map<string, Tablero>());
  const tableroRef = useRef(tablero);
  tableroRef.current = tablero;
  /** Una carga completa invalida el refresco de totales que todavía vaya en vuelo. */
  const epoca = useRef(0);
  const cabeceraAbort = useRef<AbortController | null>(null);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  /** Totales y KPI, sin apagar las tarjetas que ya se movieron. */
  const refrescarCabecera = useCallback(async () => {
    if (!o.pipelineId) return;
    cabeceraAbort.current?.abort();
    const control = new AbortController();
    cabeceraAbort.current = control;
    const marca = epoca.current;
    try {
      const p = new URLSearchParams(o.query);
      new URLSearchParams(o.periodo).forEach((v, k) => p.set(k, v));
      const { data } = await pedirCrm<CabeceraTablero>(`/api/crm/pipelines/${o.pipelineId}/board?${p.toString()}`, { signal: control.signal });
      if (control.signal.aborted || marca !== epoca.current || !data) return;
      setCabecera(data);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      // La tarjeta ya está en su columna. Los totales se corrigen en la próxima carga.
    }
  }, [o.pipelineId, o.query, o.periodo]);

  const cargarColumna = useCallback(
    async (etapaId: string, pagina: number, signal?: AbortSignal) => {
      if (!o.pipelineId) return;
      setTablero((t) => ({ ...t, [etapaId]: { ...(t[etapaId] ?? COLUMNA_VACIA), cargando: true, error: false } }));
      try {
        const p = new URLSearchParams(o.query);
        p.set('pipeline_id', o.pipelineId);
        p.set('stage_id', etapaId);
        p.set('page', String(pagina));
        p.set('limit', String(POR_COLUMNA));
        p.set('sort', 'proximo');
        p.set('dir', 'asc');
        const { data, extra } = await pedirCrm<OportunidadApi[]>(`/api/crm/opportunities?${p.toString()}`, { signal });
        setTablero((t) => {
          const previa = t[etapaId] ?? COLUMNA_VACIA;
          return { ...t, [etapaId]: { filas: unirPagina(previa.filas, data ?? [], pagina), total: typeof extra.total === 'number' ? extra.total : (data ?? []).length, pagina, cargando: false, error: false } };
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setTablero((t) => ({ ...t, [etapaId]: { ...(t[etapaId] ?? COLUMNA_VACIA), cargando: false, error: true } }));
      }
    },
    [o.pipelineId, o.query],
  );

  useEffect(() => {
    epoca.current += 1;
    const marca = epoca.current;
    cabeceraAbort.current?.abort();
    if (!o.pipelineId) {
      setCabecera(null);
      setCargando(false);
      return;
    }
    const control = new AbortController();
    setCargando(true);
    const p = new URLSearchParams(o.query);
    new URLSearchParams(o.periodo).forEach((v, k) => p.set(k, v));
    pedirCrm<CabeceraTablero>(`/api/crm/pipelines/${o.pipelineId}/board?${p.toString()}`, { signal: control.signal })
      .then(({ data }) => {
        if (control.signal.aborted || marca !== epoca.current) return;
        setCabecera(data);
        setError(null);
        setTablero(Object.fromEntries(data.etapas.map((e) => [e.id, { ...COLUMNA_VACIA }])));
        data.etapas.forEach((e) => void cargarColumna(e.id, 1, control.signal));
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e);
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
  }, [o.pipelineId, o.query, o.periodo, recarga, cargarColumna]);

  useEffect(() => {
    const oir = (ev: Event) => {
      const detalle = (ev as CustomEvent<DetalleCambioCrm>).detail;
      if (detalle?.entidad === 'opportunity' && recargaDeTablero(detalle.accion) === 'silenciosa') {
        void refrescarCabecera();
        return;
      }
      recargar();
    };
    window.addEventListener(EVENTO_CAMBIO_CRM, oir);
    return () => window.removeEventListener(EVENTO_CAMBIO_CRM, oir);
  }, [recargar, refrescarCabecera]);

  /** Optimista: guarda cómo estaba para poder revertir si el servidor rechaza. */
  const mover = useCallback(
    (id: string, destino: string) => {
      snapshots.current.set(id, tableroRef.current);
      const etapa = cabecera?.etapas.find((e) => e.id === destino) ?? null;
      setTablero((t) => moverEnTablero(t, id, destino, etapa));
    },
    [cabecera],
  );

  const revertir = useCallback((id: string) => {
    const previo = snapshots.current.get(id);
    snapshots.current.delete(id);
    if (previo) setTablero(previo);
  }, []);

  const olvidar = useCallback((id: string) => snapshots.current.delete(id), []);

  const cargarMas = useCallback((etapaId: string) => void cargarColumna(etapaId, (tableroRef.current[etapaId]?.pagina ?? 0) + 1), [cargarColumna]);

  return { cabecera, cargando, error, tablero, recargar, mover, revertir, olvidar, cargarMas, reintentarColumna: (id: string) => void cargarColumna(id, 1) };
}
