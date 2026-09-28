'use client';

/**
 * Resumen de una caja leído del servidor (`CajasService.getResumen` →
 * `GET /api/pos/cajas/[id]/resumen`), con la máscara del cierre ciego ya
 * aplicada. Lo usan el detalle, «Mi caja», el arqueo, el movimiento y el cierre.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResumenCaja } from '@/lib/pos/cajas/resumenServidor';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { CajasService, ErrorCaja } from './CajasService';
import type { CashSession } from './types';

export type ResumenCajaCliente = ResumenCaja & { sinRed?: boolean };

export interface EstadoResumenCaja {
  resumen: ResumenCajaCliente | null;
  cargando: boolean;
  /** Código traducible (`cajas.errores.*`) o `null`. */
  error: string | null;
  recargar: () => Promise<void>;
}

export function useResumenCaja(
  idOUuid: string | number | null | undefined,
  opciones: { ventas?: boolean; sesionLocal?: CashSession | null; activo?: boolean } = {},
): EstadoResumenCaja {
  const { organization } = useOrganization();
  const [resumen, setResumen] = useState<ResumenCajaCliente | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const vigente = useRef(0);
  const { ventas, sesionLocal, activo = true } = opciones;

  const recargar = useCallback(async () => {
    if (idOUuid === null || idOUuid === undefined || idOUuid === '' || !organization?.id || !activo) return;
    const turno = ++vigente.current;
    setError(null);
    try {
      const r = await CajasService.getResumen(idOUuid, { ventas, sesionLocal: sesionLocal ?? undefined });
      if (turno === vigente.current) setResumen(r);
    } catch (e) {
      console.error('[useResumenCaja]', e);
      if (turno === vigente.current) setError(e instanceof ErrorCaja ? e.codigo : 'lectura_fallida');
    } finally {
      if (turno === vigente.current) setCargando(false);
    }
  }, [idOUuid, organization?.id, ventas, sesionLocal, activo]);

  useEffect(() => {
    setCargando(true);
    void recargar();
  }, [recargar]);

  return { resumen, cargando, error, recargar };
}
