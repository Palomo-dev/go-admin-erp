'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  aplanarAlertas,
  cifrasAlertas,
  type FilaAlerta,
  type ResultadoRevision,
  type ResumenDeteccion,
  type RevisionAlerta,
} from '@/lib/services/integrations/openFinance/alertasBancarias';

/**
 * Alertas de cuentas de dinero (pestaña «Alertas» de Bancos). La organización
 * sale de la sesión en el servidor: aquí no se manda.
 */

interface RespuestaAlertas extends ResumenDeteccion {
  revisiones?: RevisionAlerta[];
  revisionesDisponibles?: boolean;
}

export type EstadoCarga = 'cargando' | 'listo' | 'error';

export interface PeticionRevision {
  motivo: string;
  resultado: ResultadoRevision;
  movimientoAnuladoId?: number | null;
}

/** Resultado de guardar: el código de error viene del servidor (`revision_no_disponible`, `ya_revisada`…). */
export type ResultadoGuardar = { ok: true; revision: RevisionAlerta } | { ok: false; codigo: string };

export function useAlertasBancarias() {
  const [datos, setDatos] = useState<RespuestaAlertas | null>(null);
  const [estado, setEstado] = useState<EstadoCarga>('cargando');

  const cargar = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/integrations/open-finance/anomalies');
      const json = (await res.json().catch(() => null)) as { success?: boolean; data?: RespuestaAlertas } | null;
      if (!res.ok || !json?.success || !json.data) {
        setEstado('error');
        return false;
      }
      setDatos(json.data);
      setEstado('listo');
      return true;
    } catch {
      setEstado('error');
      return false;
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const recargar = useCallback(async () => {
    setEstado((e) => (e === 'error' ? 'cargando' : e));
    return cargar();
  }, [cargar]);

  const filas: FilaAlerta[] = useMemo(() => aplanarAlertas(datos, datos?.revisiones ?? []), [datos]);
  const cifras = useMemo(() => cifrasAlertas(filas), [filas]);

  /** Guarda la revisión y la pinta en la fila sin volver a calcular todas las alertas. */
  const guardarRevision = useCallback(async (fila: FilaAlerta, peticion: PeticionRevision): Promise<ResultadoGuardar> => {
    try {
      const res = await fetch('/api/integrations/open-finance/anomalies/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clave: fila.clave,
          tipo: fila.tipo,
          cuentaId: fila.cuentaId,
          motivo: peticion.motivo,
          resultado: peticion.resultado,
          movimientoAnuladoId: peticion.movimientoAnuladoId ?? null,
        }),
      });
      const json = (await res.json().catch(() => null)) as { success?: boolean; data?: RevisionAlerta; error?: string } | null;
      if (!res.ok || !json?.success || !json.data) {
        const codigo = typeof json?.error === 'string' && /^[a-z_]+$/.test(json.error) ? json.error : 'desconocido';
        if (codigo === 'revision_no_disponible') {
          setDatos((d) => (d ? { ...d, revisionesDisponibles: false } : d));
        }
        return { ok: false, codigo };
      }
      const revision = json.data;
      setDatos((d) => (d ? { ...d, revisiones: [revision, ...(d.revisiones ?? []).filter((r) => r.clave !== revision.clave)] } : d));
      return { ok: true, revision };
    } catch {
      return { ok: false, codigo: 'desconocido' };
    }
  }, []);

  return {
    filas,
    cifras,
    estado,
    /** `false` mientras la migración de revisiones no esté aplicada. */
    revisionesDisponibles: datos?.revisionesDisponibles !== false,
    recargar,
    guardarRevision,
  };
}

export type AlertasBancarias = ReturnType<typeof useAlertasBancarias>;
