'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { healthScoreService, type HealthScoreResult, type ScoreHace, type TendenciaSemanal } from '@/lib/services/crm/healthScoreService';
import { logError } from '@/lib/utils/errorMessage';
import { aFilaSalud, resumenBandas, resumenTendencia, type FilaSalud } from './saludLogica';

/**
 * Datos de la lista priorizada (Figma 1415:19). Tres lecturas con RLS:
 * `fn_customer_health` + config (el puntaje), `fn_health_score_hace` («Cambio
 * 30 d») y `fn_health_tendencia_org` (tarjeta de tendencia). Si falla solo la
 * tendencia o el cambio, la lista sigue visible (anotación 1424:841630).
 */
export function useSaludPanel(organizationId: number, timezone: string) {
  const [resultados, setResultados] = useState<HealthScoreResult[]>([]);
  const [hace, setHace] = useState<Map<string, ScoreHace>>(new Map());
  const [semanas, setSemanas] = useState<TendenciaSemanal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [recargando, setRecargando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [errorTendencia, setErrorTendencia] = useState(false);
  const primera = useRef(true);

  const cargar = useCallback(async () => {
    if (!organizationId) return;
    if (primera.current) setCargando(true);
    setRecargando(true);
    setError(null);
    const [panel, cambios, tendencia] = await Promise.allSettled([
      healthScoreService.getPanelSalud(organizationId),
      healthScoreService.getScoresHace(30, null, organizationId),
      healthScoreService.getTendenciaOrg(timezone, 12, organizationId),
    ]);
    if (panel.status === 'fulfilled') setResultados(panel.value);
    else {
      logError('[Salud] cargar panel', panel.reason);
      setError(panel.reason);
    }
    if (cambios.status === 'fulfilled') setHace(cambios.value);
    else logError('[Salud] cargar cambio 30 d', cambios.reason);
    if (tendencia.status === 'fulfilled') {
      setSemanas(tendencia.value);
      setErrorTendencia(false);
    } else {
      logError('[Salud] cargar tendencia', tendencia.reason);
      setErrorTendencia(true);
    }
    primera.current = false;
    setCargando(false);
    setRecargando(false);
  }, [organizationId, timezone]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filas: FilaSalud[] = useMemo(() => resultados.map((r) => aFilaSalud(r, hace.get(r.customer_id))), [resultados, hace]);
  /** Último recálculo del puntaje en la organización (máximo de `customers.health_score_updated_at`). */
  const ultimoCalculo = useMemo(() => {
    let max: string | null = null;
    for (const r of resultados) {
      const at = r.cliente?.health_score_updated_at;
      if (at && (!max || new Date(at).getTime() > new Date(max).getTime())) max = at;
    }
    return max;
  }, [resultados]);
  const resumen = useMemo(() => resumenBandas(filas), [filas]);
  const tendencia = useMemo(() => resumenTendencia(semanas), [semanas]);

  return { resultados, filas, resumen, tendencia, ultimoCalculo, errorTendencia, cargando, recargando, error, recargar: cargar };
}
