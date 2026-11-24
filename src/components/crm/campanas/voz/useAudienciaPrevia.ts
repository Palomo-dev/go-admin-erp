'use client';

/**
 * Vista previa de la audiencia (paso 2): cada vez que cambia a quién se llama
 * pide `POST /api/crm/voice-agents/campaigns/preview-audience`, con 400 ms de
 * espera para no disparar una consulta por tecla. Conserva el último resultado
 * mientras recalcula.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { AudienciaPrevia } from '@/lib/services/crm/campanaVozAudiencia';
import { configAudiencia, type FormAsistente } from './asistenteVozLogica';

export interface AudienciaEstado {
  estado: 'inactiva' | 'cargando' | 'error' | 'lista';
  datos: AudienciaPrevia | null;
  /** Hora local en que se calculó («9:41»). */
  hora: string | null;
  recargar: () => void;
}

const ESPERA_MS = 400;

export function useAudienciaPrevia(
  form: Pick<FormAsistente, 'fuente' | 'stageId' | 'customerIds' | 'stepId'>,
  formatearHora: (d: Date) => string,
): AudienciaEstado {
  const config = configAudiencia(form);
  const clave = config ? JSON.stringify([form.fuente, config]) : null;
  const [estado, setEstado] = useState<AudienciaEstado['estado']>('inactiva');
  const [datos, setDatos] = useState<AudienciaPrevia | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const formatear = useRef(formatearHora);
  formatear.current = formatearHora;

  useEffect(() => {
    if (!clave) {
      setEstado('inactiva');
      setDatos(null);
      return;
    }
    const [fuente, target_config] = JSON.parse(clave) as [string, Record<string, unknown>];
    const ctrl = new AbortController();
    setEstado('cargando');
    const espera = setTimeout(() => {
      pedirCrm<AudienciaPrevia>('/api/crm/voice-agents/campaigns/preview-audience', {
        method: 'POST',
        cuerpo: { target_source: fuente, target_config },
        signal: ctrl.signal,
      })
        .then(({ data }) => {
          setDatos(data);
          setHora(formatear.current(new Date()));
          setEstado('lista');
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          setEstado('error');
        });
    }, ESPERA_MS);
    return () => {
      clearTimeout(espera);
      ctrl.abort();
    };
  }, [clave, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { estado, datos: clave ? datos : null, hora, recargar };
}
